'use strict';
/*
 * 中国象棋引擎 —— 常量与定义
 * 坐标系: sq = row * 9 + col
 *   row 0 = 黑方底线（屏幕最上方）   row 9 = 红方底线（屏幕最下方）
 *   col 0 = 屏幕最左                 col 8 = 屏幕最右
 * 这与 UCCI 坐标完全一致: 列 a..i = col 0..8, 行 0..9 = row 0..9
 */

const RED = 0;
const BLACK = 1;

const EMPTY = 0;
const KING = 1;
const ADVISOR = 2;
const ELEPHANT = 3;
const HORSE = 4;
const ROOK = 5;
const CANNON = 6;
const PAWN = 7;

// 红 1..7 / 黑 8..14
const RK = 1, RA = 2, RB = 3, RN = 4, RR = 5, RC = 6, RP = 7;
const BK = 8, BA = 9, BB = 10, BN = 11, BR = 12, BC = 13, BP = 14;

function colorOf(pc) { return pc > 7 ? BLACK : RED; }
function typeOf(pc) { return pc > 7 ? pc - 7 : pc; }

const FEN2PC = {
  'K': RK, 'A': RA, 'B': RB, 'N': RN, 'R': RR, 'C': RC, 'P': RP,
  'k': BK, 'a': BA, 'b': BB, 'n': BN, 'r': BR, 'c': BC, 'p': BP
};
const PC2FEN = ['', 'K', 'A', 'B', 'N', 'R', 'C', 'P', 'k', 'a', 'b', 'n', 'r', 'c', 'p'];

const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

// 走法编码: from | (to << 7)   两者都 < 90 < 128
function mv(from, to) { return from | (to << 7); }
function mvFrom(m) { return m & 127; }
function mvTo(m) { return m >> 7; }

// UCCI 走法串 <-> 内部走法
function sqToUcci(sq) {
  const r = (sq / 9) | 0, c = sq % 9;
  return String.fromCharCode(97 + c) + r;
}
function ucciToSq(s) {
  const c = s.charCodeAt(0) - 97;
  const r = s.charCodeAt(1) - 48;
  if (c < 0 || c > 8 || r < 0 || r > 9) return -1;
  return r * 9 + c;
}
function mvToUcci(m) { return sqToUcci(mvFrom(m)) + sqToUcci(mvTo(m)); }
function ucciToMv(s) {
  if (!s || s.length < 4) return 0;
  const a = ucciToSq(s.slice(0, 2)), b = ucciToSq(s.slice(2, 4));
  if (a < 0 || b < 0) return 0;
  return mv(a, b);
}

// 中文着法描述（给 HUD 显示用）
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

/**
 * 生成中文着法记谱，例如「炮二平五」「车８进３」
 * @param {Int8Array} board
 * @param {number} m 内部走法
 * @param {number} side 走子方
 */
function mvToChinese(board, m, side) {
  const from = mvFrom(m), to = mvTo(m);
  const pc = board[from];
  if (!pc) return mvToUcci(m);
  const t = typeOf(pc);
  const isRed = side === RED;
  const fr = (from / 9) | 0, fc = from % 9;
  const tr = (to / 9) | 0, tc = to % 9;

  // 红方从右往左数 1..9（col 8 = 一），黑方从左往右数 1..9（col 0 = 1）
  const fileOf = (col) => (isRed ? 9 - col : col + 1);
  const numStr = (n) => (isRed ? CN_NUM[n - 1] : String(n));
  const fullNum = (n) => (isRed ? ['一', '二', '三', '四', '五', '六', '七', '八', '九'][n - 1] : ['１', '２', '３', '４', '５', '６', '７', '８', '９'][n - 1]);

  const NAMES = isRed
    ? { 1: '帅', 2: '仕', 3: '相', 4: '马', 5: '车', 6: '炮', 7: '兵' }
    : { 1: '将', 2: '士', 3: '象', 4: '马', 5: '车', 6: '炮', 7: '卒' };

  const name = NAMES[t];
  let f1 = fileOf(fc);

  // 同一列上有两个同名棋子 → 用「前/后」
  let prefix = '';
  let sameFile = [];
  for (let sq = 0; sq < 90; sq++) {
    if (board[sq] === pc && (sq % 9) === fc) sameFile.push(sq);
  }
  if (sameFile.length === 2) {
    // 靠近对方的一方为「前」
    sameFile.sort((x, y) => (isRed ? x - y : y - x));
    prefix = sameFile[0] === from ? '前' : '后';
    f1 = -1;
  } else if (sameFile.length > 2) {
    sameFile.sort((x, y) => (isRed ? x - y : y - x));
    const idx = sameFile.indexOf(from);
    prefix = ['前', '中', '后'][Math.min(idx, 2)] || '前';
    f1 = -1;
  }

  const head = prefix === '' ? (name + fullNum(f1)) : (prefix + name);

  if (fr === tr) {
    // 纵向
    const steps = Math.abs(tr - fr);
    return head + (isRed ? '进' : '进') + fullNum(steps);
  }
  if (fc === tc) {
    const steps = Math.abs(tr - fr);
    return head + '进' + fullNum(steps);
  }
  // 横走
  const dir = (tr === fr) ? '' : '';
  if (fr === tr) {
    // 平
  }
  // 平
  const isAdvance = isRed ? (tr < fr) : (tr > fr);
  if (fr === tr || Math.abs(tc - fc) > 0) {
    // 判断是不是"平"
  }
  if (fr === tr) return head + '平' + fullNum(fileOf(tc));
  if (isAdvance && (t === ROOK || t === CANNON || t === PAWN || t === KING)) {
    return head + '进' + fullNum(fileOf(tc));
  }
  if (!isAdvance && (t === ROOK || t === CANNON || t === PAWN || t === KING)) {
    return head + '退' + fullNum(fileOf(tc));
  }
  // 马/象/士 斜走
  if (isAdvance) return head + '进' + fullNum(fileOf(tc));
  return head + '退' + fullNum(fileOf(tc));
}

module.exports = {
  RED, BLACK, EMPTY,
  KING, ADVISOR, ELEPHANT, HORSE, ROOK, CANNON, PAWN,
  RK, RA, RB, RN, RR, RC, RP,
  BK, BA, BB, BN, BR, BC, BP,
  colorOf, typeOf,
  FEN2PC, PC2FEN, START_FEN,
  mv, mvFrom, mvTo,
  sqToUcci, ucciToSq, mvToUcci, ucciToMv,
  mvToChinese,
  CN_NUM
};
