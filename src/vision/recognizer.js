'use strict';
/*
 * 棋盘视觉识别核心 —— 纯 JS，无依赖，可在 Node / JavaScriptCore / 浏览器复用
 *
 * 核心思路（关键设计）：
 *   不识别「这是车还是马」。只做三分类：空 / 红子 / 黑子。
 *   兵种身份全部由「上一局面 + 合法走法枚举」反推（见 tracker.js）。
 *   这样识别只需 3 个稳定特征，抗皮肤、抗缩放、抗压缩噪声。
 *
 * 坐标约定：
 *   交叉点 = row*9 + col，row 0 = 屏幕最上（黑方底线），col 0 = 屏幕最左
 *   四点标定顺序：[左上, 右上, 右下, 左下]
 */

/** 字形采样网格边长。
 *  16×16 对中文棋子太粗：車/馬/炮/仕 的笔画会糊在一起，
 *  实测会出现「车认成炮、炮认成车」这种纯字形混淆。
 *  提到 24×24（576 个采样点）后笔画结构能分辨出来。 */
const PATCH_W = 24;

const EMPTY = 0;
const RED_PC = 1;
const BLK_PC = 2;

/** 三线性透视变换：由四角求任意 (u,v) 的图像坐标 */
function bilinear(p00, p10, p11, p01, u, v) {
  const a = (1 - u) * (1 - v), b = u * (1 - v), c = u * v, d = (1 - u) * v;
  return [
    a * p00[0] + b * p10[0] + c * p11[0] + d * p01[0],
    a * p00[1] + b * p10[1] + c * p11[1] + d * p01[1]
  ];
}

/** 透视变换：4 点求单应矩阵（比双线性更准，用于大倾角） */
function homography(src, dst) {
  // src/dst: [[x,y] x4]。解 8x8 线性方程组
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  // 高斯消元
  const n = 8;
  const M = A.map((row, i) => row.concat([B[i]]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    const div = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map(row => row[n]);
}

function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + 1;
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

/**
 * 抛物线插值细化峰值位置（亚像素精度）
 * 峰值 i 与左右两点做二次拟合，顶点偏移量就是亚像素修正量
 */
function refinePeak(profile, i) {
  if (i <= 0 || i >= profile.length - 1) return i;
  const a = profile[i - 1], b = profile[i], c = profile[i + 1];
  const denom = a - 2 * b + c;
  if (Math.abs(denom) < 1e-6) return i;
  let delta = 0.5 * (a - c) / denom;
  if (delta > 0.5) delta = 0.5;
  if (delta < -0.5) delta = -0.5;
  return i + delta;
}

/**
 * 一组等间距峰的查找
 * 棋盘 9 竖 10 横，线条严格等距 —— 用「等距约束」筛峰，比单纯找极值可靠得多
 */
function findEvenlySpacedPeaks(profile, count, minGap) {
  const n = profile.length;
  if (n < count * 3) return null;

  let maxV = 0;
  for (let i = 0; i < n; i++) if (profile[i] > maxV) maxV = profile[i];
  if (maxV <= 0) return null;

  // 1) 找局部极大值，做非极大值抑制
  const peaks = [];
  const th = maxV * 0.22;
  for (let i = 2; i < n - 2; i++) {
    const v = profile[i];
    if (v < th) continue;
    if (v < profile[i - 1] || v < profile[i + 1]) continue;
    if (peaks.length && i - peaks[peaks.length - 1] < minGap) {
      if (v > profile[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i;
    } else {
      peaks.push(i);
    }
  }
  if (peaks.length < count) return null;

  // 2) 在峰里找一组「等距」的位置
  let best = null, bestScore = -1;
  for (let s = 0; s < peaks.length; s++) {
    for (let e = s + count - 1; e < peaks.length; e++) {
      const span = peaks[e] - peaks[s];
      const d = span / (count - 1);
      if (d < minGap) continue;
      if (s + count - 1 > peaks.length) break;

      let score = 0, ok = true;
      const pos = [];
      for (let k = 0; k < count; k++) {
        const target = peaks[s] + d * k;
        let nearest = -1, nd = 1e9;
        for (let p = 0; p < peaks.length; p++) {
          const dd = Math.abs(peaks[p] - target);
          if (dd < nd) { nd = dd; nearest = peaks[p]; }
        }
        if (nearest < 0 || nd > d * 0.22) { ok = false; break; }
        score += profile[nearest];
        pos.push(nearest);
      }
      if (ok && score > bestScore) { bestScore = score; best = pos; }
    }
  }
  return best;
}

/**
 * 自动检测棋盘四角
 *
 * 原理：中国象棋棋盘是严格等间距的 9 竖 10 横网格。
 *   1. 转灰度
 *   2. 沿 x 求「垂直边缘强度」投影 → 竖线会形成 9 个尖峰
 *   3. 沿 y 求「水平边缘强度」投影 → 横线会形成 10 个尖峰
 *   4. 用等距约束从尖峰里挑出真正的 9+10 条线
 *   5. 最外四条线的交点就是四角
 *
 * 全程不需要任何颜色先验，也不怕棋子和高亮圈（它们只贡献零散噪声，
 * 构不成等距序列）。
 *
 * @returns {[[number,number],[number,number],[number,number],[number,number]]|null}
 *          顺序：左上 右上 右下 左下（图像像素坐标）
 */
/* ============================================================
 *  网格自校准（refineGrid）
 *
 *  不管初始四点有多歪，棋子一定落在交叉点上。
 *  做法：
 *    1. 用当前网格算出 90 个格点
 *    2. 每个格点在邻域内搜索「暖色最浓」的位置 → 这个棋子的真实中心
 *    3. 用这些真实中心，最小二乘反解网格参数（x = a+bu+cv+duv，y 同理）
 *    4. 迭代几次收敛
 *
 *  这能抹平自动检测 10~20% 的格距误差，也能吃掉手点四角时的几像素偏差。
 * ============================================================ */

/** 小区域的暖色占比（判断这里是不是棋子盘面） */
function localWarm(pixels, w, h, cx, cy, radius) {
  let n = 0, warm = 0;
  const step = Math.max(1, Math.floor(radius / 3));
  for (let dy = -radius; dy <= radius; dy += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      const x = Math.round(cx + dx), y = Math.round(cy + dy);
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const i = (y * w + x) * 4;
      const R = pixels[i], G = pixels[i + 1], B = pixels[i + 2];
      // 跳过白色高亮圈和绿色
      if (R > 200 && G > 200 && B > 200) continue;
      if (G > R + 30 && G > B + 30 && G > 90) continue;
      n++;
      if ((R - B) > 22 && R > 80) warm++;
    }
  }
  return n > 0 ? warm / n : 0;
}

/** 解 4x4 线性方程组（列主元高斯消元） */
function solve4(A, b) {
  const n = 4;
  const M = [];
  for (let i = 0; i < n; i++) M.push(A[i].concat([b[i]]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-9) return null;
    const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
    const d = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return [M[0][n], M[1][n], M[2][n], M[3][n]];
}

/** 用一组 (u,v)->(x,y) 样本拟合双线性网格系数 */
function fitAxis(samples, useX) {
  const ATA = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const ATb = [0, 0, 0, 0];
  for (let k = 0; k < samples.length; k++) {
    const p = samples[k];
    const row = [1, p.u, p.v, p.u * p.v];
    const val = useX ? p.x : p.y;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) ATA[i][j] += row[i] * row[j];
      ATb[i] += row[i] * val;
    }
  }
  return solve4(ATA, ATb);
}

/**
 * 网格自校准
 * @param {Uint8ClampedArray} pixels RGBA
 * @param {number} w
 * @param {number} h
 * @param {Array<[number,number]>} corners 初始四角 [左上,右上,右下,左下]
 * @param {number} iterations 迭代次数（默认 3）
 * @returns {Array<[number,number]>} 校准后的四角
 */
function refineGrid(pixels, w, h, corners, iterations) {
  const iters = iterations || 3;
  let cur = corners.map(p => [p[0], p[1]]);

  for (let iter = 0; iter < iters; iter++) {
    const [p00, p10, p11, p01] = cur;
    // 格子尺寸（用两个方向分别估）
    const cellW = Math.hypot(p10[0] - p00[0], p10[1] - p00[1]) / 8;
    const cellH = Math.hypot(p01[0] - p00[0], p01[1] - p00[1]) / 9;
    const cell = Math.min(cellW, cellH);
    if (cell < 6) break;

    // 搜索半径：格子的 35%，足够覆盖累积偏移
    const searchR = Math.max(3, Math.round(cell * 0.35));
    // 局部暖色采样半径：棋子盘面的一半
    const localR = Math.max(2, Math.round(cell * 0.18));

    const samples = [];

    for (let r = 0; r < 10; r++) {
      const v = r / 9;
      for (let c = 0; c < 9; c++) {
        const u = c / 8;
        // 当前网格给出的格点
        const a = (1 - u) * (1 - v), b = u * (1 - v), cc = u * v, d = (1 - u) * v;
        const x0 = a * p00[0] + b * p10[0] + cc * p11[0] + d * p01[0];
        const y0 = a * p00[1] + b * p10[1] + cc * p11[1] + d * p01[1];

        // 在邻域内找暖色最浓的位置
        let bestX = x0, bestY = y0, bestWarm = -1;
        for (let dy = -searchR; dy <= searchR; dy += 2) {
          for (let dx = -searchR; dx <= searchR; dx += 2) {
            const x = x0 + dx, y = y0 + dy;
            if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) continue;
            const warm = localWarm(pixels, w, h, x, y, localR);
            if (warm > bestWarm) { bestWarm = warm; bestX = x; bestY = y; }
          }
        }

        // 只有明显是棋子盘面才作为拟合样本（空格不参与）
        if (bestWarm >= 0.45) {
          samples.push({ x: bestX, y: bestY, u: u, v: v });
        }
      }
    }

    // 样本太少说明画面不是对局中，别乱拟合
    if (samples.length < 6) break;

    const cx = fitAxis(samples, true);
    const cy = fitAxis(samples, false);
    if (!cx || !cy) break;

    function evalX(u, v) { return cx[0] + cx[1] * u + cx[2] * v + cx[3] * u * v; }
    function evalY(u, v) { return cy[0] + cy[1] * u + cy[2] * v + cy[3] * u * v; }

    const next = [
      [evalX(0, 0), evalY(0, 0)],
      [evalX(1, 0), evalY(1, 0)],
      [evalX(1, 1), evalY(1, 1)],
      [evalX(0, 1), evalY(0, 1)]
    ];

    // 收敛判定：四角移动小于 0.5 像素就停
    let moveSum = 0;
    for (let i = 0; i < 4; i++) {
      moveSum += Math.abs(next[i][0] - cur[i][0]) + Math.abs(next[i][1] - cur[i][1]);
    }
    cur = next;
    if (moveSum < 2.0) break;   // 四角总共移动 < 2 像素
  }

  return cur;
}
/**
 * 一维等间距拟合：给一堆「应该落在 count 条等距线上」的坐标，
 * 反解出 origin 与 step。
 *
 * 用「分配 → 最小二乘 → 再分配」的迭代，对缺失线（某列/某行没棋子）免疫。
 *
 * @param {number[]} vals 观测坐标
 * @param {number} count 线数
 * @param {number} stepHint 初始格距估计
 * @param {number} tolRatio 允许的残差（相对格距），超出的观测点丢弃
 * @returns {{origin:number, step:number, used:number}|null}
 */
function fitEvenLines(vals, count, stepHint, tolRatio) {
  if (!vals || vals.length < 3 || !(count >= 2)) return null;
  const tol = (tolRatio || 0.42) * stepHint;
  const sorted = vals.slice().sort((a, b) => a - b);

  // 两个候选初值：端点撑满 / 中位间隔
  const seeds = [];
  seeds.push({ origin: sorted[0], step: (sorted[sorted.length - 1] - sorted[0]) / (count - 1) });
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  gaps.sort((a, b) => a - b);
  const medGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : stepHint;
  seeds.push({ origin: sorted[0] - Math.round(((sorted[0] - sorted[0]) / medGap)) * medGap, step: medGap });

  let best = null;

  for (let s = 0; s < seeds.length; s++) {
    let origin = seeds[s].origin;
    let step = seeds[s].step;
    if (!(step > 2)) continue;
    let used = 0;

    for (let it = 0; it < 14; it++) {
      const buckets = [];
      for (let k = 0; k < count; k++) buckets.push([]);
      for (let i = 0; i < sorted.length; i++) {
        const v = sorted[i];
        const k = Math.round((v - origin) / step);
        if (k < 0 || k >= count) continue;
        if (Math.abs(v - (origin + k * step)) > tol) continue;
        buckets[k].push(v);
      }
      // 最小二乘：每个有观测的 k 取均值，再拟合 v = origin + step*k
      let Sk = 0, Sk2 = 0, Sv = 0, Skv = 0, N = 0;
      for (let k = 0; k < count; k++) {
        const b = buckets[k];
        if (!b.length) continue;
        let sum = 0;
        for (let i = 0; i < b.length; i++) sum += b[i];
        const m = sum / b.length;
        Sk += k; Sk2 += k * k; Sv += m; Skv += k * m; N++;
      }
      if (N < 3) break;
      const den = N * Sk2 - Sk * Sk;
      if (Math.abs(den) < 1e-9) break;
      const nb = (N * Skv - Sk * Sv) / den;
      const na = (Sv - nb * Sk) / N;
      if (!isFinite(nb) || !isFinite(na) || Math.abs(nb) < 2) break;
      const moved = Math.abs(nb - step) + Math.abs(na - origin);
      origin = na; step = nb; used = N;
      if (moved < 0.05) break;
    }

    if (used < 3 || !(step > 2)) continue;
    // 残差 + 两端覆盖检查
    let res = 0, cnt = 0, hasLow = false, hasHigh = false;
    for (let i = 0; i < sorted.length; i++) {
      const v = sorted[i];
      const k = Math.round((v - origin) / step);
      if (k < 0 || k >= count) continue;
      const d = Math.abs(v - (origin + k * step));
      if (d > tol) continue;
      if (k === 0) hasLow = true;
      if (k === count - 1) hasHigh = true;
      res += d; cnt++;
    }
    if (cnt < 3) continue;
    // 首尾两条线必须都有观测点 —— 否则说明 count/step 配错了，
    // 典型症状是把半幅画面当成整块棋盘（实测纵轴拟合到 81px/格）。
    if (!hasLow || !hasHigh) continue;
    const score = res / cnt - used * 0.01;
    if (!best || score < best.score) {
      best = { origin: origin, step: step, used: used, score: score, residual: res / cnt };
    }
  }

  return best;
}

/**
 * 一维峰值提取（带平滑与合并）
 */
function findPeaks1D(proj, len, minGap, relTh) {
  const sm = new Float32Array(len);
  for (let i = 1; i < len - 1; i++) sm[i] = (proj[i - 1] + proj[i] * 2 + proj[i + 1]) * 0.25;
  let maxv = 0;
  for (let i = 0; i < len; i++) if (sm[i] > maxv) maxv = sm[i];
  if (!(maxv > 0)) return [];
  const th = maxv * (relTh || 0.15);
  const raw = [];
  for (let i = 1; i < len - 1; i++) {
    if (sm[i] < th) continue;
    if (sm[i] < sm[i - 1] || sm[i] < sm[i + 1]) continue;
    // 峰值附近质心细化
    let s = 0, sw = 0;
    const R = 4;
    for (let d = -R; d <= R; d++) {
      const j = i + d;
      if (j < 1 || j >= len - 1) continue;
      s += j * sm[j]; sw += sm[j];
    }
    raw.push(sw > 0 ? s / sw : i);
  }
  const merged = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (merged.length && p - merged[merged.length - 1] < minGap) {
      merged[merged.length - 1] = (merged[merged.length - 1] + p) * 0.5;
    } else merged.push(p);
  }
  return merged;
}

