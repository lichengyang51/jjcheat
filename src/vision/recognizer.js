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
function autoDetectBoard(pixels, w, h) {
  if (!pixels || w < 60 || h < 60) return null;

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

  // ★ 自校准：用棋子实际位置反推精确网格
  //   边缘投影只能找到「大概的线」，格距误差 10~20%，
  //   累积到第 7 行采样点就偏了整整一格。
  //   棋子一定落在交叉点上，所以用它们反向拟合网格能把误差抹平。
  var initial = [
    [colsF[0], rowsF[0]],
    [colsF[8], rowsF[0]],
    [colsF[8], rowsF[9]],
    [colsF[0], rowsF[9]]
  ];
  return refineGrid(pixels, w, h, initial, 3);

  /* 原始返回值（已被自校准替代）
  return [
    [colsF[0], rowsF[0]],   // 左上
    [colsF[8], rowsF[0]],   // 右上
    [colsF[8], rowsF[9]],   // 右下
    [colsF[0], rowsF[9]]    // 左下
  ];
  */
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
    // 0.42：采样区域要能越过「高亮圈」。
    //   JJ象棋 给上一步走的子套白圈/红圈，圈半径 22~25 像素；
    //   采样半径若只有 19（0.30），整个采样区都在圈内，白色既不是墨也不暖，
    //   结果 ink=0 warm=0，炮被直接判成空（实测丢两个炮）。
    //   放大到 0.42（约 26 像素）就能采到圈外的棋子盘面。
    this.cellRadiusRatio = cfg.cellRadiusRatio || 0.42;
    this.bgModel = cfg.bgModel || null;
    this.templates = cfg.templates || null;
    this.lastStats = null;

    // 径向权重：中心权重高、边缘权重低。
    // 空格的 patch 边缘是棋盘网格线（深色直线），棋子的边缘是圆形描边，
    // 两者在灰度上很像，全图等权比对会被边缘带偏。
    // 加权后由中心区域主导 —— 棋子中心是圆盘+字，空格中心是干净棋盘，差异最明显。
    const PW = 16;
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
  sampleCell(pixels, w, h, cx, cy, radius, wantPatch) {
    let n = 0, sumL = 0, red = 0, dark = 0, bright = 0, warm = 0, skipped = 0;
    let ink = 0, redInk = 0, darkInk = 0;
    const PW = 16;
    let patchW = null, patchR = null;

    // 纯绿像素过滤器（可走位置绿点、绿色高亮圈）
    const isPureGreen = (R, G, B) => (G > R + 30 && G > B + 30 && G > 90);

    if (wantPatch) {
      patchW = new Uint8Array(PW * PW);
      patchR = new Uint8Array(PW * PW);
      const span = radius * 2;
      const stepPx = span / PW;
      for (let py = 0; py < PW; py++) {
        for (let px = 0; px < PW; px++) {
          const sx = Math.round(cx - radius + (px + 0.5) * stepPx);
          const sy = Math.round(cy - radius + (py + 0.5) * stepPx);
          if (sx < 1 || sy < 1 || sx >= w - 1 || sy >= h - 1) continue;
          const i = (sy * w + sx) * 4;
          const R = pixels[i], G = pixels[i + 1], B = pixels[i + 2];

          const idx = py * PW + px;
          if (isPureGreen(R, G, B)) { skipped++; continue; }
          // 白色高亮圈：既不是墨也不是暖色，直接跳过，
          // 否则它会把整格的 ink/warm 拉成 0。
          if (R > 200 && G > 200 && B > 200) { skipped++; continue; }

          const L = 0.299 * R + 0.587 * G + 0.114 * B;
          const rb = R - B;
          const isWarm = (rb > 22 && R > 80);
          const isRed = (R > 85 && (R - G) > 45 && rb > 45);

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
          if (isRedInk || isDarkInk) ink++;
          if (isRedInk) redInk++;
          if (isDarkInk) darkInk++;
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
          const R = pixels[i], G = pixels[i + 1], B = pixels[i + 2];
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
      n,
      skipped,
      patchW,
      patchR
    };
  }

  /** 全盘采样，返回 90 个特征 */
  sampleAll(pixels, w, h, wantPatch) {
    const pts = this.gridPoints();
    const cell = this.cellSize(pts);
    const radius = Math.max(3, Math.round(cell * this.cellRadiusRatio));
    const out = new Array(90);
    for (let sq = 0; sq < 90; sq++) {
      out[sq] = this.sampleCell(pixels, w, h, pts[sq * 2], pts[sq * 2 + 1], radius, wantPatch);
    }
    this.lastStats = { pts, cell, radius };
    return out;
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
    const n = patch.length;
    if (!n) return null;
    const w = (this.patchWeights && this.patchWeights.length === n) ? this.patchWeights : null;

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
      buckets[key].push({ w: vw, r: vr });
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
    let warmCount = 0, redCount = 0;
    for (let i = 0; i < PW; i++) {
      if (stats.patchW[i] > 0) warmCount++;
      if (stats.patchR[i] > 0) redCount++;
    }
    const warmRatio = warmCount / PW;

    // 暖色像素占比太低 → 一定是空棋盘，直接判空
    if (warmRatio < 0.18) return { key: 'E', score: warmRatio, warmRatio };

    const vw = this.normalizePatch(stats.patchW);
    const vr = this.normalizePatch(stats.patchR);
    if (!vw || !vr || !this.templates) return { key: 'E', score: 0, warmRatio };

    const n = vw.length;
    const wgt = (this.patchWeights && this.patchWeights.length === n) ? this.patchWeights : null;

    let bestKey = 'E', best = -2;
    for (const key in this.templates) {
      const arr = this.templates[key];
      for (let t = 0; t < arr.length; t++) {
        const tpl = arr[t];
        let dotW = 0, dotR = 0;
        for (let i = 0; i < n; i++) {
          const wi = wgt ? wgt[i] : 1;
          dotW += wi * vw[i] * tpl.w[i];
          dotR += wi * vr[i] * tpl.r[i];
        }
        const score = dotW + dotR * 1.8;
        if (score > best) { best = score; bestKey = key; }
      }
    }
    return { key: bestKey, score: best, warmRatio };
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
      const hasInk = (inkR >= inkTh);
      const hasFace = (warmR >= 0.28);
      if (!hasInk && !hasFace) {
        grid[sq] = EMPTY;
        codes[sq] = 0;
        continue;
      }

      // 2) 墨迹颜色定红黑；字被遮住时退回「红色占比」
      const redInkR = (typeof s.redInkR === 'number') ? s.redInkR : 0;
      const darkInkR = (typeof s.darkInkR === 'number') ? s.darkInkR : 0;
      let inkRed;
      if (inkR >= inkTh) {
        inkRed = redInkR >= darkInkR;
      } else {
        inkRed = (s.redR || 0) > 0.012;
      }
      const inkColor = inkRed ? RED_PC : BLK_PC;

      // 3) 模板只用来认兵种
      const r = this.matchCell(s);
      conf[sq] = r.score;

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
      if (codeIsRed === inkRed) {
        grid[sq] = inkColor;
        codes[sq] = code;
      } else {
        // 颜色冲突 → 信墨迹，兵种取对应阵营的同一兵种
        const t = codeIsRed ? code : code - 7;
        grid[sq] = inkColor;
        codes[sq] = inkRed ? t : (t + 7);
      }
    }
    return { grid, conf, codes, tplFail };
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
  autoDetectBoard, findEvenlySpacedPeaks
};
