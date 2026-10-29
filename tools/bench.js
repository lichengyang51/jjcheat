'use strict';
/*
 * 引擎基准测试
 *   node tools/bench.js [每步毫秒]
 */
const { Position } = require('../src/cst/position');
const { Searcher } = require('../src/cst/search');
const { mvToChinese } = require('../src/cst/notation');
const C = require('../src/cst/constants');

const TIME = parseInt(process.argv[2] || '1500', 10);
const searcher = new Searcher();

function show(title, fen, opts) {
  const pos = new Position(fen);
  const t0 = Date.now();
  const r = searcher.search(pos, (opts && opts.timeMs) || TIME, 0);
  const ms = Date.now() - t0;
  const cn = r.bestmove ? mvToChinese(pos.board, C.ucciToMv(r.bestmove), pos.side) : '(无)';
  const cp = r.score / 100;
  const wr = (r.winrate * 100).toFixed(1);
  console.log(`\n【${title}】`);
  console.log(`  FEN      ${fen}`);
  console.log(`  建议     ${r.bestmove}   ${cn}`);
  console.log(`  评分     ${cp >= 0 ? '+' : ''}${cp.toFixed(2)}   (红方视角, 兵=1.00)`);
  console.log(`  胜率(红) ${wr}%`);
  console.log(`  深度     ${r.depth} 层   节点 ${r.nodes.toLocaleString()}   ${ms}ms   ${Math.round(r.nodes / Math.max(1, ms) * 1000).toLocaleString()} nps`);
  console.log(`  PV       ${r.pv.slice(0, 8).join(' ')}`);
  return r;
}

console.log('==================================================');
console.log('  中国象棋引擎基准测试');
console.log('==================================================');

show('开局', C.START_FEN);

show('中炮过河车对屏风马（布置完成）',
  'r1bakab1r/9/1cn1c1n2/p1p1p1p1p/9/2P6/P3P1P1P/1CN1C1N2/9/R1BAKAB1R w - - 0 1');

show('弃马十三招（红方有杀）',
  'r1ba1a3/4kn3/2n1b4/pNp1p1p1p/4c4/6P2/P1P2R2P/1CcC5/9/2BAKAB2 w - - 0 1');

show('红方车马炮三子归边',
  '3k5/4a4/4b4/9/9/9/4R4/4N4/3p5/3K1A3 w - - 0 1');

show('残局：单车对单士',
  '3k5/9/9/9/9/9/4R4/9/4a4/4K4 w - - 0 1');

console.log('\n==================================================');
console.log('  连续搜索稳定性（同一引擎实例连跑 20 次）');
console.log('==================================================');
let totalNodes = 0, totalMs = 0, ok = 0, fail = 0;
for (let i = 0; i < 20; i++) {
  const pos = new Position(C.START_FEN);
  const t0 = Date.now();
  const r = searcher.search(pos, 400, 0);
  const ms = Date.now() - t0;
  totalNodes += r.nodes; totalMs += ms;
  const legal = pos.genLegalMoves().some(m => C.mvToUcci(m) === r.bestmove);
  if (legal) ok++; else fail++;
  process.stdout.write(legal ? '.' : 'X');
}
console.log('');
console.log(`合法建议 ${ok}/20, 非法 ${fail}/20`);
console.log(`平均 ${(totalNodes / 20).toLocaleString()} 节点 / ${Math.round(totalMs / 20)}ms`);

console.log('\n完成');
