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

class BoardRecognizer {
  /**
   * @param {object} cfg
   *   corners: [[x,y]x4] 屏幕像素坐标，顺序 [左上, 右上, 右下, 左下]
   *   cellRadiusRatio: 采样半径占格距的比例，默认 0.40
   *   bgModel: 可选的已学习背景模型
   */
  constructor(cfg) {
    this.corners = cfg.corners ? cfg.corners.map(p => [p[0], p[1]]) : null;
    this.cellRadiusRatio = cfg.cellRadiusRatio || 0.40;
    this.bgModel = cfg.bgModel || null;
    this.templates = cfg.templates || null; // [{key, w, h, gray:Uint8Array}]
    this.lastStats = null;
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

  /** 格距估算（像素） */
  cellSize(pts) {
    const dx = pts[2] - pts[0];
    const dy = pts[3] - pts[1];
    return Math.hypot(dx, dy) / 8;
  }

  /**
   * 采样一个交叉点周围的特征
   * @returns {{meanL, redR, darkR, brightR, n, patch:Uint8Array|null}}
   */
  sampleCell(pixels, w, h, cx, cy, radius, wantPatch) {
    let n = 0, sumL = 0, red = 0, dark = 0, bright = 0;
    // 环带：跳过最中心（那里可能被上一帧的箭头/高亮遮挡）
    const step = Math.max(1, Math.floor(radius / 4));
    const r2 = radius * radius;
    const inner = (radius * 0.18) * (radius * 0.18);

    // 灰度 patch（16x16）用于模板
    const PW = 16;
    const patch = wantPatch ? new Uint8Array(PW * PW) : null;
    const pw = wantPatch ? (radius * 2) / PW : 0;

    for (let dy = -radius; dy <= radius; dy += step) {
      for (let dx = -radius; dx <= radius; dx += step) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const x = Math.round(cx + dx);
        const y = Math.round(cy + dy);
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        const i = (y * w + x) * 4;
        const R = pixels[i], G = pixels[i + 1], B = pixels[i + 2];
        const L = 0.299 * R + 0.587 * G + 0.114 * B;
        sumL += L; n++;
        if (R > 85 && (R - G) > 45 && (R - B) > 45) red++;
        if (L < 72) dark++;
        if (L > 178) bright++;
        if (d2 >= inner) { /* 全部计入 */ }

        if (wantPatch) {
          const px = Math.min(PW - 1, Math.max(0, Math.floor((dx + radius) / pw)));
          const py = Math.min(PW - 1, Math.max(0, Math.floor((dy + radius) / pw)));
          patch[py * PW + px] = L;
        }
      }
    }
    if (n === 0) return { meanL: 0, redR: 0, darkR: 0, brightR: 0, n: 0, patch };
    return {
      meanL: sumL / n,
      redR: red / n,
      darkR: dark / n,
      brightR: bright / n,
      n,
      patch
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
   * 从已知空位学习背景模型
   * @param {Array} stats sampleAll 的结果
   * @param {number[]} emptySquares 已知为空的格子
   */
  learnBackground(stats, emptySquares) {
    const vals = emptySquares.map(sq => stats[sq]).filter(s => s && s.n > 0);
    if (!vals.length) return null;
    const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = (arr, m) => Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length);
    const Ls = vals.map(v => v.meanL);
    const Rs = vals.map(v => v.redR);
    const Ds = vals.map(v => v.darkR);
    const Bs = vals.map(v => v.brightR);
    const mL = mean(Ls), sL = Math.max(3, std(Ls, mL));
    const mR = mean(Rs), sR = Math.max(0.004, std(Rs, mR));
    const mD = mean(Ds), sD = Math.max(0.004, std(Ds, mD));
    const mB = mean(Bs), sB = Math.max(0.01, std(Bs, mB));
    this.bgModel = {
      meanL: mL, stdL: sL,
      meanRed: mR, stdRed: sR,
      meanDark: mD, stdDark: sD,
      meanBright: mB, stdBright: sB
    };
    return this.bgModel;
  }

  /** 从已知局面学习棋子模板（用于歧义消解 + 兵种校验） */
  learnTemplates(stats, boardPieceAt) {
    const tpl = [];
    for (let sq = 0; sq < 90; sq++) {
      const t = boardPieceAt[sq];
      if (!t) continue;
      const s = stats[sq];
      if (!s || !s.patch) continue;
      tpl.push({ key: t, sq, gray: s.patch, w: 1, redR: s.redR, darkR: s.darkR });
    }
    this.templates = tpl;
    return tpl;
  }

  /**
   * 三分类：返回 Int8Array(90)，0=空 1=红 2=黑
   * 依赖 this.bgModel；若无模型则用绝对阈值兜底
   */
  classify(stats, opts) {
    const o = Object.assign({
      occBrightR: 0.16,  // 亮色占比达到此值 → 有子
      occDeltaL: 16,     // 或与背景亮度差超过此值
      redTh: 0.030,      // 红色字占比 → 红子
      darkTh: 0.045,     // 深色字占比 → 黑子
      confTh: 0.02
    }, opts || {});

    const bg = this.bgModel;
    const grid = new Int8Array(90);
    const conf = new Float32Array(90);

    for (let sq = 0; sq < 90; sq++) {
      const s = stats[sq];
      if (!s || s.n === 0) { grid[sq] = EMPTY; continue; }

      let occupied;
      if (bg) {
        const dL = Math.abs(s.meanL - bg.meanL);
        const dBr = s.brightR - bg.meanBright;
        const scoreOcc = (dBr / o.occBrightR) * 0.6 + (dL / o.occDeltaL) * 0.4;
        occupied = scoreOcc > 1.0;
        conf[sq] = scoreOcc;
      } else {
        occupied = s.brightR > o.occBrightR || s.meanL > 190;
        conf[sq] = s.brightR / o.occBrightR;
      }

      if (!occupied) { grid[sq] = EMPTY; continue; }

      // 有子 → 判红/黑
      const isRed = s.redR > o.redTh;
      const isBlk = s.darkR > o.darkTh;
      if (isRed && !isBlk) grid[sq] = RED_PC;
      else if (isBlk && !isRed) grid[sq] = BLK_PC;
      else if (isRed && isBlk) grid[sq] = s.redR > s.darkR ? RED_PC : BLK_PC;
      else {
        // 字迹太淡：用背景对比兜底 —— 落在红子模板均值附近就判红
        grid[sq] = s.redR >= s.darkR ? RED_PC : BLK_PC;
      }
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
  bilinear, homography, applyH
};
