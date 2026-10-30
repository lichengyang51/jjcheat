#!/usr/bin/env node
/*
 * gen-templates.mjs —— 从「已知正确盘面」的真实截图生成内置棋子模板
 *
 * 为什么要内置：learnBoard 把第一帧当开局贴标签，中途进对局会全标错，
 * 识别出来的永远是开局 FEN。内置模板没有这个前提。
 *
 * 【为什么要多个尺度、每个尺度保留实例】
 *   同一个字在不同分辨率下栅格化结果不一样（笔画落在亚像素的位置不同）。
 *   只用一个尺度做模板，换个尺度就「谁都不像」——
 *   实测只用 589 宽做 24×24 模板时，700 宽的残局直接认不出来。
 *   所以这里对 442 / 589 / 736 三种尺度各取一遍，每种棋子每种尺度单独存成一个实例。
 *
 * 输出：src/vision/templates.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const REC = require(path.join(ROOT, 'src', 'vision', 'recognizer.js'));

const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR';

const SOURCES = ['real_442x959', 'real_jjchess', 's736'];

const PW = 24;
const MAX_PER_KEY = 10;

const CODE_OF = {
  K: 1, A: 2, B: 3, N: 4, R: 5, C: 6, P: 7,
  k: 8, a: 9, b: 10, n: 11, r: 12, c: 13, p: 14
};
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'];

function loadFixture(name) {
  const base = path.join(ROOT, 'testdata', name);
  const meta = JSON.parse(fs.readFileSync(base + '.json', 'utf8'));
  const W = meta.width, H = meta.height, STRIDE = meta.stride;
  const bgra = fs.readFileSync(base + '.bgra');
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sRow = y * STRIDE, dRow = y * W * 4;
    for (let x = 0; x < W; x++) {
      const s = sRow + x * 4, d = dRow + x * 4;
      rgba[d] = bgra[s + 2];
      rgba[d + 1] = bgra[s + 1];
      rgba[d + 2] = bgra[s];
      rgba[d + 3] = 255;
    }
  }
  return { W, H, rgba };
}

function fenChars(fen) {
  const rows = fen.split(' ')[0].split('/');
  const out = new Array(90).fill('E');
  for (let r = 0; r < 10; r++) {
    let c = 0;
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '9') c += Number(ch);
      else { out[r * 9 + c] = ch; c++; }
    }
  }
  return out;
}

const N = PW * PW;

function pack(arr) {
  const bytes = [];
  for (let b = 0; b < N; b += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) if (arr[b + j] > 127) v |= (1 << j);
    bytes.push(v);
  }
  return bytes;
}

const acc = {};

for (const src of SOURCES) {
  const p = path.join(ROOT, 'testdata', src + '.bgra');
  if (!fs.existsSync(p)) { console.log('skip ' + src + ' (no file)'); continue; }

  const { W, H, rgba } = loadFixture(src);
  const corners = REC.autoDetectBoard(rgba, W, H);
  if (!corners) { console.log('skip ' + src + ' (no board)'); continue; }

  const cellW = (corners[1][0] - corners[0][0]) / 8;
  const rec = new REC.BoardRecognizer({ corners });
  const stats = rec.sampleAll(rgba, W, H, true);
  const chars = fenChars(START_FEN);

  let added = 0;
  for (let sq = 0; sq < 90; sq++) {
    const ch = chars[sq];
    if (ch === 'E') continue;
    const key = String(CODE_OF[ch]);
    const s = stats[sq];
    if (!s || !s.patchW) continue;
    if (!acc[key]) acc[key] = [];
    if (acc[key].length >= MAX_PER_KEY) continue;
    acc[key].push({ w: pack(s.patchW), r: pack(s.patchR), i: pack(s.patchI) });
    added++;
  }
  console.log('  ' + src + '  cellW=' + cellW.toFixed(1) + '  +' + added + ' instances');
}

const missing = KEYS.filter(k => !acc[k] || acc[k].length === 0);
if (missing.length) {
  console.error('missing piece types: ' + missing.join(','));
  process.exit(1);
}

const items = [];
for (const k of KEYS) for (const m of acc[k]) items.push({ key: k, w: m.w, r: m.r, i: m.i });

const body = items.map(it =>
  "  { key: '" + it.key + "', w: [" + it.w.join(',') + "], r: [" + it.r.join(',') + "], i: [" + it.i.join(',') + "] }"
).join(',\n');

const out = `'use strict';
/*
 * templates.js —— 内置棋子模板（自动生成，请勿手改）
 *
 * 来源：${SOURCES.join(' / ')}（都是标准开局盘面，不同尺度）
 * 生成：node tools/gen-templates.mjs
 *
 * 每个「棋子实例」单独存三张 ${PW}x${PW} 的二值掩码：
 *   w = 暖色盘面   r = 红色   i = 墨迹笔画（字形本身）
 * 共 ${items.length} 个实例。
 *
 * 为什么多尺度 + 保留实例：同一个字在不同分辨率下栅格化不同，
 * 只用一个尺度的模板换个尺度就认不出；平均成一张又谁都不像。
 * 多尺度实例逐一比对，让最接近的胜出。
 */
var PW = ${PW};
var ITEMS = [
${body}
];

function unpack() {
  var N = PW * PW;
  var names = ['w', 'r', 'i'];
  var out = {};
  for (var n = 0; n < ITEMS.length; n++) {
    var it = ITEMS[n];
    var ch = {};
    for (var ci = 0; ci < 3; ci++) {
      var arr = new Float32Array(N);
      var src = it[names[ci]];
      for (var b = 0; b < N / 8; b++) {
        var v = src[b];
        for (var j = 0; j < 8; j++) arr[b * 8 + j] = (v >> j) & 1 ? 1 : 0;
      }
      ch[names[ci]] = arr;
    }
    if (!out[it.key]) out[it.key] = [];
    out[it.key].push({ w: ch.w, r: ch.r, i: ch.i });
  }
  return out;
}

module.exports = { PW: PW, ITEMS: ITEMS, unpack: unpack };
`;

const outPath = path.join(ROOT, 'src', 'vision', 'templates.js');
fs.writeFileSync(outPath, out);
console.log('\nwritten ' + outPath + '  (' + items.length + ' instances, ' + (out.length / 1024).toFixed(1) + ' KB)');
