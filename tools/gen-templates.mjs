#!/usr/bin/env node
/*
 * gen-templates.mjs —— 从「已知正确盘面」的真实截图生成内置棋子模板
 *
 * 为什么要把模板内置进引擎，而不是开机时学：
 *   learnBoard 的逻辑是「把第一帧当成标准开局」，用开局棋子的位置给模板贴标签。
 *   用户中途进入对局时，第一帧就是中局，标签全错 —— 车被当成马、炮被当成兵，
 *   识别出来的 FEN 永远是 rnbakabnr/9/1c5c1/...（正好是开局）。
 *   内置模板就没有这个前提，任何时刻进对局都能直接认。
 *
 * 输入：testdata/real_jjchess.bgra（开局标准盘面，589x1280）
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

// FEN -> 每格的棋子字符
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

const { W, H, rgba } = loadFixture('real_jjchess');
const corners = REC.autoDetectBoard(rgba, W, H);
if (!corners) { console.error('棋盘检测失败'); process.exit(1); }
const dbg = REC.refineByPieces.lastDebug;
console.log(`网格 格宽 ${dbg.cellW.toFixed(2)} 格高 ${dbg.cellH.toFixed(2)} 命中 ${dbg.hits}`);

const rec = new REC.BoardRecognizer({ corners });
// 只采 patch，不需要背景模型
const stats = rec.sampleAll(rgba, W, H, true);
const chars = fenChars(START_FEN);

const PW = 16;
const N = PW * PW;

/**
 * 模板的 key 必须是「棋子代号数字」1..14，
 * 因为 classifyByTemplate 里是 parseInt(r.key, 10) 取兵种编码的；
 * 用 FEN 字符（K/A/B…）会 parseInt 成 NaN，整盘棋子全被判成空格。
 */
const CODE_OF = {
  K: 1, A: 2, B: 3, N: 4, R: 5, C: 6, P: 7,
  k: 8, a: 9, b: 10, n: 11, r: 12, c: 13, p: 14
};
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'];
const KEY_SRC = {};   // code -> FEN char
for (const ch in CODE_OF) KEY_SRC[CODE_OF[ch]] = ch;

// 每种棋子把所有实例累加再平均（模板用「多数表决」比单实例更稳）
const acc = {};   // code(string) -> { w: Float64Array, r: Float64Array, n: number }
for (let sq = 0; sq < 90; sq++) {
  const ch = chars[sq];
  if (ch === 'E') continue;
  const key = String(CODE_OF[ch]);
  const s = stats[sq];
  if (!s || !s.patchW) continue;
  if (!acc[key]) acc[key] = { w: new Float64Array(N), r: new Float64Array(N), i: new Float64Array(N), n: 0 };
  const a = acc[key];
  for (let i = 0; i < N; i++) {
    a.w[i] += s.patchW[i];
    a.r[i] += s.patchR[i];
    a.i[i] += s.patchI[i];
  }
  a.n++;
}

const missing = KEYS.filter(k => !acc[k] || acc[k].n === 0);
if (missing.length) { console.error('缺少这些棋子的样本: ' + missing.join(',')); process.exit(1); }

console.log('\n每类样本数:');
for (const k of KEYS) console.log(`  ${k}(${KEY_SRC[k]}): ${acc[k].n}`);

// 打包：每个 key 依次 patchW(256 bit) + patchR(256 bit)，每 8 个 bit 压成 1 字节
const bytes = [];
for (const k of KEYS) {
  const a = acc[k];
  for (const ch of ['w', 'r', 'i']) {
    const arr = a[ch];
    for (let b = 0; b < N; b += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) {
        // 半数以上实例判定为 1 就算 1
        if (arr[b + j] / a.n >= 0.5) v |= (1 << j);
      }
      bytes.push(v);
    }
  }
}

const out = `'use strict';
/*
 * templates.js —— 内置棋子模板（自动生成，请勿手改）
 *
 * 来源：testdata/real_jjchess（JJ象棋 标准开局盘面，589x1280）
 *       网格 格宽 ${dbg.cellW.toFixed(2)} 格高 ${dbg.cellH.toFixed(2)}
 * 生成：node tools/gen-templates.mjs
 *
 * 数据格式：14 种棋子 x（16x16 暖色掩码 + 16x16 红墨掩码 + 16x16 墨迹笔画掩码），
 *           每个掩码 256 bit 按 LSB-first 打包成 32 字节。
 * 为什么内置：learnBoard 把第一帧当开局贴标签，中途进对局会全标错，
 *           识别出来的永远是开局 FEN。内置模板没有这个前提。
 * 为什么有墨迹通道：只比暖色/红色时 馬 的模板对任何棋子都能拿到 1.1 分以上，
 *           真正的車 只有 0.94，红俥会被认成红傌；笔画掩码直接比字形才分得开。
 */
var KEYS = ${JSON.stringify(KEYS)};
var PW = ${PW};
var DATA = [
${(() => { const lines = []; for (let i = 0; i < bytes.length; i += 16) lines.push('  ' + bytes.slice(i, i + 16).join(', ')); return lines.join(',\n'); })()}
];

/** 解包成 BoardRecognizer 需要的 {key: [{w,r,i}]} 结构（未归一化） */
function unpack() {
  var out = {};
  var N = PW * PW;
  var p = 0;
  for (var k = 0; k < KEYS.length; k++) {
    var key = KEYS[k];
    var chans = {};
    for (var ci = 0; ci < 3; ci++) {
      var arr = new Float32Array(N);
      for (var b = 0; b < N / 8; b++) {
        var v = DATA[p++];
        for (var j = 0; j < 8; j++) arr[b * 8 + j] = (v >> j) & 1 ? 1 : 0;
      }
      chans[['w', 'r', 'i'][ci]] = arr;
    }
    out[key] = [{ w: chans.w, r: chans.r, i: chans.i }];
  }
  if (p !== DATA.length) throw new Error('模板数据长度不符: ' + p + ' != ' + DATA.length);
  return out;
}

module.exports = { KEYS: KEYS, PW: PW, DATA: DATA, unpack: unpack };
`;

const outPath = path.join(ROOT, 'src', 'vision', 'templates.js');
fs.writeFileSync(outPath, out);
console.log(`\n已写入 ${outPath}  (${bytes.length} 字节模板数据)`);
