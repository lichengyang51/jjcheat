'use strict';
/*
 * 验证打包产物：模拟 iOS JavaScriptCore 的裸全局环境加载 dist/engine.js
 * 不依赖 Node 的 require —— 用 vm 造一个干净沙箱
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'dist', 'engine.js');
const code = fs.readFileSync(file, 'utf8');

// 造一个只有基础全局变量的沙箱（模拟 JSC）
const sandbox = { console, Date, Math, JSON, Uint8Array, Int8Array, Uint8ClampedArray, Int32Array, Float32Array, Array, Object, String, Number };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

console.log('=== 沙箱加载 dist/engine.js ===');
const t0 = Date.now();
vm.runInContext(code, sandbox, { filename: 'engine.js' });
console.log('加载耗时', Date.now() - t0, 'ms');
const E = sandbox.JJEngine;
if (!E) { console.log('未暴露 JJEngine'); process.exit(1); }
console.log('版本', E.version);
console.log('导出方法:', Object.keys(E).join(', '));

console.log('\n=== analyzeFen 开局 ===');
const r = E.analyzeFen('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1', 800);
console.log(JSON.stringify(r, null, 2));

console.log('\n=== fenToGrid 校验 ===');
const g = E.fenToGrid('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1');
let cnt = [0, 0, 0];
g.forEach(v => cnt[v]++);
console.log('空=' + cnt[0] + ' 红=' + cnt[1] + ' 黑=' + cnt[2] + '  (期望 58/16/16)');

console.log('\n=== 标定 + 合成图像 端到端放烟测试 ===');
// 造一张假的棋盘图：浅木色背景 + 开局 32 个棋子（白色圆盘 + 红/黑字）
const W = 480, H = 540;
const px = new Uint8ClampedArray(W * H * 4);
// 背景木色
for (let i = 0; i < W * H; i++) {
  px[i * 4] = 196; px[i * 4 + 1] = 160; px[i * 4 + 2] = 110; px[i * 4 + 3] = 255;
}
// 四角（10px 内缩的边界交叉点）
const corners = [[40, 40], [440, 40], [440, 500], [40, 500]];
function gridPt(r, c) {
  const u = c / 8, v = r / 9;
  const x = (1 - u) * (1 - v) * corners[0][0] + u * (1 - v) * corners[1][0] + u * v * corners[2][0] + (1 - u) * v * corners[3][0];
  const y = (1 - u) * (1 - v) * corners[0][1] + u * (1 - v) * corners[1][1] + u * v * corners[2][1] + (1 - u) * v * corners[3][1];
  return [x, y];
}
const C = E.C;
const pos = { board: E.fenToGrid('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1') };
// 画棋子：白色圆盘 + 字
for (let sq = 0; sq < 90; sq++) {
  const v = pos.board[sq];
  if (!v) continue;
  const r = (sq / 9) | 0, c = sq % 9;
  const [cx, cy] = gridPt(r, c);
  const rad = 21;
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > rad * rad) continue;
      const x = Math.round(cx + dx), y = Math.round(cy + dy);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4;
      // 盘面：象牙白
      px[i] = 242; px[i + 1] = 236; px[i + 2] = 224;
    }
  }
  // 字：中心小块（红/黑）
  const isRed = v === 1;
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      if (dx * dx + dy * dy > 64) continue;
      const x = Math.round(cx + dx), y = Math.round(cy + dy);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4;
      if (isRed) { px[i] = 190; px[i + 1] = 30; px[i + 2] = 30; }
      else { px[i] = 40; px[i + 1] = 40; px[i + 2] = 40; }
    }
  }
}

E.setCorners(corners);
E.reset();
const learned = E.learnBoard(px, W, H);
console.log('背景学习:', JSON.stringify(learned));

// 识别当前帧（应与开局一致 → 不走子）
const out1 = E.process(px, W, H, { timeMs: 600 });
console.log('第 1 帧 走子检测 =', out1.moveDetected, ' FEN =', out1.fen);
console.log('           建议 =', out1.suggest, out1.suggestChinese, ' 分 =', out1.scoreText, ' 胜率 =', out1.winrate + '%', ' 深度 =', out1.depth);

// 模拟「炮二平五」：h7 → e7
function drawPiece(sq, kind) {
  const r = (sq / 9) | 0, c = sq % 9;
  const [cx, cy] = gridPt(r, c);
  const rad = 21;
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > rad * rad) continue;
      const x = Math.round(cx + dx), y = Math.round(cy + dy);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4;
      if (kind === 0) { px[i] = 196; px[i + 1] = 160; px[i + 2] = 110; }
      else if (kind === 1) { px[i] = 242; px[i + 1] = 236; px[i + 2] = 224; }
      else if (kind === 2) { px[i] = 190; px[i + 1] = 30; px[i + 2] = 30; }
      else { px[i] = 40; px[i + 1] = 40; px[i + 2] = 40; }
    }
  }
}
const fromSq = 7 * 9 + 7; // h7 红炮
const toSq = 7 * 9 + 4;   // e7
drawPiece(fromSq, 0);     // 起点变空
drawPiece(toSq, 1);       // 先铺白盘
drawPiece(toSq, 2);       // 再画红字

const out2 = E.process(px, W, H, { timeMs: 800 });
console.log('\n第 2 帧 走子检测 =', out2.moveDetected, ' 走法 =', out2.move, out2.moveChinese, ' diff =', out2.diff);
console.log('       FEN =', out2.fen);
console.log('       建议 =', out2.suggest, out2.suggestChinese, ' 分 =', out2.scoreText, ' 胜率(红) =', out2.winrate + '%', ' 深度 =', out2.depth, ' 耗时 =', out2.elapsed + 'ms');
console.log('       从', out2.from, '到', out2.to);

console.log('\n=== 全部通过 ===');