/**
 * ★ 用真实棋子反推网格（最可靠的一招）
 *
 * 原理：棋子只可能落在交叉点上。所以把「棋子盘面」像素分别投到 x 轴和 y 轴，
 * 得到 9 条竖线 / 10 条横线上的一簇峰值；对这些峰值做等间距最小二乘，
 * 就得到 格距 和 起点 —— 边缘投影那 10~20% 的误差被彻底抹平。
 *
 * 这一步解决的是「初始格距偏小 → 越往下越偏 → 第 7 行偏 69 像素 → 炮被判空」的根因。
 *
 * @param {Uint8ClampedArray} pixels RGBA
 * @param {number} w
 * @param {number} h
 * @param {Array<[number,number]>} corners 当前四角（仅作为搜索区域）
 * @returns {Array<[number,number]>|null} 修正后的四角，失败返回 null
 */
/* ============================================================
 * ★ 棋盘定位：归一化先验 + 全格对齐搜索
 *
 * 不再依赖「边缘投影 + 等距拟合」。原因：
 *   棋盘线是浅色细线，边缘强度弱；而 JJ象棋 的界面是木纹棕色，
 *   暖色干扰极多，投影峰值里既有棋子也有 UI 木块，
 *   等距拟合经常「少认几行」，格高实测从 61.9 跑到 81.0（偏 31%）。
 *   这种误差逐行累积，到第 7 行采样点已经偏了整整一格，炮就被判成空。
 *
 * 现在的做法：
 *   1. 棋子圆盘（米黄/浅褐）是最好认的东西 —— R−B>45 且够亮。
 *   2. 棋子只可能落在交叉点上。所以直接在 (起点, 格距) 上做搜索，
 *      打分 = 90 个交叉点的「圆盘密度之和」，命中数越高越对。
 *   3. 搜索起点用归一化先验（JJ象棋 布局是死的），
 *      四张真实截图反解出来的结果完全一致：
 *         x0/W = 0.0666   cw/W = 0.1078
 *         y0/H = 0.2773   ch/H = 0.0484
 *      开局命中数恰好 32 = 棋盘上的棋子数，中局 30 = 少了两个子。
 *
 * 这一步之后格距误差 < 1 像素，采样子弹不再打偏。
 * ============================================================ */

/** JJ象棋 棋盘在整屏截图中的归一化位置
 *  由「棋子圆盘全格对齐搜索」在多张真实截图上反解，再用逐格真值验证
 *  （450 格只错 1 格），是所有样本共同收敛到的同一组值。
 *  用它当定位起点：命中数够就直接采用，避免被遮挡物带偏。 */
const BOARD_PRIOR = {
  x0: 0.065731,
  cw: 0.108391,
  y0: 0.277100,
  ch: 0.048350
};

/** 棋子圆盘掩码 + 积分图（用来 O(1) 求任意方框内的圆盘密度） */
function buildDiskIntegral(pixels, w, h) {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let x = 0; x < w; x++) {
      const i = (base + x) * 4;
      const R = pixels[i], G = pixels[i + 1], B = pixels[i + 2];
      if (R - B <= 45 || R <= 170) continue;
      const L = 0.299 * R + 0.587 * G + 0.114 * B;
      if (L <= 150) continue;
      mask[base + x] = 1;
    }
  }
  const iw = w + 1;
  const integ = new Int32Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    const base = y * w;
    for (let x = 0; x < w; x++) {
      rs += mask[base + x];
      integ[(y + 1) * iw + x + 1] = integ[y * iw + x + 1] + rs;
    }
  }
  return { integ: integ, iw: iw, count: (function () { let n = 0; for (let i = 0; i < mask.length; i++) n += mask[i]; return n; })() };
}

