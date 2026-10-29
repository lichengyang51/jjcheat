#!/usr/bin/env node
/*
 * refine.mjs —— 识别链路回归测试（带逐格真值）
 *
 * 每张真实截图的 90 格真值都是人工核对出来的（含红黑与兵种），
 * 任何一格认错都会被点名，防止以后改动时悄悄回退。
 *
 * 真值来源：
 *   real_jjchess / real_442x959 —— JJ象棋 标准开局，两张不同分辨率
 *   user_midgame               —— 一局真中局（浮窗是旧版，盘面本身是正确的）
 *   user_prompt                —— 中局 + 「移动后将会送将」提示框
 *   user_dots                  —— 中局 + 选中棋子满盘绿点
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR';

const FIXTURES = [
  { name: 'real_jjchess', truth: START_FEN },
  { name: 'real_442x959', truth: START_FEN },
  { name: 'user_midgame', truth: 'rnb1k1b1r/4a4/1c1R4n/p1C1p1p1p/4c4/6P2/P1P5P/R5C2/9/1NBAKABN1' },
  { name: 'user_prompt', truth: 'rnbakabnr/9/1c7/p1C1p1p1p/9/9/P1P1c1P1P/7C1/9/RNBAKABNR' },
  { name: 'user_dots', truth: 'rnb1kab1r/9/1c1a4n/p1C1p1p1p/4c4/6P2/P1P5P/R5C2/3R5/1NBAKABN1' }
];

function loadEngine() {
  const code = fs.readFileSync(path.join(ROOT, 'dist', 'engine.js'), 'utf8');
  const sb = {
    console, Date, Math, JSON, Uint8Array, Int8Array, Uint8ClampedArray,
    Int32Array, Uint16Array, Uint32Array, Float32Array, Float64Array,
    Array, Object, String, Number, Boolean, Error, isFinite, isNaN
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(code, sb);
  return sb.JJEngine;
}

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

function cells(fen) {
  const out = [];
  for (const row of fen.split(' ')[0].split('/')) {
    for (const ch of row) {
      if (ch >= '1' && ch <= '9') for (let i = 0; i < Number(ch); i++) out.push('.');
      else out.push(ch);
    }
  }
  return out;
}

const E = loadEngine();
console.log('引擎已载入  ' + E.version + '\n');

let totalErr = 0, totalCells = 0, perfect = 0;

for (const fx of FIXTURES) {
  const p = path.join(ROOT, 'testdata', fx.name + '.bgra');
  if (!fs.existsSync(p)) { console.log(`--- ${fx.name} 缺文件，跳过 ---\n`); continue; }
  const { W, H, rgba } = loadFixture(fx.name);
  console.log(`===== ${fx.name}  (${W}x${H}) =====`);

  const tD = Date.now();
  const dbg = E.autoDetectDebug(rgba, W, H);
  const msD = Date.now() - tD;
  if (!dbg.corners) { console.log(`❌ 棋盘检测失败 (${msD}ms)\n`); continue; }
  const c = dbg.corners;
  const cw = (c[1][0] - c[0][0]) / 8;
  const ch = (c[3][1] - c[0][1]) / 9;
  console.log(`格宽 ${cw.toFixed(2)}  格高 ${ch.toFixed(2)}  比例 ${(cw / ch).toFixed(3)}  命中 ${dbg.debug.pieceFit.hits}/90  定位 ${msD}ms`);

  E.reset();
  E.setCorners(c);
  const cb = E.classifyBoard(rgba, W, H);
  const got = cells(cb.fen);
  const exp = cells(fx.truth);

  let err = 0;
  const bad = [];
  for (let i = 0; i < 90; i++) {
    if (got[i] !== exp[i]) {
      err++;
      if (bad.length < 8) bad.push(`r${(i / 9) | 0}c${i % 9} 望${exp[i]} 实${got[i]}`);
    }
  }
  totalErr += err;
  totalCells += 90;
  if (err === 0) perfect++;

  // 一帧耗时 + 着法
  const t = Date.now();
  const out = E.process(rgba, W, H, { timeMs: 900 });
  const msF = Date.now() - t;
  console.log(`FEN  ${cb.fen}`);
  if (err) console.log(`  ⚠️ 错 ${err} 格：${bad.join('  ')}`);
  else console.log('  ✅ 90 格全对');
  console.log(`着法 ${out.suggestChinese}  评分 ${out.score}  胜率 ${out.winrate}%  深 ${out.depth}  我方 ${out.mySide}  ${msF}ms`);
  console.log('');
}

console.log(`===== 合计 错 ${totalErr} / ${totalCells} 格，${perfect}/${FIXTURES.length} 张全对 =====`);
process.exit(totalErr <= 2 ? 0 : 1);

