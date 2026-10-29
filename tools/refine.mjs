#!/usr/bin/env node
/*
 * refine.mjs —— 识别链路回归测试
 *
 * 对 testdata 里每一张真实截图跑完整链路（自动找棋盘 → 采样 → 认棋 → 出着法），
 * 输出：网格参数、FEN、着法、单帧耗时。
 *
 * real_jjchess / real_442x959 是标准开局，有确定的正确答案，必须 100% 正确。
 * user_prompt / user_dots 是中局截图（含落子放大动画、选中绿点），
 * 没有逐格真值，只做「子数是否合理 + 红黑数量是否合法」的检查。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR';

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

const FIXTURES = [
  { name: 'real_jjchess', expect: START_FEN },
  { name: 'real_442x959', expect: START_FEN },
  { name: 'user_prompt', expect: null },
  { name: 'user_dots', expect: null }
];

const E = loadEngine();
console.log('引擎已载入  ' + E.version + '\n');

let hardPass = 0, hardTotal = 0;

for (const fx of FIXTURES) {
  const p = path.join(ROOT, 'testdata', fx.name + '.bgra');
  if (!fs.existsSync(p)) { console.log(`--- ${fx.name} 缺文件，跳过 ---\n`); continue; }
  const { W, H, rgba } = loadFixture(fx.name);
  console.log(`===== ${fx.name}  (${W}x${H}) =====`);

  // ---- 棋盘定位 ----
  const tD = Date.now();
  const r = E.autoDetectDebug(rgba, W, H);
  const msD = Date.now() - tD;
  if (!r.corners) { console.log(`❌ 棋盘检测失败 (${msD}ms)\n`); continue; }
  const c = r.corners;
  const cw = (c[1][0] - c[0][0]) / 8;
  const ch = (c[3][1] - c[0][1]) / 9;
  const pf = r.debug && r.debug.pieceFit;
  console.log(`四角 ${c.map(q => `(${q[0].toFixed(1)},${q[1].toFixed(1)})`).join(' ')}`);
  console.log(`格宽 ${cw.toFixed(2)}  格高 ${ch.toFixed(2)}  比例 ${(cw / ch).toFixed(3)}  命中 ${pf ? pf.hits : '?'}/90  定位 ${msD}ms`);

  // ---- 连续 3 帧（模拟真实流；逐格置信度会自我修正） ----
  E.reset();
  E.setCorners(c);
  const t = Date.now();
  let out = null;
  for (let f = 0; f < 3; f++) out = E.process(rgba, W, H, { timeMs: 900 });
  const msF = (Date.now() - t) / 3;

  const board = (out.fen || '').split(' ')[0];
  console.log(`FEN ${board}`);
  console.log(`着法 ${out.suggestChinese}  评分 ${out.score}  胜率 ${out.winrate}%  深 ${out.depth}  我方 ${out.mySide}  单帧 ${msF.toFixed(0)}ms`);

  // ---- 校验 ----
  let redN = 0, blkN = 0;
  for (const ch2 of board) {
    if ('RNBAKCP'.includes(ch2)) redN++;
    else if ('rnbakcp'.includes(ch2)) blkN++;
  }
  const countsOk = redN <= 16 && blkN <= 16 && (redN + blkN) >= 6;
  const legal = countsOk && /[Kk]/.test(board);
  console.log(`子数 红${redN} 黑${blkN}  ${countsOk ? '✅' : '⚠️'}   将帅 ${legal ? '在' : '缺'}`);

  if (fx.expect) {
    hardTotal++;
    const ok = (board === fx.expect);
    if (ok) hardPass++;
    console.log(ok ? '✅ 与标准开局完全一致' : '⚠️ 期望 ' + fx.expect);
  }
  console.log('');
}

console.log(`===== 开局用例 ${hardPass}/${hardTotal} 完全正确 =====`);