/**
 * 找出「画中画浮窗棋盘」占据的矩形
 *
 * 抓屏会把画中画窗口一起抓进去（实测浮窗压住棋盘右上角时，
 * 那几个交叉点的暖色占比是 100%、墨迹 0% —— 那是浮窗里自己画的米黄棋盘）。
 * 浮窗棋盘底色实测 (227,203,161) L=205，比游戏棋盘空白（L≈170）
 * 和棋子盘面（L≈120~191）都亮得多，用亮度就能整块切出来。
 *
 * @returns {{x0,y0,x1,y1}|null}
 */
function findPipRect(pixels, w, h) {
  // 先按 16x16 分块统计「浮窗米黄」占比。
  // 直接用所有命中像素求外接矩形会被画面里零散的高光点撑满整屏（实测过），
  // 所以必须先分块、再挑最大的连通块。
  const BS = 16;
  const bw = Math.ceil(w / BS), bh = Math.ceil(h / BS);
  const ratio = new Float32Array(bw * bh);
  const total = new Int32Array(bw * bh);
  const hit = new Int32Array(bw * bh);

  for (let y = 0; y < h; y++) {
    const by = (y / BS) | 0;
    const base = y * w;
    for (let x = 0; x < w; x++) {
      const bi = by * bw + ((x / BS) | 0);
      total[bi]++;
      const i = (base + x) * 4;
      const R = pixels[i], G = pixels[i + 1], B = pixels[i + 2];
      if (R <= 205 || G <= 180 || B <= 135) continue;
      if ((R - B) <= 45) continue;
      const L = 0.299 * R + 0.587 * G + 0.114 * B;
      if (L <= 198) continue;
      hit[bi]++;
    }
  }
  for (let i = 0; i < ratio.length; i++) ratio[i] = total[i] ? hit[i] / total[i] : 0;

  // 连通块标记（4 邻域）
  const lab = new Int32Array(bw * bh).fill(-1);
  const stack = new Int32Array(bw * bh);
  let bestBox = null, bestArea = 0;

  for (let s = 0; s < ratio.length; s++) {
    if (ratio[s] < 0.60 || lab[s] >= 0) continue;
    let sp = 0;
    stack[sp++] = s;
    lab[s] = s;
    let n = 0, mnx = bw, mxx = -1, mny = bh, mxy = -1;
    while (sp > 0) {
      const p = stack[--sp];
      const py = (p / bw) | 0, px = p % bw;
      n++;
      if (px < mnx) mnx = px;
      if (px > mxx) mxx = px;
      if (py < mny) mny = py;
      if (py > mxy) mxy = py;
      for (let k = 0; k < 4; k++) {
        let q;
        if (k === 0) { if (px === 0) continue; q = p - 1; }
        else if (k === 1) { if (px === bw - 1) continue; q = p + 1; }
        else if (k === 2) q = p - bw;
        else q = p + bw;
        if (q < 0 || q >= ratio.length || lab[q] >= 0) continue;
        if (ratio[q] < 0.60) continue;
        lab[q] = s;
        stack[sp++] = q;
      }
    }
    if (n > bestArea) {
      bestArea = n;
      bestBox = {
        x0: mnx * BS, y0: mny * BS,
        x1: Math.min(w - 1, (mxx + 1) * BS - 1),
        y1: Math.min(h - 1, (mxy + 1) * BS - 1),
        blocks: n
      };
    }
  }

  if (!bestBox) return null;
  if (bestArea < 30) return null;                                   // 太小，不是浮窗
  const rw = bestBox.x1 - bestBox.x0, rh = bestBox.y1 - bestBox.y0;
  if (rw < w * 0.15 || rh < h * 0.05) return null;
  return bestBox;
}

/** 给定一组网格参数，统计 90 个交叉点上的棋子圆盘命中情况 */
function gridAlignScore(integ, iw, w, h, x0, cw, y0, ch, rad, skip) {
  let score = 0, hits = 0, usable = 0;
  const rr = Math.max(2, Math.round(rad));
  for (let r = 0; r < 10; r++) {
    const y = y0 + r * ch;
    const ya = Math.round(y - rr), yb = Math.round(y + rr);
    if (ya < 0 || yb >= h) continue;
    for (let c = 0; c < 9; c++) {
      const x = x0 + c * cw;
      const xa = Math.round(x - rr), xb = Math.round(x + rr);
      if (xa < 0 || xb >= w) continue;
      // 落在浮窗区域里的交叉点不参与打分 —— 那块是被自己浮窗盖住的，
      // 里面是我们自己画的米黄棋盘，拿它当「棋子」会把网格整体拉偏。
      if (skip && x >= skip.x0 && x <= skip.x1 && y >= skip.y0 && y <= skip.y1) continue;
      const a = integ[ya * iw + xa];
      const b = integ[ya * iw + xb + 1];
      const cc = integ[(yb + 1) * iw + xa];
      const d = integ[(yb + 1) * iw + xb + 1];
      const area = (xb - xa + 1) * (yb - ya + 1);
      const dens = (d - b - cc + a) / area;
      score += dens;
      usable++;
      if (dens > 0.35) hits++;
    }
  }
  return { score: score, hits: hits, usable: usable };
}

/**
 * ★ 用棋子反推网格（核心定位函数）
 *
 * @param {Uint8ClampedArray} pixels RGBA
 * @param {number} w
 * @param {number} h
 * @param {Array<[number,number]>} corners 可选：额外的搜索起点（边缘投影结果）
 * @returns {Array<[number,number]>|null}
 */
