'use strict';
/*
 * glyph2.js —— 字形特征分类（对重采样不敏感）
 *
 * 【为什么不用逐像素模板比对】
 *   同一个字在「缩到 700」和「缩到 589」下栅格化不同，模板逐像素比会互相打架：
 *   实测同一张图两种尺寸给出不同的识别结果（r1c1 一个读成仕、一个读成傌）。
 *   手机上 Core Graphics 怎么缩、离线怎么缩，像素永远对不齐。
 *
 * 【这里用什么】
 *   把每个字归一化成 32×32（保持长宽比），然后算一组「结构特征」：
 *     · 长宽比                      —— 士(矮宽) vs 車(高瘦)
 *     · 8 段竖投影 + 8 段横投影      —— 笔画在哪些位置有墨
 *     · 4×4 分块密度                —— 上下左右哪块更密
 *     · 总墨迹占比
 *   这些量对缩放、平移、抗锯齿都不敏感，但对不同字的区分度很高。
 *   分类用「到各类中心的距离」+「到同类样本的最近距离」两者加权。
 */

const GW = 32;
const SAMPLE = 40;

function sampleBlock(pixels, w, h, cx, cy, halfSize) {
  const n = SAMPLE;
  const step = (halfSize * 2) / n;
  const L = new Float32Array(n * n);
  const RG = new Float32Array(n * n);
  const RB = new Float32Array(n * n);
  const ok = new Uint8Array(n * n);

  for (let j = 0; j < n; j++) {
    const y = Math.round(cy - halfSize + (j + 0.5) * step);
    if (y < 1 || y >= h - 1) continue;
    for (let i = 0; i < n; i++) {
      const x = Math.round(cx - halfSize + (i + 0.5) * step);
      if (x < 1 || x >= w - 1) continue;
      // 只采圆内：正方形四角会伸到棋子圆盘描边外，把深色描边当成墨迹
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > halfSize * halfSize) continue;
      const p = (y * w + x) * 4;
      const R = pixels[p], G = pixels[p + 1], B = pixels[p + 2];
      const idx = j * n + i;
      L[idx] = 0.299 * R + 0.587 * G + 0.114 * B;
      RG[idx] = R - G;
      RB[idx] = R - B;
      ok[idx] = 1;
    }
  }
  return { L, RG, RB, ok, n };
}

function medianOf(arr, ok) {
  const v = [];
  for (let i = 0; i < arr.length; i++) if (!ok || ok[i]) v.push(arr[i]);
  if (!v.length) return 128;
  v.sort((a, b) => a - b);
  return v[v.length >> 1];
}

/** 抠字形 → 保持长宽比归一化到 GW×GW 的墨迹强度图 */
function extractGlyph(pixels, w, h, cx, cy, halfSize) {
  const blk = sampleBlock(pixels, w, h, cx, cy, halfSize);
  const n = blk.n;
  const faceL = medianOf(blk.L, blk.ok);
  const th = Math.max(30, faceL - 38);

  let minX = n, maxX = -1, minY = n, maxY = -1, ink = 0, redInk = 0;
  const inkMask = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const idx = j * n + i;
      if (!blk.ok[idx] || blk.L[idx] >= th) continue;
      inkMask[idx] = 1;
      ink++;
      if (blk.RG[idx] > 40 && blk.RB[idx] > 40) redInk++;
      if (i < minX) minX = i;
      if (i > maxX) maxX = i;
      if (j < minY) minY = j;
      if (j > maxY) maxY = j;
    }
  }
  if (ink < 10) return { mask: new Float32Array(GW * GW), redRatio: 0, inkCount: ink };

  const bw = Math.max(1, maxX - minX + 1);
  const bh = Math.max(1, maxY - minY + 1);
  const sc = GW / Math.max(bw, bh);
  const drawW = bw * sc, drawH = bh * sc;
  const offX = (GW - drawW) * 0.5, offY = (GW - drawH) * 0.5;
  const cellW = bw / drawW, cellH = bh / drawH;

  const out = new Float32Array(GW * GW);
  for (let gy = 0; gy < GW; gy++) {
    const ty = gy - offY;
    if (ty < 0 || ty >= drawH) continue;
    for (let gx = 0; gx < GW; gx++) {
      const tx = gx - offX;
      if (tx < 0 || tx >= drawW) continue;
      const sy0 = minY + ty * cellH, sy1 = sy0 + cellH;
      const sx0 = minX + tx * cellW, sx1 = sx0 + cellW;
      let sum = 0, cnt = 0;
      for (let j = Math.floor(sy0); j < Math.ceil(sy1); j++) {
        if (j < 0 || j >= n) continue;
        for (let i = Math.floor(sx0); i < Math.ceil(sx1); i++) {
          if (i < 0 || i >= n) continue;
          const ox = Math.min(sx1, i + 1) - Math.max(sx0, i);
          const oy = Math.min(sy1, j + 1) - Math.max(sy0, j);
          if (ox <= 0 || oy <= 0) continue;
          sum += inkMask[j * n + i] * ox * oy;
          cnt += ox * oy;
        }
      }
      out[gy * GW + gx] = cnt > 0 ? sum / cnt : 0;
    }
  }
  return { mask: out, redRatio: ink > 0 ? redInk / ink : 0, inkCount: ink, w: bw, h: bh };
}

