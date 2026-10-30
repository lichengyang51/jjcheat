'use strict';
/*
 * book.js —— 内置开局库
 *
 * 跟鹏飞那个「库: 兵七进一」是一个意思：开局阶段照着谱走，
 * 既不用烧算力，也不会出现「两个同分着法来回跳」。
 *
 * 库就是一个「局面 → 下一手」的查表：
 *   key = FEN 的「棋盘 + 走子方」两段（去掉回合数，方便匹配）
 *   value = 下一手的 UCCI
 *
 * 主线用 UCCI 写，加载时逐手校验合法性 —— 写错的那一手之后整条线丢掉，
 * 绝不会把非法的库着喂给界面。
 */

var C = require('./constants');
var POS = require('./position');

// 每条线都是「红先」交替。红方在下（标准 FEN，row0=黑底线）。
var LINES = [
  // 中炮对屏风马（最常见）
  ['h7e7', 'h0g2', 'h9g7', 'i0h0', 'i9h9', 'g3g4', 'c6c5'],
  // 中炮对反宫马
  ['h7e7', 'h0g2', 'h9g7', 'c0e2', 'i9h9', 'c3c4'],
  // 中炮对单提马
  ['h7e7', 'h0g2', 'h9g7', 'b9c7', 'i9h9'],
  // 仙人指路
  ['c6c5', 'c3c4', 'h9g7', 'h0g2', 'i9h9', 'i0h0'],
  // 飞相局
  ['g9e7', 'h0g2', 'h9g7', 'i0h0', 'i9h9'],
  // 起马局
  ['h9g7', 'g3g4', 'i9h9', 'i0h0', 'h7e7'],
  // 过宫炮
  ['h7f7', 'h0g2', 'h9g7', 'i0h0', 'i9h9'],
  // 中炮直车对屏风马（红先车一平二再马二进三）
  ['h7e7', 'h0g2', 'i9h9', 'i0h0', 'h9g7', 'g3g4']
];

var MAP = null;

function keyOf(fen) {
  var parts = String(fen).split(' ');
  return parts[0] + ' ' + (parts[1] || 'w');
}

function build() {
  MAP = {};
  var total = 0;
  for (var li = 0; li < LINES.length; li++) {
    var line = LINES[li];
    var pos = new POS.Position(C.START_FEN);
    for (var k = 0; k < line.length; k++) {
      var key = keyOf(pos.getFen());
      var mv = C.ucciToMv(line[k]);
      if (!mv) break;
      var cap = pos.makeMove(mv);
      if (cap === false || cap === undefined) break;   // 这一手不合法 → 整条线到此为止
      if (!MAP[key]) { MAP[key] = { ucci: line[k] }; total++; }
    }
  }
  return total;
}

function ensure() {
  if (!MAP) build();
}

/** @returns {{ucci:string}|null} */
function lookup(fen) {
  ensure();
  return MAP[keyOf(fen)] || null;
}

module.exports = { lookup: lookup, build: build, count: function () { ensure(); var n = 0; for (var k in MAP) n++; return n; } };