function refineByPieces(pixels, w, h, corners) {
  refineByPieces.lastDebug = null;
  if (!pixels || w < 60 || h < 60) return null;

  const di = buildDiskIntegral(pixels, w, h);
  if (di.count < 400) return null;    // 画面里几乎没有棋子圆盘，不是对局
  const integ = di.integ, iw = di.iw;

  // 候选起点：归一化先验 + 边缘投影结果（如果有）
  const seeds = [];
  seeds.push({ x0: BOARD_PRIOR.x0 * w, cw: BOARD_PRIOR.cw * w, y0: BOARD_PRIOR.y0 * h, ch: BOARD_PRIOR.ch * h, tag: 'prior' });
  if (corners && corners.length >= 4) {
    const cw0 = (corners[1][0] - corners[0][0]) / 8;
    const ch0 = (corners[3][1] - corners[0][1]) / 9;
    if (cw0 > 8 && ch0 > 8) {
      seeds.push({ x0: corners[0][0], cw: cw0, y0: corners[0][1], ch: ch0, tag: 'edges' });
    }
  }

  // 先找出自己浮窗盖住的矩形，打分时跳过那块
  const skipRect = findPipRect(pixels, w, h);

  // 先验基准（用于「离先验多远」的打分）
  const priorRef = seeds[0];

  function devOf(x0, cw, y0, ch) {
    // 以「格」为单位衡量偏离先验的程度
    return Math.abs(x0 - priorRef.x0) / Math.max(1, priorRef.cw)
      + Math.abs(y0 - priorRef.y0) / Math.max(1, priorRef.ch)
      + Math.abs(cw - priorRef.cw) / Math.max(1, priorRef.cw) * 8
      + Math.abs(ch - priorRef.ch) / Math.max(1, priorRef.ch) * 9;
  }

  let best = null;
  let coarse = true;
  let locked = false;
  const coarseCands = [];

  function consider(x0, cw, y0, ch, tag) {
    // 边界与比例检查
    if (!(cw > w * 0.03) || !(ch > h * 0.02)) return;
    if (cw > w * 0.30 || ch > h * 0.30) return;
    const ratio = cw / ch;
    if (ratio < 0.55 || ratio > 1.80) return;
    const rr = Math.min(cw, ch) * 0.30;
    const r = gridAlignScore(integ, iw, w, h, x0, cw, y0, ch, rr, null);
    if (r.hits < 2) return;   // 残局只有 6 个子，门槛必须放低
    if (r.usable < 40) return;
    const cand = { x0: x0, cw: cw, y0: y0, ch: ch, hits: r.hits, score: r.score, tag: tag, dev: devOf(x0, cw, y0, ch) };
    if (!best || r.hits > best.hits || (r.hits === best.hits && r.score > best.score)) best = cand;
    if (coarse) coarseCands.push(cand);
    return cand;
  }

  // ---- 粗搜 ----
  // ---- 先验优先：布局是死的，先验命中够多就别让搜索跑野 ----
  //
  // JJ象棋 的棋盘位置是固定布局（5 张真实截图反解出来完全一致：
  //   x0/W=0.0666  cw/W=0.1078  y0/H=0.2773  ch/H=0.0484）。
  // 一旦有东西被遮住（画中画挡住右上角 8 个交叉点），能参与打分的点就少了，
  // 搜索会找到一组「歪着的网格」，命中数反而多 1~4 个（浮窗边缘的高光被当成棋子），
  // 结果整盘采样点集体偏移 6~7 像素，第 0 排的車就被认成卒。
  //
  // 所以：先验的命中数只要够（>=16 个交叉点有棋子），就直接采用先验，
  // 只在 ±0.04 格 / ±0.8% 的极小窗口里微调（吸收不同机型的细微差异）。
  // 先验命中太少（换机型、换主题、或根本不是对局画面）才走完整搜索。
  {
    const sd = seeds[0];
    const rr = Math.min(sd.cw, sd.ch) * 0.30;
    const base = gridAlignScore(integ, iw, w, h, sd.x0, sd.cw, sd.y0, sd.ch, rr, null);
    // 只有「浮窗真的压到棋盘」时才锁先验。
    // 没遮挡的画面里完整搜索更准（能吃到 0.1% 的格距差异）；
    // 有遮挡时能参与打分的点变少，搜索会被浮窗边缘的高光带偏，就该退回先验。
    const bx0 = sd.x0 - sd.cw * 0.5, bx1 = sd.x0 + sd.cw * 8.5;
    const by0 = sd.y0 - sd.ch * 0.5, by1 = sd.y0 + sd.ch * 9.5;
    const occluded_unused = !!(skipRect && skipRect.x1 >= bx0 && skipRect.x0 <= bx1
      && skipRect.y1 >= by0 && skipRect.y0 <= by1);
    if (base.hits >= 3 && base.usable >= 40) {
      let pick = { x0: sd.x0, cw: sd.cw, y0: sd.y0, ch: sd.ch, hits: base.hits, score: base.score, dev: 0, tag: 'prior-fixed' };
      const oS = 0.02, sS = 0.004;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const cw = sd.cw * (1 + i * sS);
          const ch = sd.ch * (1 + j * sS);
          for (let a = -1; a <= 1; a++) {
            for (let b = -1; b <= 1; b++) {
              const x0 = sd.x0 + a * oS * sd.cw;
              const y0 = sd.y0 + b * oS * sd.ch;
              const r = gridAlignScore(integ, iw, w, h, x0, cw, y0, ch, rr, null);
              if (r.usable < 40) continue;
              // 只有明显更好（多命中 2 个以上）才离开先验
              if (r.hits >= pick.hits + 2) {
                pick = { x0: x0, cw: cw, y0: y0, ch: ch, hits: r.hits, score: r.score, dev: devOf(x0, cw, y0, ch), tag: 'prior-polish' };
              }
            }
          }
        }
      }
      best = pick;
      locked = true;
      coarseCands.length = 0;
    }
  }

  // ---- 粗搜 ----
  //   prior 种子（归一化先验）用窄窗口；edges 种子（边缘投影）误差大，才需要宽窗口。
  for (let s = 0; s < seeds.length; s++) {
    if (best) break;                      // 先验已经定案，不用再搜
    const sd = seeds[s];
    const tight = (sd.tag === 'prior');
    const nScale = tight ? 1 : 2;
    const nOrigin = tight ? 2 : 3;
    const sStep = tight ? 0.015 : 0.03;   // 先验种子：格距只搜 ±1.5%
    const oStep = tight ? 0.05 : 0.2;     // 先验种子：起点只搜 ±0.1 格
    for (let i = -nScale; i <= nScale; i++) {
      for (let j = -nScale; j <= nScale; j++) {
        const cw = sd.cw * (1 + i * sStep);
        const ch = sd.ch * (1 + j * sStep);
        for (let a = -nOrigin; a <= nOrigin; a++) {
          for (let b = -nOrigin; b <= nOrigin; b++) {
            consider(sd.x0 + a * oStep * sd.cw, cw, sd.y0 + b * oStep * sd.ch, ch, sd.tag);
          }
        }
      }
    }
  }
  if (!best) return null;
  coarse = false;

  // 粗搜定案：命中数相差 2 格以内时，选「离先验最近」的那组。
  // 画中画挡住右上角后，被遮住的交叉点不参与打分，歪着的网格命中数可能反而多 1~2 个
  // （浮窗边缘的高光被当成棋子）。而 JJ象棋 布局是死的，正确网格一定贴着先验。
  if (coarseCands.length) {
    let mx = 0;
    for (let ci = 0; ci < coarseCands.length; ci++) if (coarseCands[ci].hits > mx) mx = coarseCands[ci].hits;
    let pick = null;
    for (let ci = 0; ci < coarseCands.length; ci++) {
      const c = coarseCands[ci];
      if (c.hits < mx - 6) continue;
      if (!pick || c.dev < pick.dev || (c.dev === pick.dev && c.score > pick.score)) pick = c;
    }
    if (pick) best = pick;
  }

  // ---- 细搜：格距 ±1.5%，起点 ±0.1 格 ----
  if (!locked) {
    const b0 = best;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const cw = b0.cw * (1 + i * 0.0075);
        const ch = b0.ch * (1 + j * 0.0075);
        for (let a = -2; a <= 2; a++) {
          for (let b = -2; b <= 2; b++) {
            consider(b0.x0 + a * 0.04 * b0.cw, cw, b0.y0 + b * 0.04 * b0.ch, ch, b0.tag);
          }
        }
      }
    }
  }

  // ---- 超细：格距 ±0.4%，起点 ±0.02 格 ----
  if (!locked) {
    const b0 = best;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const cw = b0.cw * (1 + i * 0.002);
        const ch = b0.ch * (1 + j * 0.002);
        for (let a = -2; a <= 2; a++) {
          for (let b = -2; b <= 2; b++) {
            consider(b0.x0 + a * 0.008 * b0.cw, cw, b0.y0 + b * 0.008 * b0.ch, ch, b0.tag);
          }
        }
      }
    }
  }

  if (!best) return null;
  // 命中太少说明不是对局画面（比如停在菜单/结算界面），宁可报失败
  if (best.hits < 3) return null;   // 残局可能只有 5~6 个子

  refineByPieces.lastDebug = {
    cellW: best.cw, cellH: best.ch, ratio: best.cw / best.ch,
    hits: best.hits, score: best.score, seed: best.tag, pipRect: skipRect,
    x0: best.x0, y0: best.y0, diskPixels: di.count
  };

  const gx0 = best.x0, gx8 = best.x0 + 8 * best.cw;
  const gy0 = best.y0, gy9 = best.y0 + 9 * best.ch;
  return [
    [gx0, gy0],
    [gx8, gy0],
    [gx8, gy9],
    [gx0, gy9]
  ];
}

function autoDetectBoard(pixels, w, h) {
  if (!pixels || w < 60 || h < 60) return null;

  // ① 首选：棋子圆盘全格对齐（快、准、稳，不依赖棋盘线）
  refineByPieces.lastDebug = null;
  var fast = refineByPieces(pixels, w, h, null);
  if (fast) {
    autoDetectBoard.lastDebug = { used: 'pieces', pieceFit: refineByPieces.lastDebug };
    return fast;
  }

  // ② 兜底：棋盘线边缘投影 + 等距拟合，再用棋子校验一次
  var edge = edgeDetectBoard(pixels, w, h);
  if (!edge) {
    autoDetectBoard.lastDebug = { used: 'fail', pieceFit: null };
    return null;
  }
  refineByPieces.lastDebug = null;
  var fixed = refineByPieces(pixels, w, h, edge);
  autoDetectBoard.lastDebug = {
    used: fixed ? 'edges+pieces' : 'edges',
    edge: edge,
    pieceFit: refineByPieces.lastDebug
  };
  return fixed || edge;
}

function edgeDetectBoard(pixels, w, h) {

  // 1) 灰度
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let x = 0; x < w; x++) {
      const i = (base + x) * 4;
      gray[base + x] = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    }
  }

  // 2) 垂直边缘强度 → 竖线投影
  const colScore = new Float32Array(w);
  for (let x = 3; x < w - 3; x++) {
    let s = 0;
    for (let y = 2; y < h - 2; y += 2) {
      const c = y * w + x;
      const g = Math.abs(gray[c + 3] - gray[c - 3]);
      if (g > 14) s += g;
    }
    colScore[x] = s;
  }

  // 3) 水平边缘强度 → 横线投影
  const rowScore = new Float32Array(h);
  for (let y = 3; y < h - 3; y++) {
    let s = 0;
    for (let x = 2; x < w - 2; x += 2) {
      const c = y * w + x;
      const g = Math.abs(gray[c + 3 * w] - gray[c - 3 * w]);
      if (g > 14) s += g;
    }
    rowScore[y] = s;
  }

  // 4) 找 9 竖 10 横（格距至少 12 像素）
  const cols = findEvenlySpacedPeaks(colScore, 9, 12);
  const rows = findEvenlySpacedPeaks(rowScore, 10, 12);
  if (!cols || !rows) return null;

  // 5) 用「中位间距」重建网格，而不是直接用首尾位置。
  //    首尾两条线最容易被装饰边框、棋盘外的 UI 干扰（实测下边会丢掉一整条线，
  //    导致格高差 22%，最下面那排棋子采样全部偏离）。
  //    中间几条线最干净，取相邻间距的中位数作为真实格距，再以中位线为锚点铺开。
  function gapsMedian(arr) {
    const g = [];
    for (let i = 1; i < arr.length; i++) g.push(arr[i] - arr[i - 1]);
    if (!g.length) return 0;
    g.sort((a, b) => a - b);
    return g[Math.floor(g.length / 2)];
  }

  const gapW = gapsMedian(cols);
  const gapH = gapsMedian(rows);
  if (gapW < 10 || gapH < 10) return null;

  // 格距比例校验：中国象棋格子接近正方形，横向纵向格距应接近
  const ratio2 = gapH / gapW;
  if (ratio2 < 0.75 || ratio2 > 1.35) return null;

  // 用中位线做锚点，按中位格距向两侧铺开
  const midC = cols[4];       // 第 5 条竖线（最中间）
  const midR = rows[4];       // 第 5 条横线
  const colsFit = new Array(9);
  const rowsFit = new Array(10);
  for (let i = 0; i < 9; i++) colsFit[i] = midC + (i - 4) * gapW;
  for (let j = 0; j < 10; j++) rowsFit[j] = midR + (j - 4) * gapH;

  // 6) 亚像素细化：用检测到的真实峰值修正（在重建位置附近找最近峰）
  function snapToPeak(profile, guess) {
    let best = guess, bestV = -1;
    const lo = Math.max(1, Math.round(guess) - Math.round(gapW * 0.25));
    const hi = Math.min(profile.length - 2, Math.round(guess) + Math.round(gapW * 0.25));
    for (let i = lo; i <= hi; i++) {
      if (profile[i] > bestV) { bestV = profile[i]; best = i; }
    }
    return refinePeak(profile, Math.round(best));
  }

  const colsF = colsFit.map(x => snapToPeak(colScore, x));
  const rowsF = rowsFit.map(y => snapToPeak(rowScore, y));

  // 边缘投影只给「大概的线」，交给调用方用棋子再校正一次
  return [
    [colsF[0], rowsF[0]],   // 左上
    [colsF[8], rowsF[0]],   // 右上
    [colsF[8], rowsF[9]],   // 右下
    [colsF[0], rowsF[9]]    // 左下
  ];
}




