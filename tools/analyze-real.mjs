#!/usr/bin/env node
/*
 * analyze-real.mjs —— 拿用户的真实 JJ象棋 截图来验证识别链路
 *
 * 输入：testdata/real_jjchess.bgra (BGRA 原始像素) + .json (尺寸)
 * 做的事：
 *   1. BGRA -> RGBA
 *   2. 跑 autoDetectBoard，看自动找棋盘的精度
 *   3. 用检测到的四角采样，量出「棋子盘面」和「棋盘空白」的真实 RGB
 *   4. 跑 learnBoard + process，看识别结果对不对
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'testdata', 'real_jjchess.bgra');
const META = path.join(ROOT, 'testdata', 'real_jjchess.json');

const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
const W = meta.width, H = meta.height, STRIDE = meta.stride;
const bgra = fs.readFileSync(RAW);

// BGRA -> RGBA（按 stride 逐行拷，忽略行尾 padding）
const rgba = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) {
  const sRow = y * STRIDE, dRow = y * W * 4;
  for (let x = 0; x < W; x++) {
    const s = sRow + x * 4, d = dRow + x * 4;
    rgba[d] = bgra[s + 2];      // R
    rgba[d + 1] = bgra[s + 1];  // G
    rgba[d + 2] = bgra[s];      // B
    rgba[d + 3] = 255;
  }
}
console.log(`图片 ${W} x ${H}`);

// 载入引擎
const code = fs.readFileSync(path.join(ROOT, 'dist', 'engine.js'), 'utf8');
const sb = { console, Date, Math, JSON, Uint8Array, Int8Array, Uint8ClampedArray, Int32Array, Float32Array, Array, Object, String, Number };
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(code, sb);
const E = sb.JJEngine;

// ---------- 1) 自动检测棋盘 ----------
const t0 = Date.now();
const det = E.autoDetectBoard(rgba, W, H);
console.log(`\n=== 自动检测棋盘 (${Date.now() - t0}ms) ===`);
if (!det) {
  console.log('❌ 检测失败');
} else {
  const [a, b, c, d] = det;
  const cw = (b[0] - a[0]) / 8, ch = (d[1] - a[1]) / 9;
  console.log('四角:', det.map(p => `(${p[0].toFixed(1)},${p[1].toFixed(1)})`).join(' '));
  console.log(`格宽 ${cw.toFixed(1)} px  格高 ${ch.toFixed(1)} px  长宽比 ${(ch / cw).toFixed(3)}`);
}

// 手动给一组「目测」四角做对照（从截图看的棋盘最外圈交叉点）
const MANUAL = [[20, 340], [570, 340], [570, 1000], [20, 1000]];
console.log('\n目测四角:', MANUAL.map(p => `(${p[0]},${p[1]})`).join(' '));

// ---------- 2) 用四角采样真实颜色 ----------
const corners = det || MANUAL;
E.setCorners(corners);

function sampleRGB(px, w, h, cx, cy, radius) {
  let rs = 0, gs = 0, bs = 0, n = 0;
  for (let dy = -radius; dy <= radius; dy += 2) {
    for (let dx = -radius; dx <= radius; dx += 2) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const x = Math.round(cx + dx), y = Math.round(cy + dy);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = (y * w + x) * 4;
      rs += px[i]; gs += px[i + 1]; bs += px[i + 2]; n++;
    }
  }
  if (!n) return null;
  return { r: rs / n, g: gs / n, b: bs / n, n };
}

// 用「格子间距」定位
const pts = [];
for (let r = 0; r < 10; r++) {
  for (let c = 0; c < 9; c++) {
    const u = c / 8, v = r / 9;
    const x = (1 - u) * (1 - v) * corners[0][0] + u * (1 - v) * corners[1][0] + u * v * corners[2][0] + (1 - u) * v * corners[3][0];
    const y = (1 - u) * (1 - v) * corners[0][1] + u * (1 - v) * corners[1][1] + u * v * corners[2][1] + (1 - u) * v * corners[3][1];
    pts.push([x, y]);
  }
}
const cellW = (corners[1][0] - corners[0][0]) / 8;
const cellH = (corners[3][1] - corners[0][1]) / 9;
console.log(`\n格宽 ${cellW.toFixed(1)}  格高 ${cellH.toFixed(1)}`);

// 棋子盘面：采圆环（半径 = 0.42*min(cell)，避开中央汉字）
function ringRGB(px, w, h, cx, cy, rad) {
  let rs = 0, gs = 0, bs = 0, n = 0;
  for (let a = 0; a < 360; a += 20) {
    const x = Math.round(cx + rad * Math.cos(a * Math.PI / 180));
    const y = Math.round(cy + rad * Math.sin(a * Math.PI / 180));
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = (y * w + x) * 4;
    rs += px[i]; gs += px[i + 1]; bs += px[i + 2]; n++;
  }
  if (!n) return null;
  return { r: rs / n, g: gs / n, b: bs / n };
}

console.log('\n=== 真实颜色测量 ===');
console.log('位置                  盘面RGB              亮度  R-B   warm?');
const probes = [
  ['黑車 r0c0', 0, 0],
  ['黑將 r0c4', 0, 4],
  ['黑炮 r2c1', 2, 1],
  ['黑卒 r3c0', 3, 0],
  ['红兵 r6c0', 6, 0],
  ['红炮 r7c1', 7, 1],
  ['红帥 r9c4', 9, 4],
  ['红車 r9c0', 9, 0],
];
const ringR = Math.min(cellW, cellH) * 0.42;
for (const [name, r, c] of probes) {
  const p = pts[r * 9 + c];
  const m = ringRGB(rgba, W, H, p[0], p[1], ringR);
  if (!m) { console.log(`${name} 采样失败`); continue; }
  const L = 0.299 * m.r + 0.587 * m.g + 0.114 * m.b;
  const warm = (m.r - m.b) > 22 && m.r > 80;
  console.log(`${name.padEnd(14)} (${m.r.toFixed(0)},${m.g.toFixed(0)},${m.b.toFixed(0)})`.padEnd(38)
    + `${L.toFixed(0).padStart(4)} ${(m.r - m.b).toFixed(0).padStart(4)}   ${warm ? 'YES' : 'no'}`);
}

// 棋盘空白：格点之间（u+0.5, v+0.5）
console.log('\n棋盘空白（格点之间）:');
const empties = [[0, 0], [1, 0], [4, 4], [5, 1], [8, 7]];
for (const [v, u] of empties) {
  const x = corners[0][0] + (corners[1][0] - corners[0][0]) * (u + 0.5) / 8;
  const y = corners[0][1] + (corners[3][1] - corners[0][1]) * (v + 0.5) / 9;
  const m = sampleRGB(rgba, W, H, x, y, 6);
  if (!m) continue;
  const L = 0.299 * m.r + 0.587 * m.g + 0.114 * m.b;
  const warm = (m.r - m.b) > 22 && m.r > 80;
  console.log(`  (v${v},u${u})  (${m.r.toFixed(0)},${m.g.toFixed(0)},${m.b.toFixed(0)})`.padEnd(26)
    + `亮度 ${L.toFixed(0).padStart(4)}  R-B ${(m.r - m.b).toFixed(0).padStart(4)}  ${warm ? 'YES' : 'no'}`);
}

// ---------- 3) 跑完整识别 ----------
console.log('\n=== 完整识别链 ===');
E.reset();
const info = E.learnBoard(rgba, W, H);
console.log('learnBoard:', JSON.stringify({
  learned: info.learned, warmTh: info.warmThreshold,
  templateCount: info.templateCount,
  verifyDiff: info.verifyDiff, diffNormal: info.diffNormal, diffFlipped: info.diffFlipped,
  flipped: info.flipped, mySide: info.mySide
}));

const out = E.process(rgba, W, H, { timeMs: 600 });
const expect = E.fenToGrid('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1');
let diff = 0;
const detail = [];
for (let i = 0; i < 90; i++) {
  if (out.grid[i] !== expect[i]) {
    diff++;
    if (detail.length < 14) detail.push(`格${i}(r${(i / 9) | 0},c${i % 9}) 望${expect[i]} 实${out.grid[i]}`);
  }
}
console.log(`\n识别偏差 ${diff} 格 / 90`);
if (detail.length) console.log('  ' + detail.join('\n  '));
console.log(`着法: ${out.suggestChinese}  胜率 ${out.winrate}%  深度 ${out.depth}  mySide=${out.mySide}`);
