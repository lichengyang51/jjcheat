'use strict';
/*
 * perft 自检 —— 用公认的中国象棋 perft 基准验证走法生成
 *   期望: d1=44  d2=1920  d3=79666  d4=3290240  d5=133312995
 */
const { Position } = require('../src/cst/position');
const C = require('../src/cst/constants');

const EXPECT = { 1: 44, 2: 1920, 3: 79666, 4: 3290240, 5: 133312995 };
const maxDepth = parseInt(process.argv[2] || '4', 10);

console.log('=== FEN 往返 ===');
const p = new Position(C.START_FEN);
const fen = p.getFen();
console.log('in :', C.START_FEN);
console.log('out:', fen);
console.log('往返一致:', fen.split(' ').slice(0, 2).join(' ') === C.START_FEN.split(' ').slice(0, 2).join(' '));
console.log('红方王位:', p.kingSq[0], '黑方王位:', p.kingSq[1]);

console.log('\n=== perft ===');
let allOk = true;
for (let d = 1; d <= maxDepth; d++) {
  const pos = new Position(C.START_FEN);
  const t0 = Date.now();
  const n = pos.perft(d);
  const ms = Date.now() - t0;
  const exp = EXPECT[d];
  const ok = (exp === undefined) || (n === exp);
  if (!ok) allOk = false;
  const nps = ms > 0 ? Math.round(n / (ms / 1000)) : n;
  console.log(
    `d${d}: ${n}`.padEnd(20) +
    (exp !== undefined ? `期望 ${exp}  ${ok ? 'OK' : '<<< 不符 >>>'}` : '(无基准)').padEnd(30) +
    ` ${ms}ms  ${nps.toLocaleString()} nps`
  );
}

console.log('\n=== 走法生成抽查（开局红方 44 步）===');
const pos2 = new Position(C.START_FEN);
const moves = pos2.genLegalMoves();
console.log('合法走法数:', moves.length);
const ucci = moves.map(m => C.mvToUcci(m)).sort();
console.log(ucci.join(' '));

console.log('\n=== 中文记谱抽查 ===');
for (const m of moves.slice(0, 6)) {
  console.log(C.mvToUcci(m).padEnd(6), C.mvToChinese(pos2.board, m, C.RED));
}

console.log('\n=== 合法性：将帅照面检测 ===');
// 红帅 e0? 用一列空档局面：黑将在 e0(row0 col4 = sq4), 红帅 e9(sq 4+81=85)
const faceFen = '4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1';
const pf = new Position(faceFen);
console.log('初始就照面，红方被将军?', pf.inCheck(C.RED), '(应为 true)');
console.log('红帅可走步数(应为 0 或侧移):', pf.genLegalMoves().map(m => C.mvToUcci(m)).join(' '));

console.log('\n结果:', allOk ? 'perft 全部通过' : 'perft 存在不符');
process.exit(allOk ? 0 : 1);