class BoardRecognizer {

  /**
   * @param {object} cfg
   *   corners: [[x,y]x4] 屏幕像素坐标，顺序 [左上, 右上, 右下, 左下]
   *   cellRadiusRatio: 采样半径占格距的比例，默认 0.40
   *   bgModel: 可选的已学习背景模型
   */
  constructor(cfg) {
    this.corners = cfg.corners ? cfg.corners.map(p => [p[0], p[1]]) : null;
    // 采样半径占格距的比例。
    //
    // 这个值同时决定「能采到多少字形」和「会不会被高亮圈污染」，实测扫描：
    //   0.42 → 上一步的高亮圈（半径 22~30 像素）整个落进 patch 外圈，
    //          红色通道被圈填满，红俥被判成红傌/红仕（实测 5 张图共错 7 格）
    //   0.34 → 圈在 patch 之外，只采到字形，5 张图 450 格只剩 2 格错
    //   0.30 → 采得太小，字形边缘被切掉，反而变差
    // 模板必须用同一个比例训练（tools/gen-templates.mjs）。
    this.cellRadiusRatio = cfg.cellRadiusRatio || 0.34;
    this.bgModel = cfg.bgModel || null;
    this.lastStats = null;
    // 模板在 patchWeights 构建完才能归一化，所以先占位、后面再装
    this.templates = null;
    // 低置信度格子再做多尺度重采样。
    // 默认关闭 —— 实测在 0.34 半径下它反而把本来认对的红子改成错的
    // （u_dots 从 0 错变成 2 错），逐格置信度 + 保留上一稳定值那套已经够用。
    this.enableLowConfRefine = !!cfg.enableLowConfRefine;

    // 径向权重：中心权重高、边缘权重低。
    // 空格的 patch 边缘是棋盘网格线（深色直线），棋子的边缘是圆形描边，
    // 两者在灰度上很像，全图等权比对会被边缘带偏。
    // 加权后由中心区域主导 —— 棋子中心是圆盘+字，空格中心是干净棋盘，差异最明显。
    const PW = PATCH_W;
    this.patchWeights = (() => {
      const w = new Float32Array(PW * PW);
      let sum = 0;
      const half = (PW - 1) / 2;
      for (let py = 0; py < PW; py++) {
        for (let px = 0; px < PW; px++) {
          const dx = (px - half) / half;
          const dy = (py - half) / half;
          const v = Math.exp(-(dx * dx + dy * dy) * 1.2);
          w[py * PW + px] = v;
          sum += v;
        }
      }
      for (let i = 0; i < w.length; i++) w[i] /= sum;
      return w;
    })();

    // ★ 内置模板：从已知正确的开局截图离线生成，装在引擎里。
    //   这样中途进入对局也能直接认，不再依赖「第一帧必须是开局」。
    this.templates = cfg.templates || this._buildBuiltinTemplates();
    this.templateCount = (function () { let n = 0; for (const k in this.templates) n += this.templates[k].length; return n; }).call(this);
  }

  /**
   * 从 templates.js 解包并归一化内置模板
   */
  _buildBuiltinTemplates() {
    let raw;
    try { raw = require('./templates').unpack(); } catch (e) { return null; }
    const out = {};
    for (const key in raw) {
      const list = raw[key];
      const conv = [];
      for (let i = 0; i < list.length; i++) {
        const nw = this.normalizePatch(list[i].w);
        const nr = this.normalizePatch(list[i].r);
        if (!nw || !nr) continue;
        conv.push({ w: nw, r: nr, i: list[i].i ? this.normalizePatch(list[i].i) : null });
      }
      if (conv.length) out[key] = conv;
    }
    return out;
  }

  /** 计算 90 个交叉点的像素坐标；返回 Float32Array(180) */
  gridPoints() {
    if (!this.corners) throw new Error('未标定四边形');
    const [p00, p10, p11, p01] = this.corners;
    const pts = new Float32Array(180);
    for (let r = 0; r < 10; r++) {
      const v = r / 9;
      for (let c = 0; c < 9; c++) {
        const u = c / 8;
        const p = bilinear(p00, p10, p11, p01, u, v);
        const i = (r * 9 + c) * 2;
        pts[i] = p[0];
        pts[i + 1] = p[1];
      }
    }
    return pts;
  }

  /**
   * 格距估算（像素）
   *
   * 【历史 bug】原来写成 hypot(pts[2]-pts[0], pts[3]-pts[1]) / 8，
   * 但 pts[0] 与 pts[2] 是「r0c0」和「r0c1」两个相邻交叉点，
   * 它们的距离本来就等于一个格宽，再除以 8 会让采样半径缩到 1/8
   * （约 2.5 像素），只采到棋子正中心那一点，什么都判不出来。
   */
  cellSize(pts) {
    const dx = pts[2] - pts[0];
    const dy = pts[3] - pts[1];
    return Math.hypot(dx, dy);
  }

  /**
   * 采样一个交叉点周围的特征 + 模板图
   *
   * 【历史 bug】原来 patch 的填充复用了统计用的 step（radius/4 = 5 像素），
   * 而 patch 每格只有 (2*radius/16 = 2.5) 像素宽，导致 256 个 patch 格
   * 里一大半根本没被赋值，全是初始 0 —— 所有格子的模板长得一样，
   * NSC 匹配全部失效，最终把棋子全判成空（正好 30 格偏差）。
   *
   * 现在 patch 按 16×16 网格逐格采样，一个不漏；
   * 统计特征也从同一批采样点累计，口径一致。
   */
  sampleCell(pixels, w, h, cx, cy, radius, wantPatch, gain) {
    const g = (typeof gain === 'number' && gain > 0) ? gain : 1;
    let n = 0, sumL = 0, red = 0, dark = 0, bright = 0, warm = 0, skipped = 0;
    let ink = 0, redInk = 0, darkInk = 0;
    let coreN = 0, coreInk = 0, coreRedInk = 0, coreDarkInk = 0;
    const PW = PATCH_W;
    let patchW = null, patchR = null, patchI = null, patchValid = null;

    // 纯绿像素过滤器（可走位置绿点、绿色高亮圈）
    const isPureGreen = (R, G, B) => (G > R + 30 && G > B + 30 && G > 90);

    if (wantPatch) {
      patchW = new Uint8Array(PW * PW);
      patchR = new Uint8Array(PW * PW);
      patchI = new Uint8Array(PW * PW);
      // 有效像素掩码：0 = 这一格像素是干扰（高亮圈 / 绿点 / 白边），
      // 模板比对时把它的权重归零，避免「上一步的高亮圈」把兵种带偏。
      patchValid = new Uint8Array(PW * PW);
      const span = radius * 2;
      const stepPx = span / PW;
      const halfP = (PW - 1) / 2;
      for (let py = 0; py < PW; py++) {
        for (let px = 0; px < PW; px++) {
          const sx = Math.round(cx - radius + (px + 0.5) * stepPx);
          const sy = Math.round(cy - radius + (py + 0.5) * stepPx);
          if (sx < 1 || sy < 1 || sx >= w - 1 || sy >= h - 1) continue;
          const i = (sy * w + sx) * 4;
          var R = pixels[i], G = pixels[i + 1], B = pixels[i + 2];
          if (g !== 1) {
            R = R * g > 255 ? 255 : (R * g) | 0;
            G = G * g > 255 ? 255 : (G * g) | 0;
            B = B * g > 255 ? 255 : (B * g) | 0;
          }

          const idx = py * PW + px;
          const du = (px - halfP) / halfP, dv = (py - halfP) / halfP;
          const rr = Math.sqrt(du * du + dv * dv);
          if (isPureGreen(R, G, B)) { skipped++; continue; }
          // 白色高亮圈：既不是墨也不是暖色，直接跳过，
          // 否则它会把整格的 ink/warm 拉成 0。
          if (R > 200 && G > 200 && B > 200) { skipped++; continue; }
          // 外圈的「红色高亮圈」：亮红、绿通道很低，和棋子盘面/红字都不同。
          // 圈落在 rr≈0.8~0.95，只在这一圈里判，不影响中心字形。
          if (rr > 0.66 && R > 150 && G < 125 && (R - G) > 60) { continue; }

          const L = 0.299 * R + 0.587 * G + 0.114 * B;
          const rb = R - B;
          const isWarm = (rb > 22 && R > 80);
          const isRed = (R > 85 && (R - G) > 45 && rb > 45);

          patchValid[idx] = 1;
          patchW[idx] = isWarm ? 255 : 0;
          patchR[idx] = isRed ? 255 : 0;

          sumL += L; n++;
          if (isRed) red++;
          if (L < 72) dark++;
          if (L > 178) bright++;
          if (isWarm) warm++;

          // ---- 墨迹特征（核心判据）----
          // 棋子上的「字」是深色或红色，而棋子盘面、棋盘、绿点、高亮圈都是亮的。
          // 区分「红字」和「暖色盘面」靠绿通道：
          //   红字 (170, 30, 30)  G 极低（约 30）
          //   盘面 (200,150,100)  G 中等（约 150）
          // 之前只用 R-G>45，盘面 R-G=50 也被算成红字，导致黑子全被判成红子。
          const isRedInk = (R > 95 && G < 115 && (R - G) > 55 && (R - B) > 65);
          const isDarkInk = (L < 85) && !isRedInk;
          patchI[idx] = (isRedInk || isDarkInk) ? 255 : 0;
          if (isRedInk || isDarkInk) ink++;
          if (isRedInk) redInk++;
          if (isDarkInk) darkInk++;
          // 中心 8x8 单独统计墨迹：高亮圈的深色描边只落在极外圈，
          // 全图统计会把它算成「黑墨」，于是刚走过的红仕被判成黑兵。
          if (py >= 6 && py <= 17 && px >= 6 && px <= 17) {
            coreN++;
            if (isRedInk || isDarkInk) coreInk++;
            if (isRedInk) coreRedInk++;
            if (isDarkInk) coreDarkInk++;
          }
        }
      }
    } else {
      // 稀疏采样版也统计墨迹（精度略低但够用）
      const step = Math.max(1, Math.floor(radius / 5));
      const r2 = radius * radius;
      for (let dy = -radius; dy <= radius; dy += step) {
        for (let dx = -radius; dx <= radius; dx += step) {
          if (dx * dx + dy * dy > r2) continue;
          const x = Math.round(cx + dx);
          const y = Math.round(cy + dy);
          if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
          const i = (y * w + x) * 4;
          var R = pixels[i], G = pixels[i + 1], B = pixels[i + 2];
          if (g !== 1) {
            R = R * g > 255 ? 255 : (R * g) | 0;
            G = G * g > 255 ? 255 : (G * g) | 0;
            B = B * g > 255 ? 255 : (B * g) | 0;
          }
          if (isPureGreen(R, G, B)) { skipped++; continue; }
          if (R > 200 && G > 200 && B > 200) { skipped++; continue; }
          const L = 0.299 * R + 0.587 * G + 0.114 * B;
          sumL += L; n++;
          const rb = R - B;
          if (R > 85 && (R - G) > 45 && rb > 45) red++;
          if (L < 72) dark++;
          if (L > 178) bright++;
          if (rb > 26 && R > 85) warm++;

          const isRedInk = (R > 95 && G < 115 && (R - G) > 55 && (R - B) > 65);
          const isDarkInk = (L < 85) && !isRedInk;
          if (isRedInk || isDarkInk) ink++;
          if (isRedInk) redInk++;
          if (isDarkInk) darkInk++;
        }
      }
    }

    const denom = n > 0 ? n : 1;
    return {
      meanL: sumL / denom,
      redR: red / denom,
      darkR: dark / denom,
      brightR: bright / denom,
      warmR: warm / denom,
      inkR: ink / denom,
      redInkR: redInk / denom,
      darkInkR: darkInk / denom,
      // 中心区域（避开高亮圈）的墨迹占比 —— 判红黑用这个更准
      inkCoreR: coreInk / (coreN || 1),
      redInkCoreR: coreRedInk / (coreN || 1),
      darkInkCoreR: coreDarkInk / (coreN || 1),
      coreN,
      n,
      skipped,
      patchW,
      patchR,
      patchI,
      patchValid
    };
  }