/** 特征向量：对重采样不敏感的那一组量 */
const FBINS = 8;
const FEAT_LEN = 2 + FBINS * 2 + 16 + 1;

function features(g) {
  const m = g.mask;
  const f = new Float32Array(FEAT_LEN);
  let total = 0;
  const colSum = new Float32Array(GW);
  const rowSum = new Float32Array(GW);
  const grid = new Float32Array(16);

  for (let y = 0; y < GW; y++) {
    for (let x = 0; x < GW; x++) {
      const v = m[y * GW + x];
      if (v <= 0.05) continue;
      total += v;
      colSum[x] += v;
      rowSum[y] += v;
      const gi = Math.min(3, (y * 4 / GW) | 0) * 4 + Math.min(3, (x * 4 / GW) | 0);
      grid[gi] += v;
    }
  }
  const norm = total > 0 ? 1 / total : 0;

  // 长宽比（带符号的对数，>0 偏瘦高）
  const aspect = g.w && g.h ? Math.log(Math.max(0.2, g.h / g.w)) : 0;
  f[0] = aspect;
  f[1] = Math.min(2, total / (GW * GW) * 4);   // 墨迹占比（放大以便参与距离）

  // 竖/横投影各 8 段
  const cb = new Float32Array(FBINS);
  for (let x = 0; x < GW; x++) cb[Math.min(FBINS - 1, (x * FBINS / GW) | 0)] += colSum[x];
  const rb = new Float32Array(FBINS);
  for (let y = 0; y < GW; y++) rb[Math.min(FBINS - 1, (y * FBINS / GW) | 0)] += rowSum[y];
  for (let i = 0; i < FBINS; i++) {
    f[2 + i] = cb[i] * norm;
    f[2 + FBINS + i] = rb[i] * norm;
  }
  // 4×4 密度
  for (let i = 0; i < 16; i++) f[2 + FBINS * 2 + i] = grid[i] * norm;
  // 最后一维：上/下墨迹比（車 上重、馬 下重、士 居中）
  let up = 0, dn = 0;
  for (let y = 0; y < GW; y++) {
    for (let x = 0; x < GW; x++) {
      const v = m[y * GW + x];
      if (y < GW / 2) up += v; else dn += v;
    }
  }
  f[FEAT_LEN - 1] = total > 0 ? (up - dn) / total : 0;
  return f;
}

/** 欧氏距离（特征已归一化到 0~1 量级） */
function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

/**
 * 分类
 * @param {Float32Array} f 特征
 * @param {object} model { centroids: {key: Float32Array}, samples: {key: [Float32Array]} }
 * @param {boolean} wantRed
 */
function classify(f, model, wantRed) {
  const ranked = [];
  for (const key in model.samples) {
    const code = parseInt(key, 10);
    if (code !== 1 && code !== 8) {
      const isRed = code < 8;
      if (isRed !== wantRed) continue;
    }
    let best = 1e9;
    const list = model.samples[key];
    for (let i = 0; i < list.length; i++) {
      const d = dist(f, list[i]);
      if (d < best) best = d;
    }
    const c = model.centroids[key];
    const dc = c ? dist(f, c) : best;
    ranked.push({ key: key, score: 0.5 * best + 0.5 * dc });
  }
  ranked.sort((a, b) => a.score - b.score);
  return { key: ranked.length ? ranked[0].key : null, score: ranked.length ? -ranked[0].score : 0, ranked: ranked.slice(0, 4) };
}

module.exports = { GW, FEAT_LEN, extractGlyph, features, classify, dist };
