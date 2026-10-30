#!/usr/bin/env node
/*
 * eval-glyph2.mjs —— 用「形状特征分类」在全部真实截图上做逐格评测
 *
 * 目的：验证它比模板逐像素比对更抗重采样。
 * 输入：testdata 里的开局图（多尺度，有真值）+ 你给的三张残局图
 * 输出：每张图的错格数、错在哪、候选是谁
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const REC = require(path.join(ROOT, 'src', 'vision', 'recognizer.js'));
const G2 = require(path.join(ROOT, 'src', 'vision', 'glyph2.js'));

const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR';
const CODE_OF = {
  K: 1, A: 2, B: 3, N: 4, R: 5, C: 6, P: 7,
  k: 8, a: 9, b: 10, n: 11, r: 12, c: 13, p: 14
};
const CH2CODE = CODE_OF;
const PC2CH = ['', 'K', 'A', 'B', 'N', 'R', 'C', 'P', 'k', 'a', 'b', 'n', 'r', 'c', 'p'];

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

/** 求 90 个格点（用引擎的定位） */
function gridOf(name) {
  const { W, H, rgba } = loadFixture(name);
  const corners = REC.autoDetectBoard(rgba, W, H);
  if (!corners) return null;
  const p00 = corners[0], p10 = corners[1], p11 = corners[2], p01 = corners[3];
  const cell = Math.min(
    Math.hypot(p10[0] - p00[0], p10[1] - p00[1]) / 8,
    Math.hypot(p01[0] - p00[0], p01[1] - p00[1]) / 9
  );
  const pts = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const u = c / 8, v = r / 9;
      const a = (1 - u) * (1 - v), b = u * (1 - v), cc = u * v, d = (1 - u) * v;
      pts.push([
        a * p00[0] + b * p10[0] + cc * p11[0] + d * p01[0],
        a * p00[1] + b * p10[1] + cc * p11[1] + d * p01[1]
      ]);
    }
  }
  return { W, H, rgba, cell, pts };
}

// ---------- 训练：从三个尺度的标准开局抠字 ----------
const TRAIN = ['real_442x959', 'real_jjchess', 's736', 's884', 'sharp_882'];
const model = { samples: {}, centroids: {} };

for (const src of TRAIN) {
  const g = gridOf(src);
  if (!g) { console.log('train skip ' + src); continue; }
  const chars = fenChars(START_FEN);
  const half = g.cell * 0.33;
  for (let sq = 0; sq < 90; sq++) {
    const ch = chars[sq];
    if (ch === 'E') continue;
    const key = String(CH2CODE[ch]);
    const gl = G2.extractGlyph(g.rgba, g.W, g.H, g.pts[sq][0], g.pts[sq][1], half);
    if (gl.inkCount < 40) continue;
    if (!model.samples[key]) model.samples[key] = [];
    if (model.samples[key].length >= 8) continue;
    model.samples[key].push(G2.features(gl));
  }
}

for (const key in model.samples) {
  const list = model.samples[key];
  const c = new Float32Array(G2.FEAT_LEN);
  for (const f of list) for (let i = 0; i < c.length; i++) c[i] += f[i];
  for (let i = 0; i < c.length; i++) c[i] /= list.length;
  model.centroids[key] = c;
}
const counts = Object.keys(model.samples).map(k => k + ':' + model.samples[k].length).join(' ');
console.log('训练样本 ' + counts + '\n');

// ---------- 评测 ----------
const CASES = [
  ['real_jjchess', START_FEN],
  ['real_442x959', START_FEN],
  ['s736', START_FEN],
  ['puzzle4_700', '3ak4/9/9/9/9/9/9/9/9/5K1N1'],
  ['puzzle6_700', '4k4/9/9/4r4/4r4/4C4/4C4/9/9/4K4'],
  ['puzzle14_700', '2b6/1Nnk5/1Pra5/1PpP5/2b6/3C5/2Npp4/2prC4/2pcK4/3A5'],
  ['puzzle26_700', '2r1kabnC/1A1Pa2c1/3Np1r2/3A5/4c4/9/9/5p3/4p4/3K5'],
  ['puzzle26_589', '2r1kabnC/1A1Pa2c1/3Np1r2/3A5/4c4/9/9/5p3/4p4/3K5']
];

let totalErr = 0, totalCells = 0;

for (const [name, truthFen] of CASES) {
  const g = gridOf(name);
  if (!g) { console.log(name + ' 定位失败'); continue; }
  const half = g.cell * 0.33;
  const truth = fenChars(truthFen);
  let err = 0;
  const bad = [];

  // 占用判定用引擎自己的结果（那部分已经验证过），这里只比「有子的格子是哪个子」
  const rec = new REC.BoardRecognizer({ corners: REC.autoDetectBoard(g.rgba, g.W, g.H) });
  const stats = rec.sampleAll(g.rgba, g.W, g.H, true);
  const cls = rec.classify(stats);

  for (let sq = 0; sq < 90; sq++) {
    const t = truth[sq];
    const engineSays = (cls.codes[sq] !== 0);
    const truthSays = (t !== 'E');
    totalCells++;
    if (engineSays !== truthSays) {
      err++; totalErr++;
      if (bad.length < 6) bad.push('r' + ((sq / 9) | 0) + 'c' + (sq % 9) + ' 占用不符 望' + t);
      continue;
    }
    if (!truthSays) continue;

    const gl = G2.extractGlyph(g.rgba, g.W, g.H, g.pts[sq][0], g.pts[sq][1], half);
    const wantRed = (gl.redRatio >= 0.22);
    const fv = G2.features(gl);
    const c = G2.classify(fv, model, wantRed);
    const pred = c.key ? PC2CH[+c.key] : 'E';
    const expr = cls.codes[sq] ? PC2CH[cls.codes[sq]] : 'E';
    if (pred !== t) {
      err++; totalErr++;
      if (bad.length < 6) bad.push('r' + ((sq / 9) | 0) + 'c' + (sq % 9) + ' 望' + t + ' 特征版=' + pred + ' 现值=' + expr + ' [' + c.ranked.map(x => PC2CH[+x.key] + ':' + x.score.toFixed(2)).join(' ') + ']');
    }
  }
  console.log(name.padEnd(14) + ' 错 ' + String(err).padStart(2) + ' 格   ' + bad.join('  '));
}

console.log('\n合计 错 ' + totalErr + ' / ' + totalCells + ' 格');