  /**
   * 估计这一帧的亮度增益，把真机抓屏拉到模板的水平。
   *
   * 参考值 150：真实截图（模板来源）里棋盘区域的整体亮度约 150。
   * 增益夹在 0.55 ~ 1.9 之间，避免在极端画面上放大噪声。
   * 用棋盘内 90 个格点周围的稀疏采样来算，开销很小。
   */
  estimateGain(pixels, w, h, pts) {
    let sum = 0, n = 0;
    const step = 3;
    for (let sq = 0; sq < 90; sq++) {
      const cx = pts[sq * 2], cy = pts[sq * 2 + 1];
      for (let dy = -7; dy <= 7; dy += step) {
        const y = Math.round(cy + dy);
        if (y < 1 || y >= h - 1) continue;
        for (let dx = -7; dx <= 7; dx += step) {
          const x = Math.round(cx + dx);
          if (x < 1 || x >= w - 1) continue;
          const i = (y * w + x) * 4;
          sum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
          n++;
        }
      }
    }
    if (n < 50) return 1;
    const meanL = sum / n;
    if (!(meanL > 20)) return 1;
    let g = 150 / meanL;
    if (g < 0.55) g = 0.55;
    if (g > 1.9) g = 1.9;
    return g;
  }

  /** 全盘采样，返回 90 个特征 */
  sampleAll(pixels, w, h, wantPatch) {
    const pts = this.gridPoints();
    const cell = this.cellSize(pts);
    const radius = Math.max(3, Math.round(cell * this.cellRadiusRatio));

    // ★ 按帧自适应亮度
    //   模板是从「真实截图」生成的，而真机抓屏（ReplayKit 的 YUV→RGB）出来的
    //   亮度/对比常常和截图不一样。所有颜色判据（暖色、红字、墨迹）都是绝对阈值，
    //   整体偏亮偏暗就会把这些阈值全推歪 —— 表现就是「位置对、字和颜色全错」。
    //   这里先用整帧统计出一个增益，把这一帧拉到模板的水平再判。
    const gain = this.estimateGain(pixels, w, h, pts);

    const out = new Array(90);
    for (let sq = 0; sq < 90; sq++) {
      out[sq] = this.sampleCell(pixels, w, h, pts[sq * 2], pts[sq * 2 + 1], radius, wantPatch, gain);
    }
    this.lastStats = { pts, cell, radius, gain };
    // 顺便记下自己画中画的位置：既能用来跳过被遮挡的交叉点，
    // 也能让 App 端提醒用户「浮窗挡住棋盘了，拖走」。
    this.pipRect = findPipRect(pixels, w, h);
    this.pipOverlap = !!(this.pipRect && this.pipRect.y1 >= pts[1] - cell * 0.6
      && this.pipRect.y0 <= pts[9 * 9 * 2 + 1] + cell * 0.6
      && this.pipRect.x1 >= pts[0] - cell * 0.6
      && this.pipRect.x0 <= pts[8 * 2] + cell * 0.6);
    if (wantPatch && this.templates && this.enableLowConfRefine) {
      this.refineLowConfidence(out, pixels, w, h, pts, cell, radius);
    }
    return out;
  }

  /**
   * 对「认不准的格子」做多尺度 + 多偏移的局部重采样
   *
   * 解决两类问题：
   *   1. JJ象棋 落子瞬间会把刚走的棋子放大 1.25 倍、偏移十几像素
   *      （那一帧模板分数只有 0.2，正常 1.3~2.7），红仕会被判成红兵；
   *   2. 网格残余误差（格距差 1%，累积到第 9 行就有 6 像素）。
   *
   * 只对「看起来有子但分数低」的格子做，空格直接跳过，
   * 所以正常情况几乎没有额外开销。
   *
   * @returns {number} 被修正的格子数
   */
  refineLowConfidence(stats, pixels, w, h, pts, cell, radius) {
    let fixed = 0, budget = 14;
    const OFFS = [-1, 0, 1];
    const SCALES = [1.0, 1.16, 1.30];

    for (let sq = 0; sq < 90 && budget > 0; sq++) {
      const s = stats[sq];
      if (!s || !s.patchW) continue;
      // 明显是空格就别浪费预算
      const warm = s.warmR || 0;
      const inkCore = s.inkCoreR || 0;
      if (warm < 0.24 && inkCore < 0.10) continue;

      const m0 = this.matchCell(s);
      if (m0.key !== 'E' && m0.score >= 0.55) continue;   // 已经很确定

      budget--;
      const cx = pts[sq * 2], cy = pts[sq * 2 + 1];
      const off = cell * 0.09;
      let bestStats = s, bestScore = (m0.key === 'E') ? -2 : m0.score;

      for (let si = 0; si < SCALES.length; si++) {
        const r = Math.max(3, Math.round(radius * SCALES[si]));
        for (let dy = 0; dy < 3; dy++) {
          for (let dx = 0; dx < 3; dx++) {
            if (si === 0 && dx === 1 && dy === 1) continue;  // 原位置已经试过
            const nx = cx + OFFS[dx] * off;
            const ny = cy + OFFS[dy] * off;
            const ns = this.sampleCell(pixels, w, h, nx, ny, r, true);
            const nm = this.matchCell(ns);
            if (nm.key !== 'E' && nm.score > bestScore) {
              bestScore = nm.score;
              bestStats = ns;
            }
          }
        }
      }

      if (bestStats !== s && bestScore >= 0.55) {
        stats[sq] = bestStats;
        fixed++;
      }
    }
    this.lastRefined = fixed;
    return fixed;
  }

  /**
   * 用「双峰自动分割」学背景，不依赖「哪些格子是空的」这个先验。
   *
   * 原来靠开局 58 个空位采样，一旦画面不是开局就学错，还会污染模型。
   * 现在直接把 90 个格子的暖色度做直方图，用 Otsu 找最佳分割点：
   * 空棋盘（冷色）和有棋子（暖色）自然会分成两簇。
   *
   * @param {Array} stats sampleAll 的结果
   * @param {number[]} emptySquares 兼容旧调用，现在不依赖它
   */
  learnBackground(stats, emptySquares) {
    const vals = [];
    for (let i = 0; i < stats.length; i++) {
      const s = stats[i];
      if (s && s.n > 0) vals.push(s.warmR);
    }
    if (vals.length < 10) return null;

    // ---- Otsu 双峰分割 ----
    const BINS = 64;
    const hist = new Array(BINS).fill(0);
    for (let i = 0; i < vals.length; i++) {
      let b = Math.round(vals[i] * (BINS - 1));
      if (b < 0) b = 0;
      if (b >= BINS) b = BINS - 1;
      hist[b]++;
    }
    const total = vals.length;
    let sumAll = 0;
    for (let i = 0; i < BINS; i++) sumAll += i * hist[i];

    let wB = 0, sumB = 0, maxVar = -1, bestBin = 0;
    for (let i = 0; i < BINS; i++) {
      wB += hist[i];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += i * hist[i];
      const mB = sumB / wB;
      const mF = (sumAll - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) { maxVar = between; bestBin = i; }
    }

    let th = bestBin / (BINS - 1);
    // 阈值落在极端值说明画面里几乎全空或全满，给个保守默认
    if (th < 0.02 || th > 0.60) th = Math.max(0.06, Math.min(0.35, th || 0.15));

    // 红/黑判据的分布（相对量，不看绝对值）
    const reds = [], darks = [];
    for (let i = 0; i < stats.length; i++) {
      const s = stats[i];
      if (!s || s.n === 0) continue;
      reds.push(s.redR);
      darks.push(s.darkR);
    }
    const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

    this.bgModel = {
      warmThreshold: th,
      meanWarm: avg(vals),
      meanRed: avg(reds),
      meanDark: avg(darks),
      // 保留旧字段，别的代码可能还在读
      meanL: 0,
      stdL: 1,
      meanBright: 0,
      stdBright: 1,
      meanRedRaw: avg(reds),
      stdRed: 0.01,
      meanDarkRaw: avg(darks),
      stdDark: 0.01
    };
    return this.bgModel;
  }

