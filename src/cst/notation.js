'use strict';
/*
 * 中国象棋记谱：
 *   红方列号 从右到左 一..九（col 8 = 一，col 0 = 九）
 *   黑方列号 从左到右 1..9 （col 0 = 1，col 8 = 9）
 *   动作：平（同一行） / 进 / 退
 *   直行子（车炮兵将）：进/退 + 步数
 *   斜行子（马象士）  ：进/退 + 目标列号
 *   同列有两个同名子 ：用「前/后」替代列号
 */
const C = require('./constants');

const RED_DIG = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const BLK_DIG = ['１', '２', '３', '４', '５', '６', '７', '８', '９'];
const RED_NAME = { 1: '帅', 2: '仕', 3: '相', 4: '马', 5: '车', 6: '炮', 7: '兵' };
const BLK_NAME = { 1: '将', 2: '士', 3: '象', 4: '马', 5: '车', 6: '炮', 7: '卒' };

/**
 * @param {Int8Array} board 90 格棋盘
 * @param {number} m 内部走法
 * @param {number} side 走子方 C.RED / C.BLACK
 * @returns {string} 中文着法，如「炮二平五」
 */
function mvToChinese(board, m, side) {
  const from = C.mvFrom(m), to = C.mvTo(m);
  const pc = board[from];
  if (!pc) return C.mvToUcci(m);

  const t = C.typeOf(pc);
  const isRed = (side === C.RED);
  const fr = (from / 9) | 0, fc = from % 9;
  const tr = (to / 9) | 0, tc = to % 9;

  const dig = (n) => (isRed ? RED_DIG[n - 1] : BLK_DIG[n - 1]);
  const fileNo = (col) => (isRed ? 9 - col : col + 1);
  const name = isRed ? RED_NAME[t] : BLK_NAME[t];

  // 找同列同名子
  const same = [];
  for (let sq = 0; sq < 90; sq++) {
    if (board[sq] === pc && (sq % 9) === fc) same.push(sq);
  }

  let head;
  if (same.length >= 2) {
    // 靠近对方的一方为「前」
    same.sort((a, b) => (isRed ? a - b : b - a));
    const idx = same.indexOf(from);
    let pos;
    if (same.length === 2) pos = idx === 0 ? '前' : '后';
    else if (same.length === 3) pos = ['前', '中', '后'][idx];
    else pos = idx === 0 ? '前' : (idx === same.length - 1 ? '后' : String(idx + 1));
    head = pos + name;
  } else {
    head = name + dig(fileNo(fc));
  }

  if (fr === tr) return head + '平' + dig(fileNo(tc));

  const forward = isRed ? (tr < fr) : (tr > fr);
  const act = forward ? '进' : '退';

  if (t === C.HORSE || t === C.ELEPHANT || t === C.ADVISOR) {
    return head + act + dig(fileNo(tc));
  }
  return head + act + dig(Math.abs(tr - fr));
}

/** UCCI 走法串 -> 中文（无棋盘信息时降级） */
function ucciToChinese(board, ucci, side) {
  return mvToChinese(board, C.ucciToMv(ucci), side);
}

module.exports = { mvToChinese, ucciToChinese };