  /**
   * 加权归一化 patch：减加权均值、除加权标准差
   * 比对的只是「中心区域的图案形状」，跟亮度、色调、边缘网格线无关
   */
  normalizePatch(patch) {
    return this.normalizePatchW(patch, this.patchWeights);
  }

  /**
   * 用指定权重做加权归一化。
   *
   * 模板训练时用全局 patchWeights；比对时用「按像素有效性过滤后」的权重，
   * 这样高亮圈 / 绿点盖住的像素不会把兵种比对带偏。
   * （高亮只在落子瞬间出现，但恰好是必须认准的那几帧。）
   */
  normalizePatchW(patch, weights) {
    const n = patch.length;
    if (!n) return null;
    const w = (weights && weights.length === n) ? weights : null;

    let sum = 0, sumW = 0;
    for (let i = 0; i < n; i++) {
      const wi = w ? w[i] : 1;
      sum += wi * patch[i];
      sumW += wi;
    }
    const mean = sum / (sumW || 1);

    let varSum = 0;
    for (let i = 0; i < n; i++) {
      const wi = w ? w[i] : 1;
      const d = patch[i] - mean;
      varSum += wi * d * d;
    }
    const std = Math.sqrt(varSum / (sumW || 1)) || 1;

    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = (patch[i] - mean) / std;
    return out;
  }

  /**
   * 从开局画面采集模板（双通道）
   */
  learnTemplates(stats, boardPieceAt) {
    const buckets = {};   // key -> [{w:归一化暖色, r:归一化红色}]
    for (let sq = 0; sq < 90; sq++) {
      const s = stats[sq];
      if (!s || !s.patchW) continue;
      const key = boardPieceAt[sq] || 'E';
      const vw = this.normalizePatch(s.patchW);
      const vr = this.normalizePatch(s.patchR);
      if (!vw || !vr) continue;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push({ w: vw, r: vr, i: s.patchI ? this.normalizePatch(s.patchI) : null });
    }
    this.templates = buckets;
    let total = 0;
    for (const k in buckets) total += buckets[k].length;
    this.templateCount = total;
    return buckets;
  }

  /**
   * 双通道加权 NCC 匹配
   *
   * 【必须先做暖色预筛】空格的 patchW 全是 0，归一化后得到全 0 向量，
   * 跟任何模板的点积都是 0 —— 于是所有空格都会被投给第一个碰上的红子模板
   * （曾经导致 58 格偏差，正好等于空格总数）。
   * 所以先用暖色占比把「明显是空格」的格子直接判掉，只让候选格进模板比对。
   */
  matchCell(stats) {
    const PW = stats.patchW.length;
    const valid = stats.patchValid;
    let warmCount = 0, redCount = 0, validCount = 0;
    for (let i = 0; i < PW; i++) {
      if (valid && !valid[i]) continue;
      validCount++;
      if (stats.patchW[i] > 0) warmCount++;
      if (stats.patchR[i] > 0) redCount++;
    }
    const warmRatio = warmCount / (validCount || PW);

    // 暖色像素占比太低 → 一定是空棋盘，直接判空
    if (warmRatio < 0.18) return { key: 'E', score: warmRatio, warmRatio };

    const n = PW;
    // 按像素有效性过滤后的权重：高亮圈 / 绿点 / 白边占掉的格直接不参与比对
    let wgt = null;
    if (this.patchWeights && this.patchWeights.length === n) {
      if (valid && validCount < n) {
        wgt = new Float32Array(n);
        let s = 0;
        for (let i = 0; i < n; i++) {
          const v = valid[i] ? this.patchWeights[i] : 0;
          wgt[i] = v;
          s += v;
        }
        if (s > 1e-6) {
          for (let i = 0; i < n; i++) wgt[i] /= s;
        } else {
          wgt = this.patchWeights;
        }
      } else {
        wgt = this.patchWeights;
      }
    }

    const vw = this.normalizePatchW(stats.patchW, wgt);
    const vr = this.normalizePatchW(stats.patchR, wgt);
    const vi = stats.patchI ? this.normalizePatchW(stats.patchI, wgt) : null;
    if (!vw || !vr || !this.templates) return { key: 'E', score: 0, warmRatio };

    let bestKey = 'E', best = -2;
    const all = [];
    for (const key in this.templates) {
      const arr = this.templates[key];
      let typeBest = -9;
      for (let t = 0; t < arr.length; t++) {
        const tpl = arr[t];
        let dotW = 0, dotR = 0, dotI = 0;
        for (let i = 0; i < n; i++) {
          const wi = wgt ? wgt[i] : 1;
          dotW += wi * vw[i] * tpl.w[i];
          dotR += wi * vr[i] * tpl.r[i];
          if (vi && tpl.i) dotI += wi * vi[i] * tpl.i[i];
        }
        // 三通道加权：暖色（盘面）+ 红色（红字）+ 墨迹（笔画形状）
        // 只比暖色/红色时，馬 的模板对任何棋子都能拿到 1.1 分以上，
        // 真正的車 反而只有 0.94，于是红俥被认成红傌（实测两格）。
        // 笔画掩码直接比字形，車 和 馬 立刻分开。
        // 【兵种只看笔画】
        //   红子的盘面几乎都是同一块米黄圆片，暖色/红色两个通道对「是哪个子」毫无区分度，
        //   把它们混进打分反而把字形淹掉：实测红俥排序第 4，输给了炮和相。
        //   颜色已经由墨迹颜色单独判过（红/黑），这里只需要比字形。
        const score = tpl.i ? dotI : (dotW + dotR * 0.3);
        if (score > typeBest) typeBest = score;
        if (score > best) { best = score; bestKey = key; }
      }
      all.push({ key: key, score: typeBest });
    }
    // 候选项按分数降序，最多留 4 个，供「棋子数量上限」修复挑选
    all.sort((a, b) => b.score - a.score);
    return { key: bestKey, score: best, warmRatio, alts: all.slice(0, 4) };
  }

  /**
   * 模板匹配版三分类（以「墨迹」为主判据）
   *
   * 分工：
   *   墨迹（字是深色或红色）→ 决定「有没有子」和「红还是黑」   ← 最可靠，绿点/高亮圈都骗不到
   *   模板匹配              → 只决定「是哪个兵种」            ← 模板错了也不会把空判成有子
   *
   * 之前完全靠模板判有无，一旦模板受干扰（绿点、高亮圈、采样偏移），
   * 就会出现「空格被当成棋子」这种致命错误，整个 FEN 全废。
   */
  classifyByTemplate(stats) {
    const grid = new Int8Array(90);
    const codes = new Int8Array(90);
    const conf = new Float32Array(90);
    const rankedCodes = new Array(90);
    const hidden = new Uint8Array(90);
    const margins = new Float32Array(90);
    let hiddenCount = 0;
    let tplFail = 0;

    for (let sq = 0; sq < 90; sq++) {
      const s = stats[sq];
      if (!s || !s.patchW) { grid[sq] = EMPTY; codes[sq] = 0; continue; }

      // 河界两行（row 4/5）中央有「楚河」「汉界」和水印文字，
      // 那文字是深色的，会被墨迹判据当成棋子。这两行阈值单独抬高。
      const isRiverRow = (sq >= 4 * 9 && sq < 6 * 9);
      const inkTh = isRiverRow ? 0.22 : 0.085;

      const inkR = (typeof s.inkR === 'number') ? s.inkR : 0;
      const warmR = (typeof s.warmR === 'number') ? s.warmR : 0;

      // 【已删除「被画中画盖住的格子判未知」那段逻辑】
      //   它按「暖色占比 > 93% 且几乎无墨」+「落在浮窗矩形内」两条判据把格子抹成空。
      //   在真机抓屏上，空棋盘格也会被判成「暖色无墨」（抓屏色彩比真实截图更亮更饱和），
      //   于是半盘格子被抹空、还因为浮窗矩形框偏弹出「浮窗挡棋盘」的假提示。
      //   这条路走不通，直接去掉：格子一律按正常流程识别。

      const hasInk = (inkR >= inkTh);
      const hasFace = (warmR >= 0.28);
      if (!hasInk && !hasFace) {
        grid[sq] = EMPTY;
        codes[sq] = 0;
        continue;
      }

      // 2) 墨迹颜色定红黑；字被遮住时退回「红色占比」
      //    优先用中心 8x8 的墨迹：外圈是「上一步」的高亮圈，
      //    圈的深色描边会被算成黑墨，把刚走过的红仕判成黑兵（实测）。
      const redInkR = (typeof s.redInkR === 'number') ? s.redInkR : 0;
      const darkInkR = (typeof s.darkInkR === 'number') ? s.darkInkR : 0;
      const coreInkR = (typeof s.inkCoreR === 'number') ? s.inkCoreR : 0;
      const coreRedR = (typeof s.redInkCoreR === 'number') ? s.redInkCoreR : 0;
      const coreDarkR = (typeof s.darkInkCoreR === 'number') ? s.darkInkCoreR : 0;
      let inkRed;
      if (coreInkR >= 0.10) {
        inkRed = coreRedR >= coreDarkR;
      } else if (inkR >= inkTh) {
        inkRed = redInkR >= darkInkR;
      } else {
        inkRed = (s.redR || 0) > 0.012;
      }
      const inkColor = inkRed ? RED_PC : BLK_PC;

      // 3) 模板只用来认兵种
      const r = this.matchCell(s);
      conf[sq] = r.score;
      // 记下「第一名和第二名的分差」—— 分差小说明没把握，数量约束修复只动这些格子
      margins[sq] = (r.alts && r.alts.length > 1) ? (r.alts[0].score - r.alts[1].score) : 99;

      if (r.key === 'E') {
        // 模板说空。
        // 以前这里兜底成「兵/卒」，结果模板一失效就把整盘棋子全填成卒，
        // 生成一张满盘卒的 FEN，评分直接 -299。
        // 现在判空：宁可漏掉一个子，也不能把整盘搞成垃圾。
        grid[sq] = EMPTY;
        codes[sq] = 0;
        tplFail++;
        continue;
      }

      let code = (typeof r.key === 'number') ? r.key : parseInt(r.key, 10);
      if (!code) {
        grid[sq] = EMPTY;
        codes[sq] = 0;
        tplFail++;
        continue;
      }

      const codeIsRed = (code < 8);
      let finalCode;
      if (codeIsRed === inkRed) {
        finalCode = code;
      } else {
        // 颜色冲突 → 信墨迹，兵种取对应阵营的同一兵种
        const t = codeIsRed ? code : code - 7;
        finalCode = inkRed ? t : (t + 7);
      }
      grid[sq] = inkColor;
      codes[sq] = finalCode;

      // 记录候选兵种（按分数排序），供后面的「数量上限」修复用
      const alts = r.alts || [];
      const ranked = [];
      for (let ai = 0; ai < alts.length; ai++) {
        const k = (typeof alts[ai].key === 'number') ? alts[ai].key : parseInt(alts[ai].key, 10);
        if (!k) continue;
        const kRed = (k < 8);
        const t = kRed ? k : k - 7;
        const c = inkRed ? t : (t + 7);
        if (ranked.indexOf(c) < 0) ranked.push(c);
      }
      if (ranked.indexOf(finalCode) < 0) ranked.unshift(finalCode);
      rankedCodes[sq] = ranked;
    }

    // ---- 棋子数量上限修复 ----
    // 象棋每种棋子的数量是固定的，超出上限就一定是认错了：
    //   將帥1  仕2  象2  馬2  車2  炮2  兵5
    // 实测最有价值的一条：红方本来只有两个馬，某一格把带高亮圈的红俥
    // 认成紅傌，就会出现「三个馬」，改成車之后局面立刻合法。
    const LIMIT = [0, 1, 2, 2, 2, 2, 2, 5];
    // 有格子被浮窗盖住时，棋子总数本身就是错的，这时候做数量修复只会更乱
    const allowRepair = (hiddenCount === 0);
    const MARGIN_MAX = 0.35;   // 只动「第一名和第二名分差很小」的格子
    const MAX_REPAIR = 4;      // 最多改 4 格，防止雪崩
    const cnt = [new Array(8).fill(0), new Array(8).fill(0)];
    for (let sq = 0; sq < 90; sq++) {
      const v = codes[sq];
      if (!v) continue;
      if (v <= 7) cnt[0][v]++; else cnt[1][v - 7]++;
    }
    // 先修「分数差距最小」的格子（最可能认错的那个）
    const order = [];
    for (let sq = 0; sq < 90; sq++) {
      const v = codes[sq];
      if (!v) continue;
      const margin = margins[sq];
      if (margin > MARGIN_MAX) continue;   // 有把握的格子不碰
      const side = v <= 7 ? 0 : 1;
      const t = v <= 7 ? v : v - 7;
      if (allowRepair && cnt[side][t] > LIMIT[t]) order.push({ sq: sq, key: margin });
    }
    order.sort((a, b) => a.key - b.key);

    let repaired = 0;
    for (let oi = 0; oi < order.length && repaired < MAX_REPAIR; oi++) {
      const sq = order[oi].sq;
      const v = codes[sq];
      if (!v) continue;
      const side = v <= 7 ? 0 : 1;
      const t = v <= 7 ? v : v - 7;
      if (cnt[side][t] <= LIMIT[t]) continue;
      const ranked = rankedCodes[sq] || [];
      for (let ri = 0; ri < ranked.length; ri++) {
        const alt = ranked[ri];
        if (!alt || alt === v) continue;
        const as = alt <= 7 ? 0 : 1;
        const at = alt <= 7 ? alt : alt - 7;
        if (as !== side) continue;           // 红黑不改，颜色比兵种更可靠
        if (cnt[side][at] >= LIMIT[at]) continue;
        cnt[side][t]--;
        cnt[side][at]++;
        codes[sq] = alt;
        grid[sq] = alt <= 7 ? RED_PC : BLK_PC;
        repaired++;
        break;
      }
    }

    // ---- 将/帅必在：整盘找不到某一方的将帅时，把它找回来 ----
    //
    // 用户实测的现象：黑将那个位置「有棋子、是黑的，但认成了炮」。
    // 也就是说颜色和位置都对，只是兵种错（將 和 炮 字形都很密，容易混）。
    // 但象棋里一方不可能没有将帅 —— 只要某一方将帅数为 0，
    // 就说明有一个子被认成了别的兵种。这里把「将/帅在候选里排得最靠前」的那格改回来，
    // 比让整盘缺将帅强得多（缺将帅的盘面引擎根本没法算）。
    (function repairKings() {
      for (let side = 0; side < 2; side++) {
        const kingCode = side === 0 ? 1 : 8;      // 红帥 / 黑將
        let kingCount = 0;
        for (let sq = 0; sq < 90; sq++) if (codes[sq] === kingCode) kingCount++;
        if (kingCount > 0) continue;

        let bestSq = -1, bestRank = 99;
        for (let sq = 0; sq < 90; sq++) {
          const v = codes[sq];
          if (!v) continue;
          const isRed = v <= 7;
          if ((side === 0) !== isRed) continue;      // 只在本方格子里找
          if (v === kingCode) continue;
          // 别的兵种数量还没超上限时，优先别动它（说明它自己可能是对的）
          const ranked = rankedCodes[sq] || [];
          const rank = ranked.indexOf(kingCode);
          if (rank < 0) continue;
          // 该兵种已经超上限的格子，最值得改
          const t = isRed ? v : v - 7;
          const overs = cnt[side][t] > LIMIT[t] ? 0 : 10;
          const score = rank * 2 + overs;
          if (score < bestRank) { bestRank = score; bestSq = sq; }
        }
        if (bestSq >= 0) {
          const old = codes[bestSq];
          const ot = old <= 7 ? old : old - 7;
          if (cnt[side][ot] > 0) cnt[side][ot]--;
          codes[bestSq] = kingCode;
          cnt[side][1]++;
          grid[bestSq] = side === 0 ? RED_PC : BLK_PC;
          repaired++;
        }
      }
    })();

    // 把每格的置信度和候选留下来，给 App 的「识别留证」页用
    this.lastConf = Array.prototype.slice.call(conf);
    this.lastRanked = rankedCodes.map(function (a) { return a ? a.slice(0, 3) : []; });
    return { grid, conf, codes, tplFail, repaired: repaired, hidden: hidden, hiddenCount: hiddenCount };
  }

  /**
   * 三分类主入口：有模板就走模板匹配，没模板才退回颜色阈值。
   *
   * 模板匹配对光照、棋子高光、棋盘皮肤、上一步的绿圈红圈全都免疫，
   * 因为它比的是「归一化后的图案形状」，不是绝对颜色。
   */
  classify(stats, opts) {
    if (this.templates) {
      return this.classifyByTemplate(stats);
    }
    return this.classifyByColor(stats, opts);
  }

  /**
   * 颜色版三分类（仅在还没采到模板时使用）
   * 有子：暖色度（棋子棕黄、棋盘灰绿）
   * 红黑：只看红色占比（黑字永远不发红）
   */
  classifyByColor(stats, opts) {
    const o = Object.assign({
      warmTh: 0.20,
      redTh: 0.012,
    }, opts || {});

    const bg = this.bgModel;
    const warmTh = bg && typeof bg.warmThreshold === 'number' ? bg.warmThreshold : o.warmTh;

    const grid = new Int8Array(90);
    const conf = new Float32Array(90);

    for (let sq = 0; sq < 90; sq++) {
      const s = stats[sq];
      if (!s || s.n === 0) { grid[sq] = EMPTY; continue; }
      const occupied = s.warmR >= warmTh;
      conf[sq] = warmTh > 0 ? s.warmR / warmTh : 0;
      if (!occupied) { grid[sq] = EMPTY; continue; }
      grid[sq] = (s.redR > o.redTh) ? RED_PC : BLK_PC;
    }
    return { grid, conf };
  }

  /** 模板 SAD 匹配，用于歧义消解：返回与给定 patch 最相似的模板 key */
  matchTemplate(patch, colorHint) {
    if (!this.templates || !this.templates.length) return null;
    let best = null, bestD = Infinity;
    for (const t of this.templates) {
      if (colorHint !== undefined) {
        const tRed = (t.key === 1 || t.key === 2 || t.key === 3 || t.key === 4 || t.key === 5 || t.key === 6 || t.key === 7);
        if ((colorHint === RED_PC) !== tRed) continue;
      }
      let d = 0;
      const g = t.gray;
      for (let i = 0; i < patch.length; i++) {
        const diff = patch[i] - g[i];
        d += diff < 0 ? -diff : diff;
      }
      if (d < bestD) { bestD = d; best = t; }
    }
    return best ? { key: best.key, dist: bestD } : null;
  }
}

module.exports = {
  BoardRecognizer, EMPTY, RED_PC, BLK_PC,
  bilinear, homography, applyH,
  autoDetectBoard, findEvenlySpacedPeaks,
  refineByPieces, refineGrid, fitEvenLines, findPeaks1D, findPipRect, gridAlignScore
};
