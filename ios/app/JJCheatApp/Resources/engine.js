/* ============================================================
 *  JJ象棋 辅助引擎内核 —— 单文件打包
 *  目标运行环境: iOS JavaScriptCore / Node / 浏览器
 *  生成时间: 2026-10-30T06:05:36.000Z
 *  模块数: 8
 * ============================================================ */
(function (global) {
'use strict';
var __modules = {};
var __cache = {};

/* ---- cst/constants ---- */
__modules["cst/constants"] = function (module, exports, require) {
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

};

/* ---- cst/position ---- */
__modules["cst/position"] = function (module, exports, require) {
'use strict';
/*
 * 中国象棋 —— 棋盘表示 / 走法生成 / 合法性 / perft
 * 全部使用预计算表，热路径无对象分配。
 */
const C = require('./constants');

const RAYS = new Array(90 * 4);          // dir 0=上 1=下 2=左 3=右，由近及远
const HORSE_MV = new Array(90);          // [[to, leg], ...]
const ELEPH_MV = new Array(90);          // [[to, eye], ...]
const ADVISOR_MV = new Array(90);
const KING_MV = new Array(90);
const PAWN_MV = [new Array(90), new Array(90)];       // [RED, BLACK]
const HORSE_ATK = new Array(90);         // 能攻击该格的马位 [[horseSq, legSq], ...]

(function build() {
  const HORSE_DEF = [
    [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
    [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1]
  ];
  const ELEPH_DEF = [[-2, -2, -1, -1], [-2, 2, -1, 1], [2, -2, 1, -1], [2, 2, 1, 1]];
  const ADVISOR_DEF = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const KING_DEF = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  const inPalace = (r, c, color) =>
    c >= 3 && c <= 5 && (color === C.RED ? (r >= 7 && r <= 9) : (r >= 0 && r <= 2));

  for (let sq = 0; sq < 90; sq++) {
    const r = (sq / 9) | 0, c = sq % 9;

    const up = [], down = [], left = [], right = [];
    for (let rr = r - 1; rr >= 0; rr--) up.push(rr * 9 + c);
    for (let rr = r + 1; rr <= 9; rr++) down.push(rr * 9 + c);
    for (let cc = c - 1; cc >= 0; cc--) left.push(r * 9 + cc);
    for (let cc = c + 1; cc <= 8; cc++) right.push(r * 9 + cc);
    RAYS[sq * 4] = up;
    RAYS[sq * 4 + 1] = down;
    RAYS[sq * 4 + 2] = left;
    RAYS[sq * 4 + 3] = right;

    const hm = [];
    for (let i = 0; i < HORSE_DEF.length; i++) {
      const d = HORSE_DEF[i];
      const nr = r + d[0], nc = c + d[1];
      if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
      const lr = r + d[2], lc = c + d[3];
      hm.push(nr * 9 + nc, lr * 9 + lc);
    }
    HORSE_MV[sq] = hm;

    const em = [];
    for (let i = 0; i < ELEPH_DEF.length; i++) {
      const d = ELEPH_DEF[i];
      const nr = r + d[0], nc = c + d[1];
      if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
      // 象不过河
      if (nr > 4 && nr < 5) continue;
      em.push(nr * 9 + nc, (r + d[2]) * 9 + (c + d[3]));
    }
    // 上面过滤条件对 row=4/5 两侧都要精确判断：红象 row>=5，黑象 row<=4
    // 用颜色拆分，见下方 genMove
    ELEPH_MV[sq] = em;

    const am = [];
    for (let i = 0; i < ADVISOR_DEF.length; i++) {
      const nr = r + ADVISOR_DEF[i][0], nc = c + ADVISOR_DEF[i][1];
      if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
      if (!inPalace(nr, nc, C.RED) && !inPalace(nr, nc, C.BLACK)) continue;
      am.push(nr * 9 + nc);
    }
    ADVISOR_MV[sq] = am;

    const km = [];
    for (let i = 0; i < KING_DEF.length; i++) {
      const nr = r + KING_DEF[i][0], nc = c + KING_DEF[i][1];
      if (!inPalace(nr, nc, C.RED) && !inPalace(nr, nc, C.BLACK)) continue;
      km.push(nr * 9 + nc);
    }
    KING_MV[sq] = km;

    // 兵：红向上(row-1)，黑向下(row+1)；过河后左右
    const redP = [], blkP = [];
    if (r - 1 >= 0) redP.push((r - 1) * 9 + c);
    if (r <= 4) { // 红兵过河
      if (c > 0) redP.push(r * 9 + c - 1);
      if (c < 8) redP.push(r * 9 + c + 1);
    }
    PAWN_MV[C.RED][sq] = redP;
    if (r + 1 <= 9) blkP.push((r + 1) * 9 + c);
    if (r >= 5) { // 黑卒过河
      if (c > 0) blkP.push(r * 9 + c - 1);
      if (c < 8) blkP.push(r * 9 + c + 1);
    }
    PAWN_MV[C.BLACK][sq] = blkP;

    // 能攻击 sq 的马位
    const ha = [];
    for (let i = 0; i < HORSE_DEF.length; i++) {
      const d = HORSE_DEF[i];
      // 马在 sq - d 的位置跳到 sq
      const hr = r - d[0], hc = c - d[1];
      if (hr < 0 || hr > 9 || hc < 0 || hc > 8) continue;
      const legR = hr + d[2], legC = hc + d[3];
      ha.push(hr * 9 + hc, legR * 9 + legC);
    }
    HORSE_ATK[sq] = ha;
  }
})();

// 象的可走格（按颜色过滤过河）
const ELEPH_MV_C = [[], []];
(function buildElephantByColor() {
  for (const color of [C.RED, C.BLACK]) {
    const arr = new Array(90);
    for (let sq = 0; sq < 90; sq++) {
      const list = ELEPH_MV[sq];
      const keep = [];
      for (let i = 0; i < list.length; i += 2) {
        const to = list[i];
        const tr = (to / 9) | 0;
        if (color === C.RED && tr < 5) continue;   // 红象不过河
        if (color === C.BLACK && tr > 4) continue; // 黑象不过河
        keep.push(list[i], list[i + 1]);
      }
      arr[sq] = keep;
    }
    ELEPH_MV_C[color] = arr;
  }
})();

// ---------- Zobrist ----------
const ZOB = new Int32Array(15 * 90);
const ZOB_SIDE = (function seed() {
  let s = 0x9e3779b9 | 0;
  const rnd = () => {
    s ^= s << 13; s |= 0;
    s ^= s >>> 17;
    s ^= s << 5; s |= 0;
    return s;
  };
  for (let i = 0; i < 15 * 90; i++) ZOB[i] = rnd();
  return rnd();
})();

/**
 * 局面
 */
class Position {
  constructor(fen) {
    this.board = new Int8Array(90);
    this.side = C.RED;
    this.kingSq = [-1, -1];
    this.key = 0;
    this.halfMove = 0;   // 半回合计数
    this.fullMove = 1;
    this.history = [];   // 走法历史（为重复局面）
    this.keyHistory = []; // 局面 key 历史
    this.setFen(fen || C.START_FEN);
  }

  setFen(fen) {
    this.board.fill(0);
    const parts = fen.trim().split(/\s+/);
    const rows = parts[0].split('/');
    if (rows.length !== 10) throw new Error('FEN 行数错误: ' + rows.length);
    for (let r = 0; r < 10; r++) {
      let c = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '9') { c += (ch.charCodeAt(0) - 48); continue; }
        const pc = C.FEN2PC[ch];
        if (pc === undefined) throw new Error('FEN 非法字符: ' + ch);
        if (c > 8) throw new Error('FEN 列溢出: 第' + r + '行');
        this.board[r * 9 + c] = pc;
        c++;
      }
    }
    this.side = (parts[1] === 'b') ? C.BLACK : C.RED;
    this.halfMove = parts[4] ? parseInt(parts[4], 10) || 0 : 0;
    this.fullMove = parts[5] ? parseInt(parts[5], 10) || 1 : 1;
    this.kingSq[C.RED] = this.board.indexOf(C.RK);
    this.kingSq[C.BLACK] = this.board.indexOf(C.BK);
    this.key = this.computeKey();
    this.history = [];
    this.keyHistory = [this.key];
  }

  computeKey() {
    let k = 0;
    for (let sq = 0; sq < 90; sq++) {
      const pc = this.board[sq];
      if (pc) k ^= ZOB[pc * 90 + sq];
    }
    if (this.side === C.BLACK) k ^= ZOB_SIDE;
    return k | 0;
  }

  getFen() {
    const rows = [];
    for (let r = 0; r < 10; r++) {
      let s = '', empty = 0;
      for (let c = 0; c < 9; c++) {
        const pc = this.board[r * 9 + c];
        if (pc === 0) { empty++; continue; }
        if (empty) { s += empty; empty = 0; }
        s += C.PC2FEN[pc];
      }
      if (empty) s += empty;
      rows.push(s);
    }
    return rows.join('/') + ' ' + (this.side === C.RED ? 'w' : 'b') +
      ' - - ' + this.halfMove + ' ' + this.fullMove;
  }

  /** 生成伪合法走法，返回数量 */
  genMoves(out) {
    const b = this.board;
    const side = this.side;
    let n = 0;
    for (let from = 0; from < 90; from++) {
      const pc = b[from];
      if (!pc) continue;
      if ((pc > 7 ? C.BLACK : C.RED) !== side) continue;
      const t = pc > 7 ? pc - 7 : pc;

      if (t === C.ROOK) {
        for (let d = 0; d < 4; d++) {
          const ray = RAYS[from * 4 + d];
          for (let i = 0; i < ray.length; i++) {
            const to = ray[i];
            const q = b[to];
            if (q === 0) { out[n++] = from | (to << 7); }
            else {
              if ((q > 7 ? C.BLACK : C.RED) !== side) out[n++] = from | (to << 7);
              break;
            }
          }
        }
      } else if (t === C.CANNON) {
        for (let d = 0; d < 4; d++) {
          const ray = RAYS[from * 4 + d];
          let jumped = false;
          for (let i = 0; i < ray.length; i++) {
            const to = ray[i];
            const q = b[to];
            if (!jumped) {
              if (q === 0) out[n++] = from | (to << 7);
              else jumped = true;
            } else {
              if (q !== 0) {
                if ((q > 7 ? C.BLACK : C.RED) !== side) out[n++] = from | (to << 7);
                break;
              }
            }
          }
        }
      } else if (t === C.HORSE) {
        const list = HORSE_MV[from];
        for (let i = 0; i < list.length; i += 2) {
          if (b[list[i + 1]] !== 0) continue;
          const to = list[i];
          const q = b[to];
          if (q === 0 || (q > 7 ? C.BLACK : C.RED) !== side) out[n++] = from | (to << 7);
        }
      } else if (t === C.ELEPHANT) {
        const list = ELEPH_MV_C[side][from];
        for (let i = 0; i < list.length; i += 2) {
          if (b[list[i + 1]] !== 0) continue;
          const to = list[i];
          const q = b[to];
          if (q === 0 || (q > 7 ? C.BLACK : C.RED) !== side) out[n++] = from | (to << 7);
        }
      } else if (t === C.ADVISOR) {
        const list = ADVISOR_MV[from];
        for (let i = 0; i < list.length; i++) {
          const to = list[i];
          const q = b[to];
          if (q === 0 || (q > 7 ? C.BLACK : C.RED) !== side) out[n++] = from | (to << 7);
        }
      } else if (t === C.KING) {
        const list = KING_MV[from];
        for (let i = 0; i < list.length; i++) {
          const to = list[i];
          const q = b[to];
          if (q === 0 || (q > 7 ? C.BLACK : C.RED) !== side) out[n++] = from | (to << 7);
        }
      } else { // PAWN
        const list = PAWN_MV[side][from];
        for (let i = 0; i < list.length; i++) {
          const to = list[i];
          const q = b[to];
          if (q === 0 || (q > 7 ? C.BLACK : C.RED) !== side) out[n++] = from | (to << 7);
        }
      }
    }
    return n;
  }

  /** 走子方是否被将军（含将帅照面） */
  inCheck(side) {
    const b = this.board;
    const ks = this.kingSq[side];
    if (ks < 0) return false;
    const opp = side ^ 1;
    const oppKing = opp === C.RED ? C.RK : C.BK;
    const oppRook = opp === C.RED ? C.RR : C.BR;
    const oppCannon = opp === C.RED ? C.RC : C.BC;
    const oppHorse = opp === C.RED ? C.RN : C.BN;
    const oppPawn = opp === C.RED ? C.RP : C.BP;

    // 车 / 炮 / 将照面
    for (let d = 0; d < 4; d++) {
      const ray = RAYS[ks * 4 + d];
      let first = -1;
      for (let i = 0; i < ray.length; i++) {
        const to = ray[i];
        if (b[to] !== 0) { first = to; break; }
      }
      if (first < 0) continue;
      const p1 = b[first];
      if (p1 === oppRook) return true;
      if (p1 === oppKing && (d === 0 || d === 1)) return true; // 将帅照面
      // 炮：第一个子之后找第二个子
      let second = -1;
      const ray2 = RAYS[ks * 4 + d];
      let seen = false;
      for (let i = 0; i < ray2.length; i++) {
        const to = ray2[i];
        if (to === first) { seen = true; continue; }
        if (!seen) continue;
        if (b[to] !== 0) { second = to; break; }
      }
      if (second >= 0 && b[second] === oppCannon) return true;
    }

    // 马
    const ha = HORSE_ATK[ks];
    for (let i = 0; i < ha.length; i += 2) {
      if (b[ha[i]] === oppHorse && b[ha[i + 1]] === 0) return true;
    }

    // 兵/卒
    const kr = (ks / 9) | 0, kc = ks % 9;
    if (opp === C.RED) {
      // 红兵向上走，能攻击 ks 的红兵在 kr+1
      if (kr + 1 <= 9 && b[(kr + 1) * 9 + kc] === oppPawn) return true;
      // 红兵横走需已过河，兵所在 row = kr，要求 kr <= 4
      if (kr <= 4) {
        if (kc > 0 && b[kr * 9 + kc - 1] === oppPawn) return true;
        if (kc < 8 && b[kr * 9 + kc + 1] === oppPawn) return true;
      }
    } else {
      // 黑卒向下走，能攻击 ks 的卒在 kr-1
      if (kr - 1 >= 0 && b[(kr - 1) * 9 + kc] === oppPawn) return true;
      if (kr >= 5) {
        if (kc > 0 && b[kr * 9 + kc - 1] === oppPawn) return true;
        if (kc < 8 && b[kr * 9 + kc + 1] === oppPawn) return true;
      }
    }
    return false;
  }

  makeMove(m) {
    const from = m & 127, to = m >> 7;
    const b = this.board;
    const moving = b[from];
    const captured = b[to];
    b[to] = moving;
    b[from] = 0;
    let k = this.key;
    k ^= ZOB[moving * 90 + from];
    k ^= ZOB[moving * 90 + to];
    if (captured) k ^= ZOB[captured * 90 + to];
    k ^= ZOB_SIDE;
    this.key = k;
    if (moving === C.RK) this.kingSq[0] = to;
    else if (moving === C.BK) this.kingSq[1] = to;
    this.side ^= 1;
    this.keyHistory.push(k);
    return captured;
  }

  unmakeMove(m, captured) {
    const from = m & 127, to = m >> 7;
    const b = this.board;
    const moving = b[to];
    b[from] = moving;
    b[to] = captured;
    let k = this.key;
    k ^= ZOB_SIDE;
    k ^= ZOB[moving * 90 + from];
    k ^= ZOB[moving * 90 + to];
    if (captured) k ^= ZOB[captured * 90 + to];
    this.key = k;
    if (moving === C.RK) this.kingSq[0] = from;
    else if (moving === C.BK) this.kingSq[1] = from;
    this.side ^= 1;
    this.keyHistory.pop();
  }

  /** 空着（null move），用于搜索剪枝 */
  makeNull() {
    this.key ^= ZOB_SIDE;
    this.side ^= 1;
    this.keyHistory.push(this.key);
  }

  unmakeNull() {
    this.keyHistory.pop();
    this.key ^= ZOB_SIDE;
    this.side ^= 1;
  }

  /** 走子方是否还有非兵/非将的子（空着裁剪的前提） */
  hasNonPawnMaterial(side) {
    const b = this.board;
    const lo = side === C.RED ? 1 : 8;
    const hi = side === C.RED ? 7 : 14;
    for (let sq = 0; sq < 90; sq++) {
      const pc = b[sq];
      if (pc < lo || pc > hi) continue;
      const t = pc > 7 ? pc - 7 : pc;
      if (t !== C.PAWN && t !== C.KING) return true;
    }
    return false;
  }

  /** 走这一步之后自己是否安全 */
  isLegal(m) {
    const from = m & 127, to = m >> 7;
    const b = this.board;
    const moving = b[from];
    const captured = b[to];
    const me = this.side;
    b[to] = moving; b[from] = 0;
    let oldKing = -1;
    if (moving === C.RK) { oldKing = this.kingSq[0]; this.kingSq[0] = to; }
    else if (moving === C.BK) { oldKing = this.kingSq[1]; this.kingSq[1] = to; }
    const ok = !this.inCheck(me);
    b[from] = moving; b[to] = captured;
    if (moving === C.RK) this.kingSq[0] = oldKing;
    else if (moving === C.BK) this.kingSq[1] = oldKing;
    return ok;
  }

  /** 生成合法走法 */
  genLegalMoves() {
    const buf = new Int32Array(256);
    const n = this.genMoves(buf);
    const res = [];
    for (let i = 0; i < n; i++) {
      if (this.isLegal(buf[i])) res.push(buf[i]);
    }
    return res;
  }

  isRepetition() {
    const n = this.keyHistory.length;
    const key = this.key;
    // 往前找最近的相同 key（跳过 1 步）
    for (let i = n - 3; i >= 0 && i >= n - 40; i -= 2) {
      if (this.keyHistory[i] === key) return true;
    }
    return false;
  }

  perft(depth) {
    if (depth === 0) return 1;
    const buf = new Int32Array(256);
    const n = this.genMoves(buf);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const m = buf[i];
      const cap = this.makeMove(m);
      if (!this.inCheck(this.side ^ 1)) total += this.perft(depth - 1);
      this.unmakeMove(m, cap);
    }
    return total;
  }
}

module.exports = {
  Position, RAYS, HORSE_MV, ELEPH_MV_C, ADVISOR_MV, KING_MV, PAWN_MV, HORSE_ATK,
  ZOB, ZOB_SIDE
};

};

/* ---- cst/notation ---- */
__modules["cst/notation"] = function (module, exports, require) {
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

};

/* ---- cst/eval ---- */
__modules["cst/eval"] = function (module, exports, require) {
'use strict';
/*
 * 局面评估 —— 从红方视角返回分数（正数 = 红方好）
 *
 * 组成：
 *   1. 子力价值
 *   2. 分兵种位置表（10x9，红方视角；黑方镜像）
 *   3. 结构项：过河兵、中路控制、车占要道、炮镇中路、王前防守
 *   4. 王的安全：九宫周围受敌子力威胁
 */
const C = require('./constants');

// ---------- 子力价值 ----------
const VALUE = [0, 10000, 200, 200, 420, 900, 460, 100];
//          空  帅    士   象   马   车   炮   兵

// ---------- 位置表（红方视角，row0 = 黑方底线） ----------
// 数值是「加成」，与 VALUE 相加

// 马：中心与过河活跃，边线与底线贬值
const HORSE_PST = [
  6, 8, 6, 4, 4, 4, 6, 8, 6,
  8, 12, 10, 8, 8, 8, 10, 12, 8,
  10, 14, 16, 14, 12, 14, 16, 14, 10,
  10, 16, 20, 18, 16, 18, 20, 16, 10,
  8, 14, 18, 20, 18, 20, 18, 14, 8,
  6, 10, 12, 14, 12, 14, 12, 10, 6,
  4, 8, 10, 10, 8, 10, 10, 8, 4,
  0, 4, 6, 8, 6, 8, 6, 4, 0,
  -4, 0, 2, 4, 2, 4, 2, 0, -4,
  -8, -4, -2, 0, -2, 0, -2, -4, -8
];

// 车：中路过河与巡河最强
const ROOK_PST = [
  8, 10, 12, 14, 14, 14, 12, 10, 8,
  10, 12, 14, 16, 16, 16, 14, 12, 10,
  10, 12, 14, 16, 16, 16, 14, 12, 10,
  10, 12, 14, 16, 16, 16, 14, 12, 10,
  8, 10, 12, 14, 14, 14, 12, 10, 8,
  6, 8, 10, 12, 12, 12, 10, 8, 6,
  4, 6, 8, 10, 10, 10, 8, 6, 4,
  2, 4, 6, 8, 8, 8, 6, 4, 2,
  0, 2, 4, 6, 6, 6, 4, 2, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0
];

// 炮：中路与二路（巡河）价值高，底线也能牵制
const CANNON_PST = [
  6, 4, 0, -4, -6, -4, 0, 4, 6,
  6, 6, 2, 0, -2, 0, 2, 6, 6,
  4, 4, 2, 4, 6, 4, 2, 4, 4,
  0, 2, 4, 8, 10, 8, 4, 2, 0,
  0, 0, 2, 6, 8, 6, 2, 0, 0,
  2, 2, 4, 6, 8, 6, 4, 2, 2,
  2, 2, 4, 6, 8, 6, 4, 2, 2,
  4, 4, 6, 8, 10, 8, 6, 4, 4,
  2, 2, 2, 4, 6, 4, 2, 2, 2,
  0, 0, 0, 0, 0, 0, 0, 0, 0
];

// 兵：过河兵极贵，中路兵最高；到底线（不能再进）回落
const PAWN_PST = [
  30, 35, 40, 45, 50, 45, 40, 35, 30,
  40, 50, 60, 70, 80, 70, 60, 50, 40,
  50, 65, 80, 95, 105, 95, 80, 65, 50,
  40, 55, 70, 85, 95, 85, 70, 55, 40,
  20, 35, 50, 65, 75, 65, 50, 35, 20,
  0, 10, 15, 20, 25, 20, 15, 10, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0
];

// 士：贴九宫中心稍好
const ADVISOR_PST = new Array(90).fill(0);
ADVISOR_PST[9 * 9 + 4] = 6;
ADVISOR_PST[7 * 9 + 3] = 2;
ADVISOR_PST[7 * 9 + 5] = 2;

// 象：中象比边象稳
const ELEPHANT_PST = new Array(90).fill(0);
ELEPHANT_PST[9 * 9 + 2] = 4;
ELEPHANT_PST[9 * 9 + 6] = 4;
ELEPHANT_PST[7 * 9 + 4] = 6;
ELEPHANT_PST[7 * 9 + 0] = 0;
ELEPHANT_PST[7 * 9 + 8] = 0;
ELEPHANT_PST[5 * 9 + 2] = 4;
ELEPHANT_PST[5 * 9 + 6] = 4;

// 帅：待在底线中线最安全
const KING_PST = new Array(90).fill(0);
KING_PST[9 * 9 + 4] = 4;
KING_PST[9 * 9 + 3] = 2;
KING_PST[9 * 9 + 5] = 2;
KING_PST[8 * 9 + 4] = -6;
KING_PST[7 * 9 + 4] = -12;

const PST = [null, KING_PST, ADVISOR_PST, ELEPHANT_PST, HORSE_PST, ROOK_PST, CANNON_PST, PAWN_PST];

// 黑方镜像索引
const MIRROR = new Int8Array(90);
for (let r = 0; r < 10; r++) {
  for (let c = 0; c < 9; c++) MIRROR[r * 9 + c] = (9 - r) * 9 + c;
}

// 九宫周围的关键点（红帅区 row7..9 col3..5），用于王的安全评估
const RED_PALACE_NEAR = [];
const BLK_PALACE_NEAR = [];
for (let r = 0; r < 10; r++) {
  for (let c = 0; c < 9; c++) {
    const sq = r * 9 + c;
    // 红方九宫周边（含河界线一侧）
    if (r >= 6 && r <= 9 && c >= 2 && c <= 6) RED_PALACE_NEAR.push(sq);
    if (r >= 0 && r <= 3 && c >= 2 && c <= 6) BLK_PALACE_NEAR.push(sq);
  }
}

/**
 * 评估局面
 * @param {Position} pos
 * @returns {number} 红方视角分数
 */
function evaluate(pos) {
  const b = pos.board;
  let score = 0;

  // 子力 + 位置表
  for (let sq = 0; sq < 90; sq++) {
    const pc = b[sq];
    if (!pc) continue;
    const t = pc > 7 ? pc - 7 : pc;
    if (t === C.KING) continue; // 帅不计入子力差
    const v = VALUE[t];
    if (pc < 8) {
      // 红方
      score += v + PST[t][sq];
    } else {
      score -= v + PST[t][MIRROR[sq]];
    }
  }

  // ---- 结构项 ----
  let redRook = 0, blkRook = 0;
  let redCannon = 0, blkCannon = 0;
  let redHorse = 0, blkHorse = 0;
  let redPawnAdv = 0, blkPawnAdv = 0;
  const totalPieces0 = countPieces(b);
  const isOpening = totalPieces0 >= 26;   // 开局阶段

  for (let sq = 0; sq < 90; sq++) {
    const pc = b[sq];
    if (!pc) continue;
    const r = (sq / 9) | 0, c = sq % 9;
    const t = pc > 7 ? pc - 7 : pc;

    if (pc === C.RR) {
      redRook++;
      // 车在对方半场（row<=4）额外活跃 + 占中列
      if (r <= 4) score += 8;
      if (c === 4) score += 6;
      // 车在底线且有己方兵挡住 → 略贬
      if (r === 9 && b[8 * 9 + c] !== 0) score -= 4;
      // 开局：车还窝在底角 → 鼓励开出
      if (isOpening && r === 9 && (c === 0 || c === 8)) score -= 10;
    } else if (pc === C.BR) {
      blkRook++;
      if (r >= 5) score -= 8;
      if (c === 4) score -= 6;
      if (r === 0 && b[1 * 9 + c] !== 0) score += 4;
      if (isOpening && r === 0 && (c === 0 || c === 8)) score += 10;
    } else if (pc === C.RC) {
      redCannon++;
      if (c === 4) score += 6;
      // 过河炮：开局阶段不宜过早深入，中残局才算威胁
      if (r >= 1 && r <= 3 && !isOpening) score += 5;
      // 开局：炮还在原位不动 → 轻微不利（前 6 步内要出动）
      if (isOpening && r === 7 && (c === 1 || c === 7)) score -= 4;
    } else if (pc === C.BC) {
      blkCannon++;
      if (c === 4) score -= 6;
      if (r >= 6 && r <= 8 && !isOpening) score -= 5;
      if (isOpening && r === 2 && (c === 1 || c === 7)) score += 4;
    } else if (pc === C.RN) {
      redHorse++;
      // 开局：马还在原始位置 → 扣分，鼓励尽早出动
      if (isOpening && r === 9 && (c === 1 || c === 7)) score -= 12;
    } else if (pc === C.BN) {
      blkHorse++;
      if (isOpening && r === 0 && (c === 1 || c === 7)) score += 12;
    } else if (pc === C.RP) {
      // 红兵：过河且靠中
      if (r <= 4) {
        redPawnAdv += 1;
        if (c >= 3 && c <= 5) score += 12;
      }
    } else if (pc === C.BP) {
      if (r >= 5) {
        blkPawnAdv += 1;
        if (c >= 3 && c <= 5) score -= 12;
      }
    }
  }

  // 过河兵数量奖励（兵越多越能撕开防线）
  score += redPawnAdv * redPawnAdv * 3;
  score -= blkPawnAdv * blkPawnAdv * 3;

  // 双车/单车残局：车在少子局中相对更强
  const totalPieces = countPieces(b);
  if (totalPieces <= 16) {
    score += redRook * 25 - blkRook * 25;
  }

  // ---- 王的安全 ----
  score += kingSafety(pos, C.RED, RED_PALACE_NEAR) - kingSafety(pos, C.BLACK, BLK_PALACE_NEAR);

  return score | 0;
}

function countPieces(b) {
  let n = 0;
  for (let i = 0; i < 90; i++) if (b[i]) n++;
  return n;
}

const ATTACK_WEIGHT = [0, 0, 0, 0, 25, 45, 30, 12]; // 按兵种

function kingSafety(pos, color, zone) {
  const b = pos.board;
  const opp = color ^ 1;
  let danger = 0;
  for (let i = 0; i < zone.length; i++) {
    const sq = zone[i];
    const pc = b[sq];
    if (!pc) continue;
    const pcColor = pc > 7 ? C.BLACK : C.RED;
    if (pcColor !== opp) continue;
    const t = pc > 7 ? pc - 7 : pc;
    // 敌方强子进入我方九宫周边 → 危险
    danger += ATTACK_WEIGHT[t];
  }
  return -danger;
}

module.exports = { evaluate, VALUE, PST, MIRROR };

};

/* ---- cst/search ---- */
__modules["cst/search"] = function (module, exports, require) {
'use strict';
/*
 * 搜索引擎 —— 迭代加深 + PVS + 置换表 + 空着裁剪 + LMR + 静态搜索
 *
 * 目标：Node / JavaScriptCore 上 1~3 秒能到 10~14 层，稳吃业余水平。
 *
 * negamax 约定：所有分数都是「走子方视角」。
 * 评估函数 evaluate(pos) 返回红方视角，这里取符号转换。
 */
const C = require('./constants');
const { Position } = require('./position');
const { evaluate, VALUE } = require('./eval');
const NOTE = require('./notation');

const INF = 32000;
const MATE = 30000;
const MATE_BOUND = MATE - 300;
const MAX_PLY = 96;

const TT_BITS = 21;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;

const FLAG_EXACT = 1, FLAG_LOWER = 2, FLAG_UPPER = 3;

// 置换表（模块级，跨搜索复用）
const ttKey = new Int32Array(TT_SIZE);
const ttMove = new Int32Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Int8Array(TT_SIZE);
let ttGeneration = 0;

function evalSide(pos) {
  const s = evaluate(pos);
  return pos.side === C.RED ? s : -s;
}

function adjustMate(score, ply) {
  if (score > MATE_BOUND) return score + ply;
  if (score < -MATE_BOUND) return score - ply;
  return score;
}
function unadjustMate(score, ply) {
  if (score > MATE_BOUND) return score - ply;
  if (score < -MATE_BOUND) return score + ply;
  return score;
}

class Searcher {
  constructor() {
    this.moveStack = [];
    this.scoreStack = [];
    for (let i = 0; i < MAX_PLY; i++) {
      this.moveStack.push(new Int32Array(256));
      this.scoreStack.push(new Int32Array(256));
    }
    this.killer = new Int32Array(MAX_PLY * 2);
    this.history = new Int32Array(90 * 90);
    this.pvLength = new Int32Array(MAX_PLY + 2);
    this.pvTable = [];
    for (let i = 0; i < MAX_PLY + 2; i++) this.pvTable.push(new Int32Array(MAX_PLY + 2));

    this.nodes = 0;
    this.qnodes = 0;
    this.stopFlag = false;
    this.startTime = 0;
    this.timeLimit = 1000;
    this.pos = null;
  }

  clearTT() { ttFlag.fill(0); }

  _tick() {
    if ((this.nodes & 2047) === 0) {
      if ((Date.now() - this.startTime) >= this.timeLimit) this.stopFlag = true;
    }
  }

  /** 走法排序打分 */
  _moveScore(pos, m, ply, ttMv) {
    if (m === ttMv) return 1 << 24;
    const from = C.mvFrom(m), to = C.mvTo(m);
    const cap = pos.board[to];
    if (cap) {
      const vTo = VALUE[cap > 7 ? cap - 7 : cap];
      const mover = pos.board[from];
      const vFrom = VALUE[mover > 7 ? mover - 7 : mover];
      return (1 << 20) + vTo * 16 - vFrom;
    }
    if (m === this.killer[ply * 2]) return (1 << 19) + 100;
    if (m === this.killer[ply * 2 + 1]) return (1 << 18) + 100;
    return this.history[from * 90 + to];
  }

  /**
   * 对外主入口
   * @returns {{bestmove:string, score:number, winrate:number, depth:number, pv:string[], nodes:number, ms:number}}
   */
  search(pos, timeMs, maxDepth) {
    this.pos = pos;
    this.startTime = Date.now();
    this.timeLimit = timeMs || 1000;
    this.stopFlag = false;
    this.nodes = 0;
    this.qnodes = 0;
    this.killer.fill(0);
    // history 缓慢衰减而不是清零
    for (let i = 0; i < this.history.length; i++) this.history[i] >>= 2;
    ttGeneration++;

    const md = maxDepth || MAX_PLY - 8;
    let bestMove = 0, bestScore = 0, bestDepth = 0, bestPV = [];

    // 一开始先拿一个合法走法兜底
    const rootMoves = this._rootMoves(pos);
    if (rootMoves.length === 0) {
      return {
        bestmove: '', score: -MATE, winrate: 0, depth: 0, pv: [], nodes: 0,
        ms: Date.now() - this.startTime, mate: pos.inCheck(pos.side) ? -1 : -1
      };
    }
    bestMove = rootMoves[0];

    for (let d = 1; d <= md; d++) {
      const res = this._rootSearch(pos, d, bestMove);
      if (this.stopFlag && d > 1) break;
      if (res.move) {
        bestMove = res.move;
        bestScore = res.score;
        bestDepth = d;
        bestPV = res.pv.slice();
      }
      // 已经算出必胜/必败杀 → 不用再深
      if (Math.abs(bestScore) > MATE_BOUND) break;
      // 时间过半就不再开新层
      const elapsed = Date.now() - this.startTime;
      if (elapsed > this.timeLimit * 0.55) break;
    }

    const ms = Date.now() - this.startTime;
    const pvUcci = bestPV.map(m => C.mvToUcci(m));
    let score = bestScore;
    // 报告时换成「红方视角」，方便 UI 直接显示
    if (pos.side === C.BLACK) score = -score;

    return {
      bestmove: C.mvToUcci(bestMove),
      score,                    // 红方视角分值（兵=100）
      winrate: scoreToWinrate(score, pos.side),
      depth: bestDepth,
      pv: pvUcci,
      nodes: this.nodes + this.qnodes,
      ms,
      mate: Math.abs(bestScore) > MATE_BOUND
        ? (bestScore > 0 ? Math.ceil((MATE - Math.abs(bestScore)) / 2) : -Math.ceil((MATE - Math.abs(bestScore)) / 2))
        : 0
    };
  }

  _rootMoves(pos) {
    const buf = new Int32Array(256);
    const n = pos.genMoves(buf);
    const out = [];
    for (let i = 0; i < n; i++) if (pos.isLegal(buf[i])) out.push(buf[i]);
    return out;
  }

  _rootSearch(pos, depth, pvMove) {
    const buf = this.moveStack[0];
    const scores = this.scoreStack[0];
    const n = pos.genMoves(buf);
    let count = 0;
    for (let i = 0; i < n; i++) {
      const m = buf[i];
      if (!pos.isLegal(m)) continue;
      buf[count] = m;
      scores[count] = (m === pvMove) ? (1 << 24) : this._moveScore(pos, m, 0, pvMove);
      count++;
    }
    if (count === 0) {
      return { move: 0, score: pos.inCheck(pos.side) ? -MATE : -MATE, pv: [] };
    }

    let alpha = -INF;
    const beta = INF;
    let best = 0, bestScore = -INF;
    const pv = [];
    this.pvLength[0] = 0;

    for (let i = 0; i < count; i++) {
      // 选择排序
      let bi = i;
      for (let j = i + 1; j < count; j++) if (scores[j] > scores[bi]) bi = j;
      if (bi !== i) {
        const tm = buf[bi]; buf[bi] = buf[i]; buf[i] = tm;
        const ts = scores[bi]; scores[bi] = scores[i]; scores[i] = ts;
      }

      const m = buf[i];
      const cap = pos.makeMove(m);
      let score;
      if (i === 0) {
        score = -this._alphaBeta(depth - 1, -beta, -alpha, 1, true);
      } else {
        score = -this._alphaBeta(depth - 1, -alpha - 1, -alpha, 1, true);
        if (score > alpha && !this.stopFlag) {
          score = -this._alphaBeta(depth - 1, -beta, -alpha, 1, true);
        }
      }
      pos.unmakeMove(m, cap);
      if (this.stopFlag) break;

      if (score > bestScore) {
        bestScore = score;
        best = m;
        pv.length = 0;
        pv.push(m);
        for (let k = 0; k < this.pvLength[1]; k++) pv.push(this.pvTable[1][k]);
      }
      if (score > alpha) alpha = score;
    }
    return { move: best, score: bestScore, pv };
  }

  _alphaBeta(depth, alpha, beta, ply, canNull) {
    this.nodes++;
    this._tick();
    if (this.stopFlag) return 0;
    if (ply >= MAX_PLY - 4) return evalSide(this.pos);

    const pos = this.pos;

    // 重复局面 → 和棋
    if (ply > 0 && pos.isRepetition()) return 0;

    const inCheck = pos.inCheck(pos.side);

    // 将军延伸
    if (inCheck && ply > 0) depth++;

    if (depth <= 0) return this._quiesce(alpha, beta, ply);

    // ---- 置换表 ----
    const idx = pos.key & TT_MASK;
    let ttMv = 0;
    if (ttFlag[idx] !== 0 && ttKey[idx] === pos.key) {
      ttMv = ttMove[idx];
      if (ttDepth[idx] >= depth && ply > 0) {
        const sc = unadjustMate(ttScore[idx], ply);
        const f = ttFlag[idx];
        if (f === FLAG_EXACT) return sc;
        if (f === FLAG_LOWER && sc >= beta) return sc;
        if (f === FLAG_UPPER && sc <= alpha) return sc;
      }
    }

    // ---- 空着裁剪 ----
    if (canNull && !inCheck && ply > 0 && depth >= 3 && pos.hasNonPawnMaterial(pos.side)) {
      const R = depth >= 6 ? 3 : 2;
      pos.makeNull();
      const sc = -this._alphaBeta(depth - 1 - R, -beta, -beta + 1, ply + 1, false);
      pos.unmakeNull();
      if (this.stopFlag) return 0;
      if (sc >= beta && Math.abs(sc) < MATE_BOUND) return sc;
    }

    // ---- 生成并排序 ----
    const buf = this.moveStack[ply];
    const scores = this.scoreStack[ply];
    const n = pos.genMoves(buf);
    let count = 0;
    for (let i = 0; i < n; i++) {
      const m = buf[i];
      if (!pos.isLegal(m)) continue;
      buf[count] = m;
      scores[count] = this._moveScore(pos, m, ply, ttMv);
      count++;
    }

    if (count === 0) {
      // 将死或困毙，都算负
      return -MATE + ply;
    }

    const origAlpha = alpha;
    let bestScore = -INF;
    let bestMove = 0;
    let moveCount = 0;

    for (let i = 0; i < count; i++) {
      let bi = i;
      for (let j = i + 1; j < count; j++) if (scores[j] > scores[bi]) bi = j;
      if (bi !== i) {
        const tm = buf[bi]; buf[bi] = buf[i]; buf[i] = tm;
        const ts = scores[bi]; scores[bi] = scores[i]; scores[i] = ts;
      }

      const m = buf[i];
      const to = C.mvTo(m);
      const isQuiet = pos.board[to] === 0;
      const cap = pos.makeMove(m);
      moveCount++;

      let score;
      if (moveCount === 1) {
        score = -this._alphaBeta(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        // LMR：安静走法在靠后位置降深度搜
        let red = 0;
        if (depth >= 3 && moveCount > 4 && isQuiet && !inCheck) {
          red = 1 + (moveCount > 12 ? 1 : 0) + (depth >= 8 ? 1 : 0);
          if (red >= depth) red = depth - 1;
        }
        score = -this._alphaBeta(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && red > 0 && !this.stopFlag) {
          score = -this._alphaBeta(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        }
        if (score > alpha && score < beta && !this.stopFlag) {
          score = -this._alphaBeta(depth - 1, -beta, -alpha, ply + 1, true);
        }
      }

      pos.unmakeMove(m, cap);
      if (this.stopFlag) return 0;

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
        if (score > alpha) {
          alpha = score;
          // 更新 PV
          this.pvTable[ply][0] = m;
          const childLen = this.pvLength[ply + 1];
          for (let k = 0; k < childLen; k++) this.pvTable[ply][1 + k] = this.pvTable[ply + 1][k];
          this.pvLength[ply] = 1 + childLen;

          if (score >= beta) {
            if (isQuiet) {
              this.killer[ply * 2 + 1] = this.killer[ply * 2];
              this.killer[ply * 2] = m;
              const from = C.mvFrom(m);
              this.history[from * 90 + to] += depth * depth;
            }
            break; // beta 剪枝
          }
        }
      }
    }

    // ---- 存置换表 ----
    let flag;
    if (bestScore >= beta) flag = FLAG_LOWER;
    else if (bestScore > origAlpha) flag = FLAG_EXACT;
    else flag = FLAG_UPPER;

    if (ttFlag[idx] === 0 || ttDepth[idx] <= depth || ttKey[idx] !== pos.key) {
      ttKey[idx] = pos.key;
      ttMove[idx] = bestMove;
      ttScore[idx] = adjustMate(bestScore, ply);
      ttDepth[idx] = depth;
      ttFlag[idx] = flag;
    }

    return bestScore;
  }

  _quiesce(alpha, beta, ply) {
    this.qnodes++;
    this._tick();
    if (this.stopFlag) return 0;
    if (ply >= MAX_PLY - 4) return evalSide(this.pos);

    const pos = this.pos;
    const inCheck = pos.inCheck(pos.side);

    let bestScore;
    if (inCheck) {
      bestScore = -MATE + ply;
    } else {
      bestScore = evalSide(pos);
      if (bestScore >= beta) return bestScore;
      if (bestScore > alpha) alpha = bestScore;
    }

    const buf = this.moveStack[ply];
    const scores = this.scoreStack[ply];
    const n = pos.genMoves(buf);
    let count = 0;
    for (let i = 0; i < n; i++) {
      const m = buf[i];
      const to = C.mvTo(m);
      const capPc = pos.board[to];
      if (!inCheck && capPc === 0) continue;  // 非将军时只搜吃子
      if (!pos.isLegal(m)) continue;
      buf[count] = m;
      if (capPc) {
        const vTo = VALUE[capPc > 7 ? capPc - 7 : capPc];
        const mv = pos.board[C.mvFrom(m)];
        const vFrom = VALUE[mv > 7 ? mv - 7 : mv];
        scores[count] = vTo * 16 - vFrom;
      } else {
        scores[count] = 0;
      }
      count++;
    }

    if (count === 0 && inCheck) return -MATE + ply;

    for (let i = 0; i < count; i++) {
      let bi = i;
      for (let j = i + 1; j < count; j++) if (scores[j] > scores[bi]) bi = j;
      if (bi !== i) {
        const tm = buf[bi]; buf[bi] = buf[i]; buf[i] = tm;
        const ts = scores[bi]; scores[bi] = scores[i]; scores[i] = ts;
      }
      const m = buf[i];
      const cap = pos.makeMove(m);
      const score = -this._quiesce(-beta, -alpha, ply + 1);
      pos.unmakeMove(m, cap);
      if (this.stopFlag) return 0;

      if (score > bestScore) {
        bestScore = score;
        if (score > alpha) {
          alpha = score;
          if (score >= beta) return score;
        }
      }
    }
    return bestScore;
  }
}

/** 分值 → 红方胜率（0..1） */
function scoreToWinrate(cpRed, sideToMove) {
  const v = Math.max(-1500, Math.min(1500, cpRed));
  return 1 / (1 + Math.pow(10, -v / 400));
}

let _shared = null;
/** 单例分析入口，方便 iOS JSC 里反复调用 */
/**
 * 多候选着法 —— 给界面上的「思考列表」用
 *
 * 对每个根着法各做一次快速搜索，按分数排序返回。
 * 分数统一是「红方视角」（和 analyze 一致），胜率由 scoreToWinrate 给出。
 *
 * @param {string} fen
 * @param {{timeMs:number, count:number, depth:number}} opts
 * @returns {{bestmove:string, score:number, depth:number, nodes:number, ms:number,
 *            rows:{move:string, chinese:string, score:number, winrate:number}[]}}
 */
function analyzeTop(fen, opts) {
  if (!_shared) _shared = new Searcher();
  const o = opts || {};
  const timeMs = Math.max(120, o.timeMs || 1200);
  const want = Math.min(12, Math.max(3, o.count || 8));
  const quickDepth = Math.max(4, Math.min(10, o.depth || 7));

  const pos = new Position(fen);
  // 1) 先跑一次正常搜索，最佳着法和它的分数最准
  const best = _shared.search(new Position(fen), Math.max(150, Math.floor(timeMs * 0.35)));

  const rows = [];
  const seen = {};
  const roots = _shared._rootMoves(pos);

  function push(m, score, depth) {
    const ucci = C.mvToUcci(m);
    if (seen[ucci]) return;
    seen[ucci] = 1;
    rows.push({
      move: ucci,
      chinese: NOTE.mvToChinese(pos.board, m, pos.side),
      score: score,
      winrate: scoreToWinrate(score, pos.side),
      depth: depth || 0
    });
  }

  // 2) 每个根着法各评估一次（时间平均分配）
  const budget = Math.max(30, Math.floor((timeMs * 0.65) / Math.max(1, Math.min(roots.length, want * 2))));
  const probe = new Searcher();
  let nodes = best.nodes || 0;

  for (let i = 0; i < roots.length && rows.length < want * 2; i++) {
    const m = roots[i];
    if (C.mvToUcci(m) === best.bestmove) { push(m, best.score, best.depth); continue; }
    const p2 = new Position(fen);
    if (!p2.makeMove || p2.makeMove(m) === false) continue;
    const r = probe.search(p2, budget, quickDepth);
    nodes += r.nodes || 0;
    // ★ 必须取反
    //
    //   probe.search 搜的是「我走完这一步之后」的局面，此时轮到对手走，
    //   所以 r.score 是对手的视角：+5 表示对手有 +5，也就是我这步是臭棋。
    //   原来直接把 r.score 当「这步有多好」塞进表格，于是：
    //     ① 好棋显示成负数、坏棋显示成正数，候选表整个反向；
    //     ② 排序按这些混了符号的分数，「最佳」标在了一手烂棋上；
    //     ③ 胜率也跟着错（用户截图里 0.9953 那行其实是让自己亏 9 分的着法）。
    //   最佳着法那一行用的是 best.score（我方视角），所以这里也要统一到我方视角。
    push(m, -r.score, r.depth);
  }

  // 最佳着法万一没进列表，补在最前面
  if (best.bestmove && !seen[best.bestmove]) {
    rows.unshift({
      move: best.bestmove,
      chinese: NOTE.mvToChinese(pos.board, C.ucciToMv(best.bestmove), pos.side),
      score: best.score, winrate: best.winrate, depth: best.depth
    });
  }

  rows.sort((a, b) => b.score - a.score);
  return {
    bestmove: best.bestmove,
    score: best.score,
    depth: best.depth,
    nodes: nodes,
    ms: best.ms,
    rows: rows.slice(0, want)
  };
}
function analyze(fen, opts) {
  if (!_shared) _shared = new Searcher();
  const pos = new Position(fen);
  const res = _shared.search(pos, (opts && opts.timeMs) || 1200, (opts && opts.maxDepth) || 0);
  return res;
}

module.exports = {
  Searcher, analyze, analyzeTop, scoreToWinrate,
  MATE, MATE_BOUND, INF
};

};

/* ---- vision/templates ---- */
__modules["vision/templates"] = function (module, exports, require) {
'use strict';
/*
 * templates.js —— 内置棋子模板（自动生成，请勿手改）
 *
 * 来源：real_442x959 / real_jjchess / s736（都是标准开局盘面，不同尺度）
 * 生成：node tools/gen-templates.mjs
 *
 * 每个「棋子实例」单独存三张 24x24 的二值掩码：
 *   w = 暖色盘面   r = 红色   i = 墨迹笔画（字形本身）
 * 共 86 个实例。
 *
 * 为什么多尺度 + 保留实例：同一个字在不同分辨率下栅格化不同，
 * 只用一个尺度的模板换个尺度就认不出；平均成一张又谁都不像。
 * 多尺度实例逐一比对，让最接近的胜出。
 */
var PW = 24;
var ITEMS = [
  { key: '1', w: [254,255,255,223,255,255,255,255,254,223,255,254,255,126,238,255,255,255,223,255,127,223,255,115,255,255,239,255,255,239,255,255,237,255,255,255,255,255,239,255,255,231,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,253,255,255,255,255,255,255,255,255,255,255,255,255,255,253], r: [224,225,3,92,128,15,222,192,30,207,193,178,231,6,98,251,131,223,217,147,31,216,255,51,249,247,175,249,247,173,251,247,173,251,255,159,255,255,143,255,191,7,253,255,159,253,255,159,255,199,237,255,195,245,253,193,249,97,128,245,119,208,255,63,248,255,31,248,255,99,255,253], i: [0,0,0,0,0,0,128,128,0,128,129,0,192,2,0,96,128,7,16,131,31,216,247,19,248,247,13,152,247,13,248,183,13,248,177,29,248,183,15,248,191,7,248,191,15,152,147,15,248,131,13,248,129,129,24,128,129,0,128,65,4,128,33,4,128,49,0,128,8,0,0,0] },
  { key: '1', w: [252,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,223,255,255,255,255,247,255,255,253,255,255,255,255,255,255,255,255,255,255,255,255,255,255,247,239,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [192,227,3,248,64,11,248,192,31,143,195,243,199,131,227,246,131,75,83,131,223,249,255,151,249,255,157,240,251,157,240,255,157,244,251,157,254,255,159,250,255,71,232,251,159,249,211,207,249,211,207,251,211,245,87,192,241,39,192,241,127,192,255,79,176,255,87,178,255,243,252,255], i: [0,0,0,96,0,0,128,128,1,132,129,1,196,131,1,226,131,1,81,131,15,209,247,23,208,255,13,16,243,25,240,183,29,248,187,29,248,187,31,248,255,7,232,155,15,248,211,15,248,195,133,249,193,129,18,192,65,0,192,1,4,192,32,0,128,16,0,128,12,64,0,7] },
  { key: '1', w: [252,127,255,239,255,255,255,255,254,223,127,250,255,122,254,191,255,254,222,255,249,255,255,247,255,255,255,255,255,255,255,255,247,255,251,255,255,255,255,255,255,247,239,255,255,239,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [192,99,11,104,192,15,250,193,30,141,67,178,230,2,98,178,195,118,216,215,217,241,255,183,249,255,159,248,255,159,248,255,151,248,251,31,252,255,31,252,255,23,232,255,143,237,251,159,253,211,141,249,195,229,27,192,225,2,192,241,39,192,241,15,192,253,51,242,255,227,252,255], i: [0,0,0,0,128,0,128,192,0,128,1,0,192,2,0,32,129,6,16,131,25,208,247,23,208,247,13,144,243,13,248,179,21,248,179,29,248,251,15,248,255,7,232,219,15,200,211,13,248,195,5,248,195,129,0,192,65,2,192,1,0,192,32,0,192,16,0,128,12,0,0,0] },
  { key: '2', w: [255,255,253,223,127,251,255,255,255,251,191,255,189,190,239,255,255,255,255,255,255,255,255,127,255,255,255,255,255,255,255,254,239,255,255,255,247,255,255,255,255,255,255,255,255,255,255,255,255,255,127,255,255,255,255,255,255,223,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [224,195,1,92,0,2,88,0,24,201,160,240,132,176,97,195,227,193,227,227,129,225,227,1,241,225,143,251,224,159,127,252,207,126,255,15,246,255,143,255,254,193,244,240,195,224,240,231,240,254,111,253,255,255,253,255,255,203,14,224,54,0,254,63,64,254,219,255,255,103,255,127], i: [0,0,0,0,0,0,0,0,0,0,0,0,128,160,1,192,227,1,192,227,129,224,225,1,224,224,7,240,224,15,120,240,15,60,255,15,54,255,7,102,252,1,96,240,0,96,240,3,112,248,15,112,254,143,113,254,135,99,4,96,36,0,32,4,0,16,24,0,12,96,0,2] },
  { key: '2', w: [254,239,255,223,255,254,255,255,255,255,255,255,251,127,255,255,255,124,255,255,255,255,255,255,255,255,255,255,255,255,255,254,247,255,255,255,255,255,255,239,254,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,223,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [184,135,1,220,0,108,62,0,240,198,193,241,8,97,99,199,199,0,195,199,131,195,195,3,225,195,31,240,193,31,249,248,23,255,255,31,255,255,143,239,252,1,229,224,131,224,224,207,225,254,255,231,254,255,249,254,255,216,60,240,237,0,252,111,0,254,55,255,255,255,255,255], i: [0,0,0,0,0,0,0,0,0,0,192,0,0,65,1,128,195,0,192,199,1,192,195,1,224,193,15,224,192,31,248,240,23,124,255,31,124,255,15,204,248,1,192,224,1,224,224,7,225,240,15,225,254,143,224,252,143,194,0,192,68,0,96,0,0,32,16,0,24,224,0,6] },
  { key: '2', w: [254,255,127,255,255,255,255,255,247,127,255,255,255,191,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,247,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,253,255,255,255,255,255,255,255,255,255,255,255,247,255,255,255,255,255,255], r: [240,255,0,240,0,23,20,0,20,79,240,113,198,177,113,195,227,97,193,227,65,224,227,129,241,225,143,240,224,135,124,248,159,60,254,31,255,255,71,126,252,128,113,240,129,113,248,199,114,252,231,116,254,253,119,254,255,123,4,248,55,0,254,59,242,247,59,227,239,247,253,123], i: [0,160,0,0,0,2,0,0,0,4,224,0,128,176,0,195,225,65,193,227,65,224,227,129,224,224,135,112,224,143,120,248,15,60,254,31,60,255,0,108,248,128,96,240,128,112,240,131,112,248,135,112,254,5,113,254,71,98,0,32,4,0,16,8,0,24,16,0,12,192,0,3] },
  { key: '2', w: [252,255,253,255,255,255,255,255,251,255,255,255,255,127,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,247,255,255,255,255,255,255,223,255,255,255,255,255,255,255,255,255,255,255,255,255,255,191,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [176,239,1,200,0,63,20,0,56,142,225,225,12,97,225,6,195,195,131,199,131,195,195,129,225,195,31,241,225,31,241,240,23,249,254,31,254,255,143,217,253,129,193,224,1,225,240,143,225,252,143,231,252,223,171,252,251,253,8,250,95,0,250,191,253,255,255,227,255,206,253,255], i: [0,0,0,64,0,4,16,0,0,0,192,1,4,65,1,0,195,65,130,195,129,193,195,1,225,193,15,225,192,31,241,240,23,121,254,31,252,255,1,217,248,1,193,224,1,193,224,7,193,248,15,226,254,143,224,252,143,196,8,64,8,0,32,0,0,16,32,0,24,128,0,6] },
  { key: '2', w: [254,127,255,255,255,255,247,255,253,255,60,255,255,189,255,255,255,255,255,255,255,255,255,127,255,255,255,255,254,255,127,254,255,191,255,255,247,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [224,99,7,224,0,31,20,96,28,207,32,16,198,161,113,193,225,193,225,227,193,225,225,1,224,225,135,248,240,143,124,254,159,62,255,143,246,255,135,126,250,129,112,240,128,112,240,135,97,254,207,113,255,207,117,254,102,123,14,224,110,0,244,77,0,254,59,163,254,231,248,127], i: [0,0,0,0,0,0,0,0,0,0,32,0,130,160,0,193,225,1,192,225,1,224,225,1,224,224,5,240,224,15,56,248,31,60,255,15,54,255,0,108,252,0,96,224,0,96,224,3,96,252,135,113,254,135,97,254,70,96,0,32,34,0,32,12,0,16,16,0,12,96,0,2] },
  { key: '2', w: [252,238,254,255,255,255,255,255,251,255,253,247,255,127,255,255,255,255,255,255,251,254,255,255,255,255,255,255,253,255,255,254,247,255,255,255,255,255,255,255,254,255,255,239,253,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [144,198,6,236,0,98,58,192,56,142,225,227,133,99,65,135,199,131,131,199,129,194,199,3,225,195,7,240,225,63,249,248,55,120,255,63,253,255,15,253,248,1,225,224,1,225,224,7,225,252,143,227,254,223,107,252,236,116,24,240,197,0,112,159,0,254,119,180,248,207,121,255], i: [0,0,0,0,0,0,0,0,0,0,192,0,0,65,1,128,195,1,128,195,129,192,195,3,192,193,3,240,193,31,112,248,23,120,254,31,124,255,1,216,248,1,192,224,1,224,224,7,225,248,15,97,252,143,98,252,132,64,8,0,68,0,64,0,0,48,32,0,8,128,0,4] },
  { key: '3', w: [255,255,127,111,254,255,255,255,255,255,255,255,255,248,223,255,255,255,255,255,191,223,255,247,255,255,254,255,255,247,227,255,247,255,255,255,255,255,254,239,255,255,255,255,255,255,255,255,239,255,255,255,255,255,127,255,255,126,255,255,255,255,255,255,255,255,255,255,247,255,255,255], r: [240,195,1,108,0,6,158,1,14,134,3,72,131,0,0,129,135,97,129,231,39,209,239,71,255,127,206,255,255,135,226,255,135,254,255,143,250,255,142,225,255,143,248,253,143,252,253,207,234,253,255,255,252,255,111,252,255,112,152,247,227,4,255,231,228,255,141,253,247,243,255,127], i: [0,0,0,0,0,0,128,1,0,128,3,0,1,0,0,0,3,0,128,195,3,192,231,6,248,31,14,255,251,7,226,253,7,220,255,14,216,251,6,224,249,7,240,248,135,248,248,134,232,24,134,248,248,71,96,248,71,96,24,39,194,0,50,130,0,24,12,0,4,80,0,3] },
  { key: '3', w: [252,255,255,223,253,247,255,255,255,255,247,255,251,250,255,255,254,255,255,255,249,255,255,247,255,255,239,255,255,239,235,255,231,255,255,255,255,255,239,223,247,239,255,247,255,255,255,255,255,255,255,255,255,255,255,255,255,251,191,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [176,135,31,216,0,116,28,7,40,28,7,32,11,26,128,7,14,128,7,143,153,193,255,55,243,255,13,255,255,15,232,255,7,252,255,31,249,255,15,194,247,47,226,247,63,243,247,63,247,243,255,251,247,255,255,243,255,153,51,254,7,103,254,159,255,255,63,254,255,255,254,255], i: [0,0,0,0,0,0,0,2,0,0,6,0,0,24,0,0,14,0,0,14,9,128,159,17,224,111,4,252,231,7,232,247,7,120,255,27,48,255,13,128,247,15,224,243,31,224,243,31,241,51,28,227,243,31,162,243,158,128,3,156,4,1,72,8,1,96,32,0,16,0,0,12] },
  { key: '3', w: [254,190,127,255,254,251,255,255,255,255,254,255,255,253,255,255,255,255,255,255,255,255,255,255,255,255,255,239,255,119,231,255,247,243,255,255,255,255,255,239,255,255,255,255,255,255,255,255,255,254,255,255,255,255,255,255,253,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [192,182,1,248,0,11,152,3,12,134,6,120,134,5,112,1,7,97,129,199,103,224,255,207,252,127,198,239,255,7,230,255,135,242,255,143,244,255,143,224,255,143,248,253,143,248,252,254,248,252,247,250,252,255,253,248,245,195,24,254,199,0,254,127,224,255,63,251,255,247,127,127], i: [0,32,0,0,0,0,0,1,0,128,6,0,0,5,0,1,7,0,128,195,67,192,231,7,248,23,6,238,251,7,230,251,7,242,255,6,216,251,134,192,249,135,240,248,134,248,120,134,248,152,134,248,248,71,193,248,69,192,0,39,66,0,18,12,0,8,24,0,4,96,0,3] },
  { key: '3', w: [252,255,254,255,251,255,255,255,255,255,251,191,255,251,63,255,255,255,255,255,255,255,255,251,255,255,252,255,255,239,238,255,239,255,255,255,255,255,255,254,255,255,255,251,255,255,255,255,255,255,255,255,255,253,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [160,223,6,216,0,126,56,2,208,8,27,48,13,26,32,5,30,192,2,142,31,131,255,91,253,255,60,255,239,15,238,255,15,249,255,31,241,255,31,160,255,31,229,243,31,227,243,31,195,243,159,234,243,189,63,227,255,151,99,252,31,67,252,255,253,255,255,246,255,254,251,247], i: [0,0,0,0,0,4,0,0,0,0,10,0,0,26,0,0,14,0,0,142,15,130,191,27,225,111,24,253,239,15,232,247,15,249,255,31,113,239,25,128,247,31,193,241,31,225,243,25,226,115,29,226,243,31,4,227,159,4,3,204,8,1,96,48,0,16,96,0,16,128,0,4] },
  { key: '3', w: [254,127,127,255,255,251,191,255,253,191,255,249,255,252,255,255,247,254,223,255,253,255,255,255,255,255,119,255,255,247,243,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,253,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [232,115,1,244,0,11,12,1,12,134,7,240,131,4,48,129,135,114,192,207,205,241,255,143,252,127,86,254,255,135,242,255,143,254,255,143,216,255,143,240,255,143,248,253,143,252,253,207,248,253,207,248,253,231,241,249,245,225,57,255,194,1,247,207,0,255,43,242,254,247,184,123], i: [0,0,0,0,0,0,0,1,0,0,3,0,0,4,0,0,131,0,128,199,5,192,231,15,240,23,6,254,249,7,226,253,15,252,255,14,200,251,14,224,251,7,240,249,143,248,121,142,248,152,134,248,248,71,193,248,69,192,0,39,194,0,18,12,0,8,0,0,4,96,0,3] },
  { key: '3', w: [252,255,254,255,251,251,255,255,254,255,241,255,255,250,239,255,254,233,127,255,241,255,255,243,255,255,249,255,255,239,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,251,255,255,255,255,255,255,247,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [48,135,22,72,1,58,52,7,48,24,1,96,13,26,224,6,30,137,2,31,17,131,255,19,247,255,57,253,255,47,253,255,63,248,255,63,113,255,59,193,255,63,225,247,63,225,243,63,241,243,63,227,243,63,166,243,247,133,227,254,15,3,252,127,1,254,127,102,219,207,201,255], i: [0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,14,0,0,14,1,128,159,17,225,111,24,252,231,15,168,247,31,240,255,27,48,255,25,128,247,31,192,243,31,225,243,25,225,115,24,162,243,31,2,227,22,4,3,140,8,1,72,16,1,32,32,0,16,128,0,12] },
  { key: '4', w: [255,255,127,239,159,255,255,255,255,253,159,255,254,155,255,191,255,255,159,255,255,207,255,191,239,255,255,239,255,255,241,255,255,243,255,127,247,255,127,239,255,247,255,255,247,239,255,247,239,255,187,239,255,255,239,255,255,239,255,221,255,255,254,255,255,246,251,255,255,255,255,254], r: [120,240,1,46,0,7,0,224,14,96,158,88,224,155,48,177,255,96,145,255,224,76,255,160,44,255,192,14,255,192,17,255,224,147,255,71,182,255,79,44,255,215,56,127,246,8,255,246,232,255,187,239,255,255,239,254,255,109,209,217,155,226,254,243,242,246,107,224,255,95,255,126], i: [0,0,0,0,0,0,0,0,0,0,0,0,96,19,0,32,119,0,16,127,0,72,123,0,8,123,0,12,251,0,0,255,0,18,59,0,16,251,7,8,63,6,24,60,6,8,120,6,136,223,2,236,14,67,108,36,3,12,224,1,1,192,16,2,192,0,0,0,6,0,0,0] },
  { key: '4', w: [252,255,255,190,255,222,255,255,255,255,127,252,247,124,124,255,255,255,255,255,255,255,255,255,255,255,255,254,255,255,238,255,255,254,255,255,254,255,255,254,255,207,254,255,223,254,255,223,255,255,223,255,255,255,255,255,255,255,255,239,247,255,251,255,255,255,222,255,223,255,255,255], r: [224,3,3,184,0,28,120,65,55,152,99,68,0,124,4,134,255,3,134,255,3,231,253,3,225,253,3,246,252,7,232,252,7,248,253,47,250,253,63,226,253,207,226,249,219,224,248,215,199,255,223,251,255,255,255,255,255,127,131,239,199,161,251,207,255,255,30,1,222,255,243,255], i: [0,0,0,0,0,0,0,0,0,0,0,0,0,24,0,128,251,1,128,251,3,192,249,3,224,216,3,224,216,3,96,252,3,112,204,1,240,204,31,192,236,1,192,224,16,192,192,23,192,253,31,192,115,24,96,179,24,100,0,143,64,0,202,0,0,68,0,0,0,0,0,12] },
  { key: '4', w: [255,127,127,255,255,127,255,255,255,255,207,255,255,159,255,191,255,255,191,255,255,255,255,255,255,255,255,231,255,255,247,255,255,243,255,255,247,255,255,247,255,255,247,255,255,239,255,255,239,255,255,239,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [232,121,1,120,192,11,14,128,6,227,202,108,195,159,88,160,127,48,176,127,224,120,127,224,60,127,64,36,255,224,22,255,224,18,127,192,52,255,199,48,255,207,48,127,254,40,255,255,236,255,247,234,255,255,251,245,255,27,224,255,27,208,255,175,224,255,15,112,255,127,255,125], i: [0,0,0,48,0,0,4,0,0,64,200,0,64,152,0,160,119,0,48,127,64,80,127,64,56,55,0,36,255,0,20,255,128,18,123,128,16,251,135,48,61,135,16,60,6,8,248,70,136,255,70,232,14,67,88,48,35,25,224,19,2,192,9,4,128,5,0,0,2,0,128,1] },
  { key: '4', w: [252,253,255,254,255,255,255,255,255,255,63,252,247,127,252,255,255,255,255,255,255,255,255,255,255,253,255,255,255,255,255,255,255,255,255,255,255,255,223,255,255,223,255,255,223,255,255,223,255,255,223,255,255,255,255,255,255,255,255,255,255,255,251,255,255,255,255,255,255,255,255,255], r: [96,245,15,240,1,62,44,128,26,22,43,212,146,127,192,140,255,195,130,251,3,194,249,3,226,248,3,227,248,7,241,248,7,241,252,3,247,253,31,195,248,87,225,248,91,194,248,95,227,255,223,203,255,189,245,243,221,95,130,255,31,160,251,191,207,252,255,1,252,254,138,255], i: [0,1,0,192,0,0,0,0,0,0,1,0,0,11,0,0,255,1,128,251,3,194,249,3,192,248,1,97,248,3,97,248,3,112,248,1,224,248,31,192,248,17,193,224,17,192,224,27,194,254,27,194,119,24,100,131,28,64,0,143,8,0,74,0,0,36,0,0,16,0,0,4] },
  { key: '4', w: [255,255,127,255,255,255,255,255,254,253,143,255,63,159,255,191,255,255,159,255,255,223,255,255,239,255,255,191,255,255,247,255,255,243,255,255,255,255,255,239,255,255,239,255,255,255,255,255,231,255,251,255,255,251,255,255,255,255,255,253,255,255,254,255,255,255,255,255,255,255,255,255], r: [248,240,5,60,128,7,12,240,14,196,140,88,35,159,24,48,255,32,144,255,224,88,255,64,108,127,64,60,255,192,6,255,192,146,127,192,190,255,199,44,255,207,40,127,222,24,253,206,228,255,243,254,191,243,255,244,247,29,224,253,27,224,254,15,160,255,29,240,255,119,254,123], i: [0,0,0,0,0,0,0,0,0,0,0,0,32,18,0,32,118,0,144,250,0,88,122,0,32,119,0,44,251,0,4,127,0,18,59,0,20,251,7,0,253,7,0,60,6,0,120,6,128,255,2,232,14,3,72,48,35,8,224,49,1,192,16,0,128,0,0,0,2,0,0,1] },
  { key: '4', w: [254,255,255,254,255,255,127,255,255,127,63,236,255,127,252,255,255,254,255,251,255,255,255,255,255,255,255,255,255,255,255,255,255,254,255,255,254,255,239,255,255,223,255,255,223,255,254,223,255,255,255,255,255,255,255,255,255,255,255,239,255,255,251,255,255,251,255,255,239,255,255,255], r: [160,199,23,88,1,30,52,0,51,30,43,224,140,123,192,142,255,130,198,251,3,194,249,3,225,249,1,241,253,3,249,252,3,248,253,9,240,253,47,225,253,95,225,248,91,227,224,95,226,255,63,227,255,191,231,163,223,239,0,239,255,0,251,63,0,250,239,0,236,222,0,255], i: [0,0,0,0,0,0,0,0,0,0,0,0,0,25,0,128,219,0,128,249,3,192,249,1,224,217,1,224,248,3,112,248,3,112,216,1,240,252,15,192,232,23,192,224,16,224,224,19,192,253,23,226,115,24,96,128,25,64,0,143,8,0,202,0,0,32,0,0,0,0,0,4] },
  { key: '5', w: [255,255,127,247,223,126,255,255,255,255,223,247,255,223,239,255,255,255,223,255,255,207,255,191,239,255,255,255,255,255,243,255,255,243,255,255,255,255,255,239,255,255,239,255,191,255,255,255,255,255,251,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [96,240,1,48,128,14,39,56,6,99,88,68,113,216,136,112,254,176,80,254,224,76,255,35,236,255,103,220,191,231,195,255,199,146,255,195,159,255,193,40,255,240,12,255,175,28,255,255,252,255,251,255,255,253,255,31,255,30,28,252,157,60,255,251,252,255,111,56,254,95,254,63], i: [0,0,0,0,0,0,0,24,0,0,16,0,96,216,0,112,124,0,16,62,0,72,248,1,140,252,67,140,158,7,194,249,3,130,191,1,154,255,1,8,255,0,8,31,3,12,254,79,204,255,75,252,31,4,108,24,32,12,24,48,1,24,8,2,8,8,0,0,6,0,0,1] },
  { key: '5', w: [252,255,255,190,255,255,255,255,255,255,255,254,247,127,250,255,255,252,255,255,255,253,255,247,255,255,247,255,255,215,254,255,239,254,255,255,254,255,255,254,255,255,255,255,255,255,255,255,255,255,219,255,255,255,255,255,255,247,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,7,15,184,1,216,120,130,225,48,130,226,148,71,202,137,247,4,135,247,7,192,251,23,195,253,55,225,253,23,242,252,47,244,253,31,244,253,31,196,249,15,199,249,39,199,249,255,247,255,219,255,255,255,255,255,225,199,193,241,255,193,243,255,255,251,127,255,255,190,255,127], i: [0,0,0,0,0,0,0,128,0,0,128,0,0,2,2,0,231,4,132,227,1,128,129,7,192,225,23,224,240,17,240,204,11,240,252,13,224,248,15,192,249,7,192,241,1,192,240,127,192,252,219,198,255,1,196,206,0,196,192,0,72,192,128,16,128,192,0,0,32,0,0,16] },
  { key: '5', w: [255,255,31,255,255,127,255,255,127,255,223,255,255,223,255,255,255,255,223,255,255,239,255,255,255,255,255,255,255,255,255,255,255,255,255,191,255,255,191,255,255,255,255,255,255,239,255,255,239,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [232,127,0,30,192,15,7,56,15,99,24,124,99,88,124,177,254,208,216,126,160,104,255,225,188,255,227,222,255,115,222,255,67,223,255,3,190,255,33,60,255,96,28,255,231,136,255,255,204,255,255,255,95,253,127,24,252,31,24,252,27,136,254,62,120,255,45,248,127,63,255,63], i: [0,1,0,8,0,0,4,16,0,0,16,0,97,80,0,96,126,0,80,126,0,40,254,1,44,254,67,156,191,67,142,185,66,138,191,1,24,253,1,24,127,64,24,159,67,8,255,79,140,255,15,236,31,36,76,24,0,13,24,16,1,8,8,2,0,4,0,0,2,32,128,129] },
  { key: '5', w: [252,254,255,254,254,255,255,254,255,255,255,255,255,255,254,255,255,252,255,255,253,255,255,255,255,255,255,255,255,239,255,255,247,255,255,255,255,255,255,255,255,255,255,255,255,255,254,255,255,255,251,255,255,255,255,255,254,255,191,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,238,23,208,2,94,112,192,107,56,131,195,24,131,198,13,247,132,141,247,5,199,251,31,227,255,31,226,252,47,226,252,55,240,252,31,240,251,15,196,249,15,194,249,63,203,248,255,199,255,251,255,255,253,255,207,208,255,128,224,23,193,249,175,251,251,127,255,255,188,251,127], i: [0,0,0,192,0,0,0,128,0,0,130,1,0,130,130,8,231,132,132,231,1,130,243,15,192,233,31,226,244,13,224,236,21,240,252,13,224,216,15,192,248,7,194,240,21,194,240,127,194,252,123,196,255,1,196,198,0,200,128,128,16,128,192,32,0,96,64,0,48,128,1,12] },
  { key: '5', w: [255,255,63,255,127,127,255,239,255,255,207,255,255,223,255,255,255,255,223,254,253,223,255,255,239,255,255,255,255,255,243,255,255,251,255,255,243,255,255,255,255,255,255,255,255,251,255,255,255,255,251,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [244,240,0,61,88,5,2,104,14,99,72,124,113,216,120,224,254,144,88,254,160,88,255,129,172,255,99,238,255,199,195,255,3,219,255,1,178,255,129,154,255,65,24,255,199,24,255,239,252,255,251,253,255,253,254,28,252,28,24,248,13,24,252,3,28,254,13,252,127,63,247,63], i: [0,0,0,0,0,0,0,8,0,0,0,0,96,88,0,96,124,0,16,60,0,72,248,1,44,248,3,132,189,3,194,253,3,138,189,1,18,255,0,24,255,0,24,31,2,8,252,7,140,255,11,236,31,36,12,28,32,12,24,16,9,8,0,2,8,4,0,0,2,0,128,1] },
  { key: '5', w: [252,237,255,254,255,255,127,255,247,239,255,248,255,127,124,255,247,252,255,255,255,255,255,255,255,255,247,255,255,239,255,255,239,253,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,243,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,247], r: [0,133,47,248,193,175,96,192,97,40,129,192,28,67,68,129,231,132,197,247,15,194,243,31,226,251,23,225,255,47,240,254,47,241,254,31,241,253,15,193,249,7,195,249,63,226,241,255,226,255,243,199,255,207,255,207,192,207,192,225,255,192,225,127,201,241,239,200,56,190,121,119], i: [0,0,0,0,0,0,0,128,0,0,128,0,0,2,0,0,227,4,128,227,1,192,227,15,192,201,23,224,229,43,224,220,15,240,252,13,224,216,15,192,249,7,192,240,1,192,224,127,192,252,115,192,255,1,196,194,0,200,192,0,88,192,128,16,192,64,0,0,16,0,0,0] },
  { key: '6', w: [239,255,247,255,255,247,255,255,255,255,207,246,127,159,255,127,255,191,239,255,253,239,255,255,255,255,255,239,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,7,254,255,255,255,255,255,255,255,255,247,255,255,255,255,255,255], r: [104,0,4,124,16,116,238,112,64,227,193,160,99,152,160,97,252,135,239,255,77,236,63,206,252,255,143,110,254,135,127,254,135,127,254,195,126,254,129,248,223,193,248,135,192,253,7,246,134,7,255,15,255,255,15,6,254,243,252,255,255,248,255,219,255,247,239,255,127,255,255,127], i: [0,0,0,0,0,0,224,32,0,224,192,0,96,16,0,96,248,1,224,253,4,236,15,14,252,113,6,108,252,7,46,252,3,54,252,131,118,254,129,240,134,128,248,7,128,152,3,128,12,7,88,7,14,94,1,254,63,2,224,31,6,0,24,8,0,4,32,0,3,0,63,1] },
  { key: '6', w: [191,255,247,255,255,255,255,255,255,127,124,255,127,127,255,255,255,255,254,255,243,254,255,255,254,255,255,246,255,255,255,255,255,255,255,255,254,255,255,254,255,255,255,255,255,254,255,255,255,255,255,255,255,255,255,127,252,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [180,1,4,252,225,48,216,227,112,15,96,65,6,99,135,135,243,15,152,255,211,248,255,60,248,247,61,240,249,15,255,248,15,253,248,15,244,253,7,232,127,3,193,31,161,114,15,224,123,30,240,63,252,252,55,24,248,79,246,255,255,255,255,119,255,255,255,255,255,255,255,255], i: [0,0,0,128,64,0,128,193,0,0,64,1,0,97,4,128,241,7,128,247,17,240,183,24,240,231,29,240,248,15,248,248,15,220,248,7,200,248,3,224,27,2,225,31,0,112,14,32,50,28,32,62,56,120,4,248,255,8,128,95,8,0,32,32,0,16,192,3,12,0,191,4] },
  { key: '6', w: [255,127,127,255,255,255,191,255,255,255,255,255,255,255,255,223,254,255,255,255,255,255,255,255,255,255,127,247,255,255,255,255,255,247,127,255,255,255,255,247,223,255,255,255,255,247,255,255,255,255,255,255,253,219,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [96,64,7,122,16,116,172,48,112,227,224,176,225,248,225,193,248,67,224,253,199,236,63,206,252,255,7,244,254,135,127,254,131,247,125,195,126,254,131,240,223,129,248,15,224,176,7,248,63,15,254,15,189,219,23,254,255,59,248,255,239,255,239,55,255,255,239,191,127,159,127,126], i: [0,0,1,0,0,4,36,48,0,194,224,16,192,80,32,193,248,67,160,252,7,236,63,142,252,115,7,116,252,131,46,252,131,38,252,131,54,252,129,240,223,129,240,7,128,184,7,8,13,7,72,7,14,94,3,252,63,2,224,31,12,0,8,48,0,6,192,128,1,1,63,128] },
  { key: '6', w: [255,255,255,255,255,223,255,253,223,255,127,255,255,127,255,253,253,246,255,255,253,255,255,247,255,255,255,255,255,255,255,255,255,255,255,255,255,245,255,255,127,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,223,255,255,255,255,255,255,255,255,255,255,255,255], r: [224,7,7,252,0,28,146,224,16,141,99,193,142,99,135,140,241,134,131,247,141,249,255,20,241,255,31,251,251,15,253,248,15,253,248,135,213,240,7,249,127,3,195,31,32,99,31,240,59,28,248,61,120,254,63,248,255,31,228,223,191,251,191,239,255,255,191,191,254,126,255,255], i: [0,0,2,0,0,0,128,192,0,128,67,1,128,99,129,128,241,6,130,243,13,208,127,16,241,239,13,241,248,15,253,248,7,253,248,7,217,248,3,193,63,3,225,31,0,96,27,32,50,24,48,60,56,248,4,240,255,8,192,95,16,0,48,224,0,8,0,7,6,0,252,0] },
  { key: '6', w: [191,239,254,255,255,255,191,223,255,255,255,255,255,159,254,255,255,252,191,255,255,255,127,251,255,255,255,239,254,255,247,255,255,255,255,255,255,255,255,255,223,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [50,128,42,252,32,124,190,80,216,230,240,176,225,152,224,225,252,68,172,255,79,252,63,138,252,255,135,238,254,135,119,254,135,127,254,131,254,254,131,248,223,128,240,7,128,248,7,200,30,15,216,15,254,255,7,222,255,3,248,191,79,128,239,59,238,255,247,132,255,207,255,127], i: [0,0,0,0,0,0,132,16,0,66,224,0,64,152,0,96,248,0,160,253,7,236,29,10,252,243,6,108,252,7,38,252,131,62,252,131,246,252,129,240,6,0,248,7,0,152,7,128,12,6,72,7,30,95,1,252,63,2,240,31,4,0,8,0,0,4,96,0,3,128,239,0] },
  { key: '6', w: [255,159,255,255,255,251,255,255,255,255,126,255,255,126,253,255,255,254,223,255,247,255,255,252,255,255,255,255,255,255,239,255,255,255,255,255,255,251,255,254,127,255,255,255,255,127,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [68,1,30,244,225,152,154,225,32,141,66,65,195,98,133,194,243,30,210,247,23,249,255,60,241,255,31,253,248,31,237,248,15,253,248,15,249,249,7,224,127,3,225,31,32,97,30,160,50,30,240,31,252,255,61,248,254,29,240,255,127,0,254,239,255,255,223,19,238,63,255,255], i: [0,0,0,0,0,0,128,193,0,128,64,1,128,96,1,128,225,6,128,243,21,144,119,24,241,231,29,248,248,13,232,248,15,220,248,15,249,249,3,224,27,1,225,27,0,96,30,32,50,28,32,26,120,188,4,240,255,8,192,95,16,0,32,32,0,16,128,0,12,0,254,1] },
  { key: '7', w: [239,255,254,255,219,245,255,223,255,255,247,255,254,254,191,127,255,255,255,255,255,255,255,127,255,255,255,255,255,255,255,251,255,255,255,255,255,255,255,239,255,247,255,255,255,255,255,255,255,255,191,255,255,255,255,255,255,255,255,239,255,255,247,255,255,255,223,127,190,255,255,255], r: [38,56,30,12,88,20,6,222,56,131,119,112,130,30,160,96,119,192,193,251,193,129,255,97,130,255,193,194,255,192,192,251,128,192,255,195,192,255,207,239,255,199,254,255,255,255,241,255,110,255,185,255,227,249,255,224,253,127,192,239,119,255,247,11,255,255,223,123,190,255,255,127], i: [0,0,0,0,24,0,0,28,0,0,6,0,128,0,0,64,97,0,128,243,0,128,255,1,128,247,0,128,115,0,192,57,0,192,60,0,192,255,7,224,255,7,254,239,7,6,0,0,96,227,0,241,224,65,48,224,33,18,192,0,0,0,0,0,0,6,0,0,0,0,0,128] },
  { key: '7', w: [255,255,255,247,219,247,255,255,255,253,255,255,255,255,191,127,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,239,255,255,255,255,255,255,255,255,255,255,191,255,255,255,255,255,255,237,255,255,255,255,247,255,255,255,191,127,191,255,255,255], r: [180,56,15,20,88,148,6,254,176,128,127,32,195,63,160,1,231,192,192,251,193,131,255,129,131,255,129,129,255,129,192,251,128,192,255,131,192,255,143,239,255,255,255,255,223,255,227,255,109,199,185,255,231,251,255,228,255,109,192,255,255,225,247,255,255,255,191,127,191,127,255,127], i: [0,0,0,0,24,0,0,28,48,0,6,0,128,1,0,0,97,0,128,243,0,0,255,129,128,255,0,128,115,0,128,57,0,128,61,0,128,255,7,224,255,31,254,239,7,6,0,0,96,194,0,241,224,65,50,224,33,32,192,48,0,0,0,0,0,4,0,0,1,1,0,64] },
  { key: '7', w: [255,255,255,247,191,255,251,255,255,255,255,255,255,253,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,247,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,223,255,255,255,255,255,255,255,255,255,255,255,255,255,255,191,255,125,255,255,255], r: [48,48,13,16,48,88,8,252,240,4,126,96,195,61,224,129,247,128,192,247,129,131,255,195,131,255,131,131,255,129,195,247,129,195,255,131,195,255,159,255,255,159,255,255,255,255,231,247,239,207,241,219,195,243,255,193,255,255,128,255,63,195,255,31,255,253,191,255,125,255,255,255], i: [0,16,0,0,48,16,0,88,0,0,14,0,0,1,0,128,65,128,128,227,1,0,255,1,0,239,1,0,99,0,128,49,0,128,121,0,128,255,7,224,255,31,252,207,7,5,0,0,193,134,129,226,193,67,98,192,67,36,128,33,0,0,16,0,0,12,0,0,1,0,0,0] },
  { key: '7', w: [223,255,255,247,183,255,251,223,255,255,239,255,253,253,127,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,247,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,254,255,255,255,255,255,255,255,255,219,255,255,239,255,239,255,255,255,255,255,124,255,255,255], r: [208,96,12,18,176,56,8,220,240,6,239,224,0,61,0,199,207,128,133,247,131,3,255,195,3,255,3,131,255,1,131,247,1,131,255,131,131,255,159,255,255,255,254,255,255,255,193,255,220,143,243,255,231,243,255,225,255,219,192,255,239,255,239,63,255,255,255,255,124,255,255,255], i: [0,0,0,0,48,16,0,24,0,0,12,0,0,1,0,128,65,128,128,227,1,0,255,1,0,239,1,0,231,0,128,115,0,128,123,0,128,255,15,224,255,31,252,223,7,12,0,0,192,134,129,226,193,131,96,192,67,64,128,97,0,0,0,0,0,8,0,0,0,0,0,0] },
  { key: '7', w: [255,255,255,255,191,251,255,79,255,255,239,255,253,255,255,255,255,255,254,255,255,254,255,255,255,255,255,255,255,255,255,239,255,255,255,255,255,255,255,254,255,255,254,255,255,254,255,255,255,255,255,255,255,255,255,255,255,255,255,223,191,255,255,191,255,255,127,255,249,255,255,255], r: [64,112,44,62,176,152,14,76,33,12,236,224,128,127,192,3,239,0,130,255,3,6,255,3,7,255,3,1,255,3,129,239,3,129,255,135,129,255,239,254,255,255,254,255,255,254,199,255,219,143,195,255,143,231,255,195,255,235,129,223,183,255,255,175,255,255,94,255,249,254,254,239], i: [0,0,0,0,32,0,0,0,0,0,12,0,0,3,0,0,131,0,0,231,1,0,254,3,0,254,3,0,227,0,0,99,0,0,115,0,0,255,15,224,255,63,252,159,7,8,0,0,130,141,3,198,131,135,196,129,199,72,0,67,0,0,48,0,0,24,0,0,0,0,0,128] },
  { key: '7', w: [239,255,126,255,255,254,255,251,255,255,247,255,255,255,255,255,247,255,255,247,191,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,191,255,255,255,255,255,255,255,255,255,239,255,255,239,255,255,255,255,191,255,255,255], r: [236,192,18,24,56,14,4,122,88,2,55,48,131,63,32,129,119,64,128,243,128,192,255,193,129,255,129,128,255,128,192,123,192,192,127,192,192,255,199,231,255,223,254,255,255,255,112,249,207,243,169,253,240,251,251,224,255,127,224,255,45,222,255,99,127,255,255,224,190,255,193,127], i: [32,0,0,8,16,0,4,56,0,2,6,0,129,1,0,128,97,64,128,99,0,128,255,128,128,255,128,128,49,0,128,113,128,192,29,128,128,255,131,224,255,31,254,239,135,6,0,64,97,227,1,241,224,33,48,224,1,50,64,16,4,0,12,0,0,2,64,224,0,0,0,192] },
  { key: '7', w: [255,255,255,255,255,255,255,239,255,255,247,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [244,128,19,28,120,14,15,236,216,15,119,112,195,63,96,129,99,192,193,227,192,131,255,193,131,255,129,128,255,129,192,255,0,192,127,192,192,255,135,232,255,223,254,255,223,254,224,217,237,231,249,235,225,251,239,224,251,119,192,255,127,199,254,191,255,255,223,224,255,126,193,127], i: [32,0,0,16,24,0,12,72,16,2,6,0,128,1,64,129,97,0,128,227,0,128,255,129,128,255,0,128,115,1,128,185,0,128,88,0,128,255,3,224,255,31,254,239,135,4,0,128,65,227,65,224,225,1,34,224,35,36,128,16,0,0,0,0,0,6,128,192,1,0,0,128] },
  { key: '7', w: [255,223,255,255,255,255,255,207,255,255,247,255,255,255,255,191,239,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,239,255,255,255,255,255,247,255,255,255,255,255,255,255,255,191,255,254,255,255,255,255,255,255,255,255,255,254,255,255,255,255,255], r: [240,128,7,16,56,26,12,76,120,14,118,224,134,63,192,131,227,192,129,231,192,3,255,193,3,255,129,2,255,129,130,255,128,130,255,64,130,255,207,238,255,159,255,255,223,247,224,241,239,231,241,251,241,235,191,209,250,253,192,255,95,82,255,223,255,255,190,193,255,252,131,127], i: [0,0,0,0,16,0,0,72,0,0,6,64,2,3,64,129,65,0,129,195,128,0,255,129,0,255,1,0,99,0,128,51,0,128,63,0,128,255,3,224,255,31,252,223,143,5,0,128,192,199,1,226,193,67,32,192,32,36,128,32,0,0,24,0,0,6,128,192,1,0,0,0] },
  { key: '7', w: [255,255,255,239,255,253,255,223,255,255,247,255,255,255,255,255,239,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,247,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [208,129,14,32,112,28,24,216,176,12,118,224,2,63,192,2,231,128,129,231,129,3,255,131,3,255,3,0,255,1,128,255,1,128,255,0,130,255,143,253,255,159,253,255,255,247,129,241,218,207,243,255,193,243,245,193,249,239,192,255,127,193,255,239,255,255,191,195,255,252,131,127], i: [192,0,0,0,48,0,0,80,0,4,4,96,2,3,128,0,67,128,128,195,1,1,255,3,1,255,1,0,103,1,0,245,0,0,51,0,0,255,3,225,255,31,253,223,15,1,0,0,130,199,131,192,193,67,68,192,67,72,128,33,16,0,17,64,0,4,0,0,1,0,0,0] },
  { key: '7', w: [255,191,255,255,255,255,255,159,255,255,239,255,255,255,255,255,239,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,231,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,254,254,255,255,255], r: [240,1,13,52,48,60,26,144,48,14,236,64,15,127,192,2,231,128,131,231,129,3,255,131,3,254,3,3,255,3,1,255,1,129,255,129,131,255,143,251,255,255,253,255,231,250,195,193,215,207,195,247,227,231,255,195,247,203,193,255,191,195,255,239,255,255,254,130,246,252,3,255], i: [192,0,0,32,32,0,16,144,32,0,8,64,2,7,0,0,131,0,0,199,1,0,255,3,0,222,3,0,198,0,1,115,0,1,179,0,1,255,7,225,255,63,249,255,7,26,0,0,130,134,3,196,131,135,204,128,71,72,0,97,16,0,48,64,0,12,128,0,2,0,0,128] },
  { key: '8', w: [255,255,255,255,255,255,255,127,255,255,191,255,255,191,255,127,62,236,255,15,248,127,15,248,31,22,254,39,2,254,47,79,254,23,95,224,63,239,252,39,227,253,19,197,253,59,199,253,59,199,253,63,255,125,63,239,253,191,207,254,255,63,254,255,255,254,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,64,0,0,64,0,0,0,0,0,0,0,0,0,0,0,0,0,0,24,0,0,24,0,0,16,0,2,4,33,31,128,1,31,240,7,2,240], i: [0,67,0,64,67,0,32,0,0,8,96,16,132,224,16,194,161,103,131,113,15,129,121,134,193,185,3,252,253,1,248,249,1,216,176,63,224,248,63,240,127,3,222,6,3,206,56,3,230,120,3,193,48,131,193,24,131,194,240,67,194,224,99,4,128,17,0,0,25,0,0,4] },
  { key: '8', w: [255,255,255,255,255,255,191,255,255,255,159,255,255,31,251,127,46,254,255,30,252,191,14,252,191,30,254,55,31,254,63,31,254,63,95,192,31,102,252,14,228,248,59,239,249,63,199,251,63,231,255,62,255,255,63,247,254,191,31,254,255,63,254,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,64,0,0,0,0,0,64,0,0,0,0,0,64,0,0,0,0,0,0,0,0,0,0,0,0,0,0,24,0,0,24,1,0,0,33,10,128,3,63,224,3,63,224,15,22,240], i: [0,0,0,128,195,0,96,0,2,0,96,0,8,224,16,132,225,39,130,179,77,131,123,69,153,249,131,184,253,129,184,189,128,216,177,191,224,249,56,176,63,3,220,38,131,204,120,131,205,104,131,225,56,131,226,56,67,192,224,3,4,224,33,8,128,17,16,0,13,0,0,7] },
  { key: '8', w: [255,255,255,255,255,255,255,255,255,255,159,255,255,127,255,127,62,252,127,30,248,127,14,252,125,22,254,103,31,254,63,95,238,63,79,192,63,110,252,7,226,252,63,230,253,63,199,253,59,231,253,63,239,253,63,239,252,191,31,254,255,63,254,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,0,0,0,0,64,0,0,128,0,0,128,0,0,0,0,0,64,0,0,64,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,33,0,128,1,1,192,3,63,224,7,6,240], i: [0,60,0,128,67,0,64,0,0,8,96,0,196,224,0,128,161,3,130,49,71,129,27,135,129,185,131,188,237,1,248,249,25,200,177,63,224,217,57,240,63,3,220,3,3,196,56,3,196,72,131,193,56,131,192,56,67,194,224,67,68,192,34,0,128,17,0,0,5,0,0,3] },
  { key: '9', w: [255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,199,239,255,207,255,255,207,255,255,207,255,255,207,255,255,79,255,255,3,192,63,193,255,7,195,255,207,195,255,255,199,255,255,199,255,255,7,252,255,0,252,127,248,255,251,254,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,16,12,0,48,30,0,48,8,0,16,1,0,0,3,248,129,3,248,129,7,240,225], i: [0,64,0,0,64,0,32,0,0,24,0,0,8,8,0,0,56,64,2,120,128,3,48,128,1,48,0,0,48,0,0,248,31,0,254,119,248,207,63,248,47,0,120,56,0,0,56,0,1,56,0,0,248,3,192,255,135,192,255,135,132,1,96,8,0,16,16,0,16,0,0,4] },
  { key: '9', w: [255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,231,255,255,231,255,255,231,255,255,167,255,255,231,255,255,199,255,255,1,224,31,193,255,3,195,255,199,167,255,255,167,255,255,231,255,255,7,126,127,0,252,63,248,255,127,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,56,0,0,56,8,0,56,0,0,16,0,0,128,0,252,225,1,254,241,3,240,249], i: [0,65,0,0,65,0,16,0,0,12,0,0,4,8,0,2,60,0,1,56,64,1,56,0,0,56,128,0,56,128,0,248,31,0,255,61,252,231,31,252,63,0,56,60,0,0,60,0,0,60,128,0,252,129,192,255,67,192,255,67,194,0,32,4,0,16,8,0,8,0,0,2] },
  { key: '9', w: [255,255,255,255,255,255,255,255,255,255,255,255,255,223,255,255,231,255,255,239,255,255,207,255,253,207,255,255,143,255,255,15,254,255,7,192,31,129,239,15,194,255,207,199,255,255,223,255,253,215,255,255,3,252,127,0,252,255,252,254,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,12,0,56,14,0,48,0,0,128,1,0,128,3,252,193,7,252,225,15,240,249], i: [0,0,0,192,103,1,32,0,0,16,0,8,8,0,0,4,56,0,2,104,64,2,88,128,1,120,128,1,120,0,0,120,31,0,238,63,248,231,63,152,111,0,112,104,0,1,56,0,1,56,128,1,252,131,194,255,6,196,143,67,128,1,32,0,0,24,16,0,8,0,0,3] },
  { key: '9', w: [255,255,255,255,255,255,255,255,255,255,255,253,255,255,255,255,227,255,255,195,255,255,167,255,255,231,255,255,247,127,255,215,255,255,3,224,31,194,247,7,194,255,231,227,255,255,247,127,255,247,127,255,3,254,63,0,254,63,124,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,8,0,0,0,0,0,56,0,0,24,0,0,128,1,0,192,1,254,241,3,254,241,15,240,249], i: [0,0,0,0,99,0,48,0,0,8,0,8,8,0,0,0,28,32,2,44,0,1,40,64,1,44,128,0,44,128,0,236,159,0,239,63,252,231,31,152,47,0,120,44,128,1,60,128,1,60,128,1,254,67,192,127,71,194,143,35,132,0,16,8,0,8,0,0,8,32,0,3] },
  { key: '9', w: [255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,231,239,255,203,255,255,199,255,255,207,255,255,207,255,255,15,255,255,1,195,23,195,239,7,194,255,207,195,255,255,235,255,255,255,255,255,7,252,255,0,254,127,252,255,255,254,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,14,0,32,0,0,0,1,0,128,1,0,192,7,254,225,7,240,241], i: [0,60,0,128,129,0,64,0,0,16,0,0,8,8,0,4,56,0,2,120,0,0,56,128,1,56,0,1,56,0,0,248,63,128,207,39,248,231,63,184,47,0,208,56,0,1,56,0,1,184,0,1,252,131,192,255,135,194,14,67,132,1,32,8,0,0,0,0,16,0,0,2] },
  { key: '9', w: [255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,231,255,255,231,255,255,231,255,255,231,255,255,247,255,255,151,255,255,129,227,15,195,231,7,194,255,239,231,255,255,175,255,255,239,255,255,7,254,255,0,254,63,252,255,127,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,0,0,128,0,0,128,32,72,209,67,255,251,7,248,249], i: [0,28,0,0,65,0,64,0,0,8,0,8,4,0,16,2,28,32,0,56,64,1,40,0,0,40,128,0,40,128,0,232,159,128,239,51,252,231,31,188,55,0,88,56,128,0,56,128,0,56,128,0,252,131,193,255,67,66,135,67,132,0,32,0,0,16,0,0,12,0,0,3] },
  { key: '10', w: [255,255,255,255,255,255,255,235,255,255,195,255,255,195,255,255,128,190,255,193,254,255,195,255,127,129,254,255,120,248,63,0,252,63,0,249,127,252,254,127,124,254,63,248,254,23,224,255,31,192,255,31,1,255,255,224,249,127,225,231,63,216,191,127,252,255,255,255,255,254,254,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,3,0,129,7,0,192,14,0,240], i: [0,0,0,128,0,0,96,24,0,16,60,0,8,124,0,4,255,64,130,115,0,130,124,0,0,255,7,192,31,7,193,220,3,224,255,0,192,3,3,192,199,3,225,207,3,253,255,0,140,127,0,97,255,128,178,255,143,146,25,95,228,25,64,136,7,32,128,7,8,0,0,4] },
  { key: '10', w: [255,255,255,255,255,127,255,183,127,255,225,255,255,225,255,123,192,255,63,192,255,63,224,255,63,64,255,31,120,252,223,56,254,31,132,253,31,252,255,31,118,255,31,188,255,27,208,255,31,192,255,31,128,255,31,11,252,31,223,243,31,254,255,63,254,255,255,255,255,127,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,0,192,1,224,225,3,240,241,3,12,248], i: [0,1,0,0,1,0,16,12,0,4,30,0,4,63,16,195,55,32,192,57,0,192,30,0,128,255,1,224,207,131,32,198,131,240,127,0,224,128,0,224,225,1,120,247,1,252,127,128,228,63,128,240,127,64,216,231,71,249,140,111,240,6,32,224,3,16,192,1,12,0,0,2] },
  { key: '10', w: [255,255,255,127,255,255,255,255,255,255,199,255,255,135,255,255,192,239,255,192,255,251,195,255,254,193,252,127,120,252,63,8,253,63,128,255,63,248,254,127,188,254,31,96,255,55,224,255,63,195,255,63,129,255,127,224,247,31,243,231,63,248,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,1,0,0,1,0,0,7,128,128,15,0,224,31,128,249], i: [0,0,0,128,199,0,64,16,0,16,120,0,0,108,0,132,255,0,132,175,0,130,60,128,1,255,3,192,149,7,192,159,7,193,255,1,193,1,3,129,199,3,241,187,1,249,255,0,221,127,0,224,255,129,242,219,159,228,8,94,232,15,32,144,7,16,0,7,24,0,0,6] },
  { key: '10', w: [255,255,255,255,255,127,255,255,127,255,226,255,255,193,255,127,192,255,127,192,255,255,225,255,63,64,255,63,112,252,63,56,190,31,0,191,31,124,255,31,50,254,15,177,255,27,208,255,63,224,255,31,192,255,31,15,251,63,251,247,63,252,255,127,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,1,0,193,3,224,227,3,160,241,7,12,248], i: [0,0,0,192,41,0,48,12,0,8,60,0,4,55,0,130,127,16,192,19,32,193,62,64,128,243,129,224,138,130,96,110,131,224,251,128,224,132,128,192,193,129,124,255,128,252,127,128,230,127,128,49,255,64,169,253,71,242,140,47,244,7,16,200,3,8,128,1,4,0,0,3] },
  { key: '10', w: [255,255,255,255,255,255,255,219,255,255,69,255,223,163,255,255,128,255,255,192,255,255,195,255,255,1,252,255,120,248,63,2,252,63,232,248,63,252,254,95,220,252,47,232,255,37,160,255,63,192,255,30,129,247,255,225,255,31,254,239,63,246,255,127,254,255,255,254,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,0,128,1,0,0,1,0,0,3,0,128,7,128,224,15,128,249], i: [0,24,0,0,131,0,128,48,0,16,120,0,8,76,32,4,251,64,0,101,128,0,124,0,0,255,3,192,5,7,192,252,1,193,247,0,193,1,2,129,131,3,241,223,1,248,251,0,132,119,0,225,255,1,114,223,143,228,25,94,224,15,64,136,7,32,0,3,0,1,0,6] },
  { key: '10', w: [255,255,255,255,255,125,255,253,127,31,226,255,255,193,255,119,193,247,255,224,255,255,227,254,63,64,255,31,112,252,95,16,255,31,240,189,31,252,255,47,38,255,15,214,255,19,216,255,31,224,255,15,128,255,15,17,255,31,251,247,23,248,255,63,252,255,127,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,0,128,1,0,195,3,184,241,7,12,248], i: [0,12,0,64,1,0,32,8,0,8,20,0,4,55,16,130,61,0,193,27,0,0,31,64,0,243,129,224,138,3,96,254,130,240,123,0,224,0,0,192,225,1,252,239,0,220,125,128,226,59,128,48,255,128,209,239,79,240,4,47,242,7,16,228,7,0,128,1,8,0,0,3] },
  { key: '11', w: [255,255,255,254,255,255,254,254,254,255,15,255,255,143,255,255,24,254,255,132,255,255,128,255,255,198,255,255,134,255,127,4,255,127,195,252,127,135,255,127,135,248,127,195,231,255,231,227,255,135,231,63,240,246,239,255,243,255,255,249,239,63,184,255,127,253,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,0,128,1,0,0,193,1,0,131,31,0,7,28,192,15,28,240], i: [0,4,0,0,4,0,96,0,0,0,248,0,0,216,64,0,115,128,2,95,0,2,223,0,1,123,0,128,251,0,128,253,0,128,125,0,129,57,7,129,253,15,129,31,60,0,56,60,0,252,29,236,159,29,58,6,142,18,32,142,12,224,71,16,128,39,16,0,19,0,0,4] },
  { key: '11', w: [255,255,255,255,255,127,191,255,127,255,243,255,255,243,255,63,128,247,191,193,255,191,225,255,191,225,255,191,241,255,191,192,255,191,225,255,63,243,255,63,160,252,191,160,251,255,241,249,255,225,249,15,248,248,241,255,252,251,255,252,255,15,254,255,31,254,255,63,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,128,112,0,192,224,7,224,193,15,224,7,1,248], i: [0,0,0,0,0,0,16,0,0,8,126,0,192,46,0,192,29,0,193,22,32,192,55,0,192,30,192,64,62,0,96,126,0,96,23,128,96,142,131,96,255,135,224,15,142,64,62,10,0,127,7,246,103,199,141,3,67,9,152,35,2,240,19,4,224,25,0,192,12,0,0,3] },
  { key: '11', w: [255,255,255,254,255,255,254,255,255,255,15,255,255,15,255,255,132,238,255,132,255,255,128,255,127,142,255,255,134,255,255,2,255,127,128,255,255,205,255,127,129,243,255,71,231,255,199,243,255,7,243,183,224,243,207,251,251,255,31,252,255,191,252,255,127,253,255,255,252,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,1,0,128,65,0,0,131,0,0,7,30,128,15,28,208,31,24,240], i: [0,0,0,128,198,0,64,0,0,0,248,0,16,221,33,8,215,64,4,91,128,128,207,0,130,61,0,129,249,0,129,249,1,128,221,0,129,25,2,128,254,15,129,29,28,1,248,28,1,252,28,250,223,13,62,22,142,4,224,7,8,192,39,16,128,51,0,128,11,0,0,6] },
  { key: '11', w: [255,255,255,255,255,127,255,255,127,255,199,127,255,219,255,63,225,255,255,227,255,191,225,255,191,224,255,127,192,255,127,192,255,159,224,255,63,243,255,31,224,252,191,240,249,255,193,249,255,193,248,159,216,248,241,254,252,251,87,255,255,207,254,255,127,255,255,191,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,128,224,2,192,224,11,224,193,15,240,7,3,120], i: [0,0,0,192,33,0,48,0,0,12,62,0,70,46,8,194,25,16,193,22,32,192,35,64,192,31,64,192,62,128,224,54,128,224,23,128,96,12,129,96,255,135,64,15,142,0,62,131,0,63,7,254,111,71,159,3,99,12,248,35,2,240,17,12,224,9,8,192,4,0,128,2] },
  { key: '11', w: [255,255,255,252,255,255,254,255,255,191,141,249,95,143,255,255,12,238,255,128,255,127,128,255,123,196,255,63,134,255,255,0,253,255,134,220,255,143,239,255,7,240,127,131,227,255,237,227,239,135,247,63,224,243,199,254,251,255,223,241,239,63,248,255,255,253,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,0,128,1,0,0,1,0,0,3,1,128,7,28,240,15,24,224], i: [0,16,0,0,0,0,32,64,0,16,248,0,128,149,0,0,243,128,0,91,128,130,207,0,128,95,0,129,113,0,129,221,0,129,121,0,129,57,0,129,253,15,129,62,24,1,120,24,1,252,28,250,159,13,58,23,14,4,96,142,8,192,71,8,128,34,16,0,26,0,0,6] },
  { key: '11', w: [255,255,255,255,255,63,255,255,127,127,211,254,191,251,255,63,163,247,191,225,255,191,225,255,191,225,255,191,224,255,191,193,255,159,161,255,15,242,255,159,128,252,255,224,241,127,240,249,247,209,249,191,248,253,225,255,252,255,119,254,255,15,254,255,223,254,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,192,0,0,192,160,4,224,195,15,224,7,2,248], i: [0,6,0,192,32,0,40,16,0,4,62,0,66,37,0,192,28,0,193,54,32,192,2,64,192,22,64,224,28,128,224,54,128,96,22,128,96,14,128,96,255,135,64,15,142,0,30,138,0,126,6,254,103,69,157,11,3,0,152,33,2,240,1,4,96,9,0,192,2,0,0,1] },
  { key: '12', w: [240,255,255,254,255,255,254,255,255,254,239,255,255,63,255,255,31,254,255,3,255,255,131,255,127,31,248,255,135,241,255,134,241,127,135,249,255,134,245,255,6,254,127,7,254,255,1,255,255,3,255,255,0,128,31,198,255,159,239,255,239,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,0,3,3,129,7,3,193,31,0,240], i: [30,0,1,0,0,1,65,0,0,16,112,0,16,240,0,12,240,129,0,220,0,2,124,0,2,242,7,128,252,14,129,62,14,193,249,6,128,125,7,0,251,3,0,219,1,1,63,8,0,255,63,2,255,127,240,63,112,240,49,128,0,48,128,0,16,64,0,16,0,0,16,8] },
  { key: '12', w: [255,255,15,255,255,63,255,239,127,255,243,255,255,243,255,255,193,255,255,192,255,255,192,255,255,0,255,127,32,254,159,17,254,143,33,254,31,32,255,63,128,255,191,196,255,127,128,255,255,128,255,63,0,244,7,248,255,247,251,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,192,0,0,199,192,193,195,193,225,227,135,193,241], i: [0,32,0,0,32,0,0,0,0,4,14,4,2,60,0,1,124,0,128,23,32,128,15,0,128,252,1,32,159,3,112,207,3,112,222,1,96,239,0,96,238,0,64,123,0,192,15,192,128,255,199,192,255,95,254,15,44,125,12,32,2,12,16,4,12,8,8,4,4,0,4,0] },
  { key: '12', w: [224,255,255,252,255,255,254,239,255,254,239,255,254,255,255,255,31,255,255,135,191,255,131,255,255,13,248,255,135,249,127,71,249,127,134,249,127,2,252,255,10,254,255,0,255,255,133,255,255,133,227,127,128,192,143,228,255,127,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,0,3,0,0,7,3,193,15,128,225,30,0,240], i: [2,0,0,0,140,1,128,16,16,32,112,0,16,112,32,8,240,65,0,220,129,0,60,0,2,243,7,130,125,14,131,62,10,193,121,2,129,29,7,1,251,3,1,207,1,2,190,28,2,254,31,130,255,127,244,63,176,224,48,128,8,48,64,48,16,0,0,16,16,0,17,0] },
  { key: '12', w: [254,255,3,255,255,63,255,251,63,255,179,255,255,187,239,255,194,255,255,224,255,127,224,255,127,1,255,95,96,254,191,81,254,159,81,254,31,32,255,63,192,255,63,132,255,127,128,254,127,0,252,95,0,246,3,252,251,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,192,0,0,195,192,193,195,195,225,225,7,193,253], i: [0,0,0,0,113,0,24,4,0,4,12,4,4,12,8,0,124,16,129,55,32,128,15,0,192,254,65,160,223,65,160,143,131,112,222,129,96,207,128,64,254,128,192,123,128,192,143,67,192,255,71,224,255,79,252,15,46,57,12,32,2,12,24,12,4,0,8,4,0,0,4,0] },
  { key: '12', w: [224,255,255,252,255,247,254,207,255,254,107,247,255,60,239,255,14,254,127,131,255,255,134,255,255,15,248,255,131,249,127,130,249,127,134,249,127,6,237,255,134,254,255,0,255,255,129,255,127,6,192,255,128,224,63,194,239,255,239,255,255,255,255,255,255,255,255,239,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,0,3,0,0,3,0,132,15,1,193,31,0,240], i: [0,32,0,0,132,1,0,48,20,0,112,32,16,112,0,8,240,65,4,156,1,0,124,0,2,242,7,130,88,14,129,127,14,193,121,2,129,93,7,1,121,3,1,223,3,0,62,0,2,248,127,130,255,127,240,63,56,224,48,128,8,48,64,16,48,0,0,16,0,0,0,4] },
  { key: '12', w: [255,255,3,255,255,31,255,251,127,223,209,255,127,242,255,255,193,251,255,192,255,191,224,253,127,1,255,255,32,254,31,112,252,159,161,252,31,32,255,31,128,255,63,196,255,63,192,255,239,1,248,127,0,246,135,248,251,255,253,255,255,253,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,0,192,0,0,196,128,128,227,193,193,225,3,192,253], i: [0,0,0,0,0,0,8,14,0,4,14,0,0,30,0,0,52,32,0,35,0,128,15,0,192,252,1,0,215,67,224,223,2,112,223,129,96,207,128,96,238,128,192,123,128,192,15,64,0,254,79,192,255,91,252,15,44,25,14,32,0,6,16,0,6,8,4,4,0,0,0,0] },
  { key: '13', w: [255,231,255,255,255,255,255,255,255,125,63,255,255,252,254,63,30,255,31,43,240,31,159,247,159,159,243,127,31,242,223,135,253,15,4,253,143,0,254,199,119,254,15,255,255,31,251,255,159,251,239,255,243,239,255,7,192,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,2,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,12,0,0,8,0,128,195,3,128,195,39,0,3,255,193,15,255,241,30,0,248], i: [0,0,0,16,0,0,16,96,16,12,192,32,130,99,65,242,35,7,97,152,143,64,24,28,65,128,4,96,240,15,176,121,6,176,123,7,56,185,1,248,9,1,252,13,1,101,12,48,48,12,176,32,12,184,2,248,47,4,224,15,8,0,0,16,0,24,0,0,1,0,96,1] },
  { key: '13', w: [255,255,255,255,255,255,255,255,255,183,159,255,127,30,255,31,30,255,159,13,248,143,247,251,223,255,251,63,15,251,143,3,252,15,7,254,99,7,254,35,123,255,9,255,255,143,255,255,206,255,255,254,251,231,255,7,224,255,255,255,255,255,255,255,255,255,255,255,255,254,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,24,0,0,0,4,0,0,8,0,128,193,0,128,225,4,128,1,255,199,7,254,241,14,0,252], i: [0,0,0,8,0,0,8,32,0,6,96,0,192,225,32,241,49,3,48,216,199,96,12,14,112,72,142,48,248,6,208,189,3,216,125,3,184,220,3,188,157,0,246,133,0,50,4,128,48,4,24,17,12,220,2,252,95,0,240,7,4,0,16,0,0,8,0,0,7,0,112,1] },
  { key: '13', w: [255,255,255,255,127,255,255,255,251,255,191,255,255,253,253,63,31,254,63,15,251,63,143,243,255,159,243,255,15,242,223,135,253,15,8,253,71,2,252,71,247,254,31,249,255,31,249,255,159,255,239,255,255,231,255,143,230,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,16,0,0,0,8,0,0,5,0,0,131,2,128,67,247,129,3,255,225,31,254,240,126,0,252], i: [192,129,1,32,0,0,24,96,16,12,224,32,132,99,65,226,231,2,96,177,143,65,120,12,65,224,5,1,240,5,33,57,7,240,255,6,48,171,3,233,9,1,231,13,0,103,12,16,33,12,144,2,60,188,0,248,63,8,128,7,16,0,16,0,0,8,0,0,3,0,242,0] },
  { key: '13', w: [255,255,255,255,255,255,255,255,255,223,223,255,255,95,255,31,11,253,31,149,249,159,215,251,255,255,249,255,143,249,247,5,252,7,2,252,7,7,254,67,123,255,21,255,255,151,255,255,254,251,255,255,255,243,255,15,224,255,255,251,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,56,0,0,56,0,0,0,24,0,0,8,0,128,65,0,128,65,204,199,1,255,247,7,255,249,63,0,124], i: [224,64,0,16,0,0,8,48,0,4,96,0,194,225,32,240,179,67,33,216,7,96,40,142,32,120,130,32,248,130,208,189,129,216,189,3,188,228,1,180,212,128,242,5,128,178,5,136,17,4,152,1,28,92,2,248,31,4,224,7,8,0,8,16,0,4,0,0,3,0,249,0] },
  { key: '13', w: [255,195,255,255,255,254,255,255,251,255,191,253,127,44,254,31,95,255,31,43,249,63,151,243,191,159,243,255,143,227,223,135,253,15,12,252,199,2,252,71,115,254,3,255,255,159,255,255,159,239,239,255,247,231,255,7,192,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,128,4,0,0,7,0,128,3,37,128,3,151,241,15,252,240,63,0,252], i: [0,0,0,32,0,0,0,96,0,0,192,1,128,99,192,242,34,7,96,184,15,193,88,28,64,224,12,32,240,5,32,105,2,184,123,3,184,201,1,248,137,1,244,13,0,117,12,0,33,12,176,2,28,56,0,248,47,0,240,19,0,0,16,0,0,8,0,0,6,0,0,1] },
  { key: '13', w: [255,227,255,255,127,255,223,247,253,143,223,255,127,150,239,15,11,255,31,5,249,159,247,249,95,255,249,127,79,253,255,131,244,7,7,246,103,3,254,99,123,255,5,255,255,143,255,255,254,255,255,255,243,231,255,67,224,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,24,0,0,0,0,0,0,0,0,128,1,0,128,65,8,198,1,234,231,7,254,241,31,0,252], i: [32,0,0,16,0,0,8,0,0,6,224,0,192,161,0,241,17,67,49,216,7,32,40,142,32,96,130,32,248,2,144,12,1,216,189,3,152,228,0,156,148,0,242,6,128,50,7,144,17,6,152,1,14,92,0,252,23,2,248,11,8,0,16,0,0,4,0,0,2,0,136,0] },
  { key: '14', w: [254,255,255,255,191,255,255,239,247,255,199,255,255,3,254,255,0,255,63,62,255,255,59,253,127,60,254,255,36,252,127,0,254,127,3,251,127,135,255,127,3,224,63,198,255,159,231,255,231,239,255,255,239,255,255,239,255,255,239,255,255,239,255,255,255,255,255,255,127,255,255,191], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,24,0,0,12,195,0,1,3,198,193,7,199,193,15,0,112,62,0,184], i: [0,56,0,16,248,0,0,112,32,0,248,65,2,254,131,225,255,128,225,207,128,1,196,0,0,198,1,0,255,3,128,191,3,128,252,1,128,120,0,0,254,63,225,223,63,248,27,128,29,24,128,2,24,64,2,24,64,12,24,32,0,24,24,0,16,12,0,0,3,0,64,0] },
  { key: '14', w: [255,199,255,255,239,253,255,239,255,255,231,255,255,1,254,63,128,255,63,32,255,255,92,255,127,4,254,255,0,252,127,0,254,127,3,254,127,7,255,63,3,224,63,198,255,159,231,255,245,239,255,255,239,255,255,239,255,255,239,255,255,255,255,255,255,255,255,255,191,255,255,191], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,0,0,12,0,0,14,97,0,6,195,194,192,7,198,224,15,0,176,62,0,60], i: [96,56,0,8,120,0,4,112,0,2,252,65,0,255,67,224,119,0,224,199,0,0,196,128,0,218,3,0,239,3,128,191,2,192,252,1,128,120,0,0,254,63,224,255,191,249,25,128,28,24,128,2,24,64,2,24,64,4,24,48,0,24,8,0,24,12,0,0,129,0,0,0] },
  { key: '14', w: [255,135,255,255,191,253,255,239,255,255,207,255,255,1,254,63,192,255,63,222,253,255,118,252,127,60,254,255,24,254,255,0,254,127,1,252,255,135,253,63,3,224,63,226,255,159,231,255,247,247,255,251,239,255,255,239,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,14,192,1,15,195,1,240,131,225,224,7,0,240,63,0,254], i: [0,56,0,24,112,0,4,120,0,4,248,1,3,254,67,224,119,128,224,135,129,0,134,1,0,255,3,0,239,3,128,191,3,192,252,0,128,120,0,0,254,63,224,255,63,248,57,128,25,56,128,0,56,64,0,24,64,4,16,32,0,16,16,0,16,0,0,0,1,0,64,64] },
  { key: '14', w: [255,207,255,255,247,253,255,239,255,255,199,255,255,1,254,31,192,255,31,192,255,255,181,255,255,191,255,255,20,254,127,0,254,127,131,253,255,134,255,63,1,224,63,227,255,159,247,255,243,247,255,255,247,255,255,247,255,255,247,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,14,192,128,31,195,129,255,3,192,225,7,0,240,63,0,254], i: [0,60,0,24,120,0,4,120,16,0,248,33,3,255,1,224,63,128,224,79,128,0,198,0,0,203,1,0,239,3,192,183,1,192,252,0,0,124,0,0,254,31,224,255,31,252,25,128,29,24,128,0,24,64,2,24,96,4,24,32,0,24,24,0,16,12,0,128,1,0,64,0] },
  { key: '14', w: [255,199,255,255,79,253,255,231,255,255,199,255,255,1,254,63,128,255,63,156,255,255,25,255,191,20,254,191,12,252,127,0,254,255,129,255,255,131,255,191,1,224,127,226,254,143,231,255,247,239,255,255,239,255,255,239,255,255,239,255,255,255,255,255,255,255,254,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,28,192,0,207,199,129,227,7,192,225,6,0,224,63,0,255], i: [96,28,0,8,120,0,4,56,0,2,252,1,0,239,67,225,119,0,224,195,0,0,196,128,0,234,1,0,239,3,128,191,3,192,252,1,64,124,0,0,254,31,224,255,63,248,25,128,29,24,192,1,24,64,2,24,32,4,24,48,0,24,24,0,24,4,0,0,3,0,0,0] },
  { key: '14', w: [254,223,255,255,239,255,255,239,251,255,207,247,255,7,253,255,1,254,191,37,190,255,59,253,255,28,253,255,28,252,255,0,254,127,1,251,127,135,255,127,7,232,127,198,248,31,231,255,231,239,255,255,239,255,255,231,255,255,239,255,255,239,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,1,0,0,131,0,193,3,194,193,15,199,225,31,128,248,62,24,252], i: [64,56,0,16,120,0,24,112,0,4,112,1,0,254,67,66,230,129,193,207,128,129,197,0,1,214,0,0,246,3,0,255,7,128,223,1,128,56,0,1,255,31,193,255,63,249,51,144,56,56,128,2,56,64,4,56,32,0,16,16,8,16,16,0,16,4,0,128,1,0,36,0] },
  { key: '14', w: [254,199,255,255,167,255,255,231,255,255,239,247,255,1,254,191,1,255,191,64,255,63,124,254,255,44,252,255,16,252,127,1,254,127,1,254,255,134,255,127,7,232,127,196,248,223,199,255,247,239,255,255,239,255,255,239,255,255,239,255,255,239,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,67,64,128,195,196,128,7,228,224,31,128,248,62,0,127], i: [64,56,0,16,120,0,0,120,0,4,120,33,2,254,67,192,103,1,225,143,128,193,193,129,1,212,1,0,239,3,128,255,2,128,223,1,0,56,0,128,255,63,192,255,191,249,25,144,121,56,128,2,24,64,4,24,32,8,24,16,0,24,24,0,16,4,0,128,1,0,36,0] },
  { key: '14', w: [255,135,255,255,183,255,255,191,255,255,207,247,255,1,254,63,0,255,126,100,255,255,63,255,255,188,255,62,48,254,254,16,254,126,3,255,254,135,255,191,1,236,63,192,252,63,231,255,247,239,255,255,207,255,255,239,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,0,138,195,1,254,195,1,255,7,243,241,15,0,248,127,0,127], i: [96,56,0,16,120,0,8,120,0,4,248,0,2,255,65,66,247,65,225,159,128,192,211,128,0,218,128,0,239,129,0,255,3,128,223,0,128,60,0,0,255,159,192,255,191,249,57,144,121,40,0,2,56,64,4,56,32,8,24,16,0,24,16,0,24,4,64,128,0,1,32,64] },
  { key: '14', w: [255,255,255,255,191,255,255,255,255,255,239,183,255,3,255,175,0,255,159,192,254,63,5,254,255,45,255,255,84,252,127,1,254,255,2,254,255,134,255,255,2,232,127,98,233,31,231,255,247,239,255,255,231,255,255,231,255,255,231,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,195,0,252,199,128,253,7,192,240,31,0,248,127,0,127], i: [96,56,0,24,120,0,8,112,0,4,24,1,2,255,35,64,255,64,225,71,128,192,209,128,0,210,0,0,235,3,128,255,2,128,221,1,0,56,0,128,255,31,128,255,63,249,25,144,57,56,128,2,24,64,0,24,32,0,24,16,8,24,0,0,16,4,0,129,1,0,44,0] },
  { key: '14', w: [255,239,255,255,199,255,255,255,255,255,231,255,255,3,238,191,0,255,63,28,255,255,44,255,127,60,255,255,24,254,127,1,254,255,3,252,255,198,255,127,2,232,127,226,248,143,231,255,247,239,255,251,239,255,255,239,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,142,71,1,231,207,3,227,7,226,224,31,128,240,63,0,127], i: [96,56,0,16,120,0,8,120,0,4,56,0,2,255,3,97,183,65,225,207,128,192,214,0,0,218,128,0,235,129,192,255,3,192,223,0,0,28,0,0,255,159,192,255,191,249,25,144,121,24,0,2,24,64,6,24,32,12,24,16,8,24,24,0,24,4,0,192,1,0,36,128] }
];

function unpack() {
  var N = PW * PW;
  var names = ['w', 'r', 'i'];
  var out = {};
  for (var n = 0; n < ITEMS.length; n++) {
    var it = ITEMS[n];
    var ch = {};
    for (var ci = 0; ci < 3; ci++) {
      var arr = new Float32Array(N);
      var src = it[names[ci]];
      for (var b = 0; b < N / 8; b++) {
        var v = src[b];
        for (var j = 0; j < 8; j++) arr[b * 8 + j] = (v >> j) & 1 ? 1 : 0;
      }
      ch[names[ci]] = arr;
    }
    if (!out[it.key]) out[it.key] = [];
    out[it.key].push({ w: ch.w, r: ch.r, i: ch.i });
  }
  return out;
}

module.exports = { PW: PW, ITEMS: ITEMS, unpack: unpack };

};

/* ---- vision/recognizer ---- */
__modules["vision/recognizer"] = function (module, exports, require) {
'use strict';
/*
 * 棋盘视觉识别核心 —— 纯 JS，无依赖，可在 Node / JavaScriptCore / 浏览器复用
 *
 * 核心思路（关键设计）：
 *   不识别「这是车还是马」。只做三分类：空 / 红子 / 黑子。
 *   兵种身份全部由「上一局面 + 合法走法枚举」反推（见 tracker.js）。
 *   这样识别只需 3 个稳定特征，抗皮肤、抗缩放、抗压缩噪声。
 *
 * 坐标约定：
 *   交叉点 = row*9 + col，row 0 = 屏幕最上（黑方底线），col 0 = 屏幕最左
 *   四点标定顺序：[左上, 右上, 右下, 左下]
 */

/** 字形采样网格边长。
 *  16×16 对中文棋子太粗：車/馬/炮/仕 的笔画会糊在一起，
 *  实测会出现「车认成炮、炮认成车」这种纯字形混淆。
 *  提到 24×24（576 个采样点）后笔画结构能分辨出来。 */
const PATCH_W = 24;

const EMPTY = 0;
const RED_PC = 1;
const BLK_PC = 2;

/** 三线性透视变换：由四角求任意 (u,v) 的图像坐标 */
function bilinear(p00, p10, p11, p01, u, v) {
  const a = (1 - u) * (1 - v), b = u * (1 - v), c = u * v, d = (1 - u) * v;
  return [
    a * p00[0] + b * p10[0] + c * p11[0] + d * p01[0],
    a * p00[1] + b * p10[1] + c * p11[1] + d * p01[1]
  ];
}

/** 透视变换：4 点求单应矩阵（比双线性更准，用于大倾角） */
function homography(src, dst) {
  // src/dst: [[x,y] x4]。解 8x8 线性方程组
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  // 高斯消元
  const n = 8;
  const M = A.map((row, i) => row.concat([B[i]]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    const div = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map(row => row[n]);
}

function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + 1;
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

/**
 * 抛物线插值细化峰值位置（亚像素精度）
 * 峰值 i 与左右两点做二次拟合，顶点偏移量就是亚像素修正量
 */
function refinePeak(profile, i) {
  if (i <= 0 || i >= profile.length - 1) return i;
  const a = profile[i - 1], b = profile[i], c = profile[i + 1];
  const denom = a - 2 * b + c;
  if (Math.abs(denom) < 1e-6) return i;
  let delta = 0.5 * (a - c) / denom;
  if (delta > 0.5) delta = 0.5;
  if (delta < -0.5) delta = -0.5;
  return i + delta;
}

/**
 * 一组等间距峰的查找
 * 棋盘 9 竖 10 横，线条严格等距 —— 用「等距约束」筛峰，比单纯找极值可靠得多
 */
function findEvenlySpacedPeaks(profile, count, minGap) {
  const n = profile.length;
  if (n < count * 3) return null;

  let maxV = 0;
  for (let i = 0; i < n; i++) if (profile[i] > maxV) maxV = profile[i];
  if (maxV <= 0) return null;

  // 1) 找局部极大值，做非极大值抑制
  const peaks = [];
  const th = maxV * 0.22;
  for (let i = 2; i < n - 2; i++) {
    const v = profile[i];
    if (v < th) continue;
    if (v < profile[i - 1] || v < profile[i + 1]) continue;
    if (peaks.length && i - peaks[peaks.length - 1] < minGap) {
      if (v > profile[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i;
    } else {
      peaks.push(i);
    }
  }
  if (peaks.length < count) return null;

  // 2) 在峰里找一组「等距」的位置
  let best = null, bestScore = -1;
  for (let s = 0; s < peaks.length; s++) {
    for (let e = s + count - 1; e < peaks.length; e++) {
      const span = peaks[e] - peaks[s];
      const d = span / (count - 1);
      if (d < minGap) continue;
      if (s + count - 1 > peaks.length) break;

      let score = 0, ok = true;
      const pos = [];
      for (let k = 0; k < count; k++) {
        const target = peaks[s] + d * k;
        let nearest = -1, nd = 1e9;
        for (let p = 0; p < peaks.length; p++) {
          const dd = Math.abs(peaks[p] - target);
          if (dd < nd) { nd = dd; nearest = peaks[p]; }
        }
        if (nearest < 0 || nd > d * 0.22) { ok = false; break; }
        score += profile[nearest];
        pos.push(nearest);
      }
      if (ok && score > bestScore) { bestScore = score; best = pos; }
    }
  }
  return best;
}

/**
 * 自动检测棋盘四角
 *
 * 原理：中国象棋棋盘是严格等间距的 9 竖 10 横网格。
 *   1. 转灰度
 *   2. 沿 x 求「垂直边缘强度」投影 → 竖线会形成 9 个尖峰
 *   3. 沿 y 求「水平边缘强度」投影 → 横线会形成 10 个尖峰
 *   4. 用等距约束从尖峰里挑出真正的 9+10 条线
 *   5. 最外四条线的交点就是四角
 *
 * 全程不需要任何颜色先验，也不怕棋子和高亮圈（它们只贡献零散噪声，
 * 构不成等距序列）。
 *
 * @returns {[[number,number],[number,number],[number,number],[number,number]]|null}
 *          顺序：左上 右上 右下 左下（图像像素坐标）
 */
/* ============================================================
 *  网格自校准（refineGrid）
 *
 *  不管初始四点有多歪，棋子一定落在交叉点上。
 *  做法：
 *    1. 用当前网格算出 90 个格点
 *    2. 每个格点在邻域内搜索「暖色最浓」的位置 → 这个棋子的真实中心
 *    3. 用这些真实中心，最小二乘反解网格参数（x = a+bu+cv+duv，y 同理）
 *    4. 迭代几次收敛
 *
 *  这能抹平自动检测 10~20% 的格距误差，也能吃掉手点四角时的几像素偏差。
 * ============================================================ */

/** 小区域的暖色占比（判断这里是不是棋子盘面） */
function localWarm(pixels, w, h, cx, cy, radius) {
  let n = 0, warm = 0;
  const step = Math.max(1, Math.floor(radius / 3));
  for (let dy = -radius; dy <= radius; dy += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      const x = Math.round(cx + dx), y = Math.round(cy + dy);
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      const i = (y * w + x) * 4;
      const R = pixels[i], G = pixels[i + 1], B = pixels[i + 2];
      // 跳过白色高亮圈和绿色
      if (R > 200 && G > 200 && B > 200) continue;
      if (G > R + 30 && G > B + 30 && G > 90) continue;
      n++;
      if ((R - B) > 22 && R > 80) warm++;
    }
  }
  return n > 0 ? warm / n : 0;
}

/** 解 4x4 线性方程组（列主元高斯消元） */
function solve4(A, b) {
  const n = 4;
  const M = [];
  for (let i = 0; i < n; i++) M.push(A[i].concat([b[i]]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-9) return null;
    const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
    const d = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return [M[0][n], M[1][n], M[2][n], M[3][n]];
}

/** 用一组 (u,v)->(x,y) 样本拟合双线性网格系数 */
function fitAxis(samples, useX) {
  const ATA = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const ATb = [0, 0, 0, 0];
  for (let k = 0; k < samples.length; k++) {
    const p = samples[k];
    const row = [1, p.u, p.v, p.u * p.v];
    const val = useX ? p.x : p.y;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) ATA[i][j] += row[i] * row[j];
      ATb[i] += row[i] * val;
    }
  }
  return solve4(ATA, ATb);
}

/**
 * 网格自校准
 * @param {Uint8ClampedArray} pixels RGBA
 * @param {number} w
 * @param {number} h
 * @param {Array<[number,number]>} corners 初始四角 [左上,右上,右下,左下]
 * @param {number} iterations 迭代次数（默认 3）
 * @returns {Array<[number,number]>} 校准后的四角
 */
function refineGrid(pixels, w, h, corners, iterations) {
  const iters = iterations || 3;
  let cur = corners.map(p => [p[0], p[1]]);

  for (let iter = 0; iter < iters; iter++) {
    const [p00, p10, p11, p01] = cur;
    // 格子尺寸（用两个方向分别估）
    const cellW = Math.hypot(p10[0] - p00[0], p10[1] - p00[1]) / 8;
    const cellH = Math.hypot(p01[0] - p00[0], p01[1] - p00[1]) / 9;
    const cell = Math.min(cellW, cellH);
    if (cell < 6) break;

    // 搜索半径：格子的 35%，足够覆盖累积偏移
    const searchR = Math.max(3, Math.round(cell * 0.35));
    // 局部暖色采样半径：棋子盘面的一半
    const localR = Math.max(2, Math.round(cell * 0.18));

    const samples = [];

    for (let r = 0; r < 10; r++) {
      const v = r / 9;
      for (let c = 0; c < 9; c++) {
        const u = c / 8;
        // 当前网格给出的格点
        const a = (1 - u) * (1 - v), b = u * (1 - v), cc = u * v, d = (1 - u) * v;
        const x0 = a * p00[0] + b * p10[0] + cc * p11[0] + d * p01[0];
        const y0 = a * p00[1] + b * p10[1] + cc * p11[1] + d * p01[1];

        // 在邻域内找暖色最浓的位置
        let bestX = x0, bestY = y0, bestWarm = -1;
        for (let dy = -searchR; dy <= searchR; dy += 2) {
          for (let dx = -searchR; dx <= searchR; dx += 2) {
            const x = x0 + dx, y = y0 + dy;
            if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) continue;
            const warm = localWarm(pixels, w, h, x, y, localR);
            if (warm > bestWarm) { bestWarm = warm; bestX = x; bestY = y; }
          }
        }

        // 只有明显是棋子盘面才作为拟合样本（空格不参与）
        if (bestWarm >= 0.45) {
          samples.push({ x: bestX, y: bestY, u: u, v: v });
        }
      }
    }

    // 样本太少说明画面不是对局中，别乱拟合
    if (samples.length < 6) break;

    const cx = fitAxis(samples, true);
    const cy = fitAxis(samples, false);
    if (!cx || !cy) break;

    function evalX(u, v) { return cx[0] + cx[1] * u + cx[2] * v + cx[3] * u * v; }
    function evalY(u, v) { return cy[0] + cy[1] * u + cy[2] * v + cy[3] * u * v; }

    const next = [
      [evalX(0, 0), evalY(0, 0)],
      [evalX(1, 0), evalY(1, 0)],
      [evalX(1, 1), evalY(1, 1)],
      [evalX(0, 1), evalY(0, 1)]
    ];

    // 收敛判定：四角移动小于 0.5 像素就停
    let moveSum = 0;
    for (let i = 0; i < 4; i++) {
      moveSum += Math.abs(next[i][0] - cur[i][0]) + Math.abs(next[i][1] - cur[i][1]);
    }
    cur = next;
    if (moveSum < 2.0) break;   // 四角总共移动 < 2 像素
  }

  return cur;
}
/**
 * 一维等间距拟合：给一堆「应该落在 count 条等距线上」的坐标，
 * 反解出 origin 与 step。
 *
 * 用「分配 → 最小二乘 → 再分配」的迭代，对缺失线（某列/某行没棋子）免疫。
 *
 * @param {number[]} vals 观测坐标
 * @param {number} count 线数
 * @param {number} stepHint 初始格距估计
 * @param {number} tolRatio 允许的残差（相对格距），超出的观测点丢弃
 * @returns {{origin:number, step:number, used:number}|null}
 */
function fitEvenLines(vals, count, stepHint, tolRatio) {
  if (!vals || vals.length < 3 || !(count >= 2)) return null;
  const tol = (tolRatio || 0.42) * stepHint;
  const sorted = vals.slice().sort((a, b) => a - b);

  // 两个候选初值：端点撑满 / 中位间隔
  const seeds = [];
  seeds.push({ origin: sorted[0], step: (sorted[sorted.length - 1] - sorted[0]) / (count - 1) });
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  gaps.sort((a, b) => a - b);
  const medGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : stepHint;
  seeds.push({ origin: sorted[0] - Math.round(((sorted[0] - sorted[0]) / medGap)) * medGap, step: medGap });

  let best = null;

  for (let s = 0; s < seeds.length; s++) {
    let origin = seeds[s].origin;
    let step = seeds[s].step;
    if (!(step > 2)) continue;
    let used = 0;

    for (let it = 0; it < 14; it++) {
      const buckets = [];
      for (let k = 0; k < count; k++) buckets.push([]);
      for (let i = 0; i < sorted.length; i++) {
        const v = sorted[i];
        const k = Math.round((v - origin) / step);
        if (k < 0 || k >= count) continue;
        if (Math.abs(v - (origin + k * step)) > tol) continue;
        buckets[k].push(v);
      }
      // 最小二乘：每个有观测的 k 取均值，再拟合 v = origin + step*k
      let Sk = 0, Sk2 = 0, Sv = 0, Skv = 0, N = 0;
      for (let k = 0; k < count; k++) {
        const b = buckets[k];
        if (!b.length) continue;
        let sum = 0;
        for (let i = 0; i < b.length; i++) sum += b[i];
        const m = sum / b.length;
        Sk += k; Sk2 += k * k; Sv += m; Skv += k * m; N++;
      }
      if (N < 3) break;
      const den = N * Sk2 - Sk * Sk;
      if (Math.abs(den) < 1e-9) break;
      const nb = (N * Skv - Sk * Sv) / den;
      const na = (Sv - nb * Sk) / N;
      if (!isFinite(nb) || !isFinite(na) || Math.abs(nb) < 2) break;
      const moved = Math.abs(nb - step) + Math.abs(na - origin);
      origin = na; step = nb; used = N;
      if (moved < 0.05) break;
    }

    if (used < 3 || !(step > 2)) continue;
    // 残差 + 两端覆盖检查
    let res = 0, cnt = 0, hasLow = false, hasHigh = false;
    for (let i = 0; i < sorted.length; i++) {
      const v = sorted[i];
      const k = Math.round((v - origin) / step);
      if (k < 0 || k >= count) continue;
      const d = Math.abs(v - (origin + k * step));
      if (d > tol) continue;
      if (k === 0) hasLow = true;
      if (k === count - 1) hasHigh = true;
      res += d; cnt++;
    }
    if (cnt < 3) continue;
    // 首尾两条线必须都有观测点 —— 否则说明 count/step 配错了，
    // 典型症状是把半幅画面当成整块棋盘（实测纵轴拟合到 81px/格）。
    if (!hasLow || !hasHigh) continue;
    const score = res / cnt - used * 0.01;
    if (!best || score < best.score) {
      best = { origin: origin, step: step, used: used, score: score, residual: res / cnt };
    }
  }

  return best;
}

/**
 * 一维峰值提取（带平滑与合并）
 */
function findPeaks1D(proj, len, minGap, relTh) {
  const sm = new Float32Array(len);
  for (let i = 1; i < len - 1; i++) sm[i] = (proj[i - 1] + proj[i] * 2 + proj[i + 1]) * 0.25;
  let maxv = 0;
  for (let i = 0; i < len; i++) if (sm[i] > maxv) maxv = sm[i];
  if (!(maxv > 0)) return [];
  const th = maxv * (relTh || 0.15);
  const raw = [];
  for (let i = 1; i < len - 1; i++) {
    if (sm[i] < th) continue;
    if (sm[i] < sm[i - 1] || sm[i] < sm[i + 1]) continue;
    // 峰值附近质心细化
    let s = 0, sw = 0;
    const R = 4;
    for (let d = -R; d <= R; d++) {
      const j = i + d;
      if (j < 1 || j >= len - 1) continue;
      s += j * sm[j]; sw += sm[j];
    }
    raw.push(sw > 0 ? s / sw : i);
  }
  const merged = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (merged.length && p - merged[merged.length - 1] < minGap) {
      merged[merged.length - 1] = (merged[merged.length - 1] + p) * 0.5;
    } else merged.push(p);
  }
  return merged;
}

/**
 * ★ 用真实棋子反推网格（最可靠的一招）
 *
 * 原理：棋子只可能落在交叉点上。所以把「棋子盘面」像素分别投到 x 轴和 y 轴，
 * 得到 9 条竖线 / 10 条横线上的一簇峰值；对这些峰值做等间距最小二乘，
 * 就得到 格距 和 起点 —— 边缘投影那 10~20% 的误差被彻底抹平。
 *
 * 这一步解决的是「初始格距偏小 → 越往下越偏 → 第 7 行偏 69 像素 → 炮被判空」的根因。
 *
 * @param {Uint8ClampedArray} pixels RGBA
 * @param {number} w
 * @param {number} h
 * @param {Array<[number,number]>} corners 当前四角（仅作为搜索区域）
 * @returns {Array<[number,number]>|null} 修正后的四角，失败返回 null
 */
/* ============================================================
 * ★ 棋盘定位：归一化先验 + 全格对齐搜索
 *
 * 不再依赖「边缘投影 + 等距拟合」。原因：
 *   棋盘线是浅色细线，边缘强度弱；而 JJ象棋 的界面是木纹棕色，
 *   暖色干扰极多，投影峰值里既有棋子也有 UI 木块，
 *   等距拟合经常「少认几行」，格高实测从 61.9 跑到 81.0（偏 31%）。
 *   这种误差逐行累积，到第 7 行采样点已经偏了整整一格，炮就被判成空。
 *
 * 现在的做法：
 *   1. 棋子圆盘（米黄/浅褐）是最好认的东西 —— R−B>45 且够亮。
 *   2. 棋子只可能落在交叉点上。所以直接在 (起点, 格距) 上做搜索，
 *      打分 = 90 个交叉点的「圆盘密度之和」，命中数越高越对。
 *   3. 搜索起点用归一化先验（JJ象棋 布局是死的），
 *      四张真实截图反解出来的结果完全一致：
 *         x0/W = 0.0666   cw/W = 0.1078
 *         y0/H = 0.2773   ch/H = 0.0484
 *      开局命中数恰好 32 = 棋盘上的棋子数，中局 30 = 少了两个子。
 *
 * 这一步之后格距误差 < 1 像素，采样子弹不再打偏。
 * ============================================================ */

/** JJ象棋 棋盘在整屏截图中的归一化位置
 *  由「棋子圆盘全格对齐搜索」在多张真实截图上反解，再用逐格真值验证
 *  （450 格只错 1 格），是所有样本共同收敛到的同一组值。
 *  用它当定位起点：命中数够就直接采用，避免被遮挡物带偏。 */
const BOARD_PRIOR = {
  x0: 0.065731,
  cw: 0.108391,
  y0: 0.277100,
  ch: 0.048350
};

/** 棋子圆盘掩码 + 积分图（用来 O(1) 求任意方框内的圆盘密度） */
function buildDiskIntegral(pixels, w, h) {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let x = 0; x < w; x++) {
      const i = (base + x) * 4;
      const R = pixels[i], G = pixels[i + 1], B = pixels[i + 2];
      if (R - B <= 45 || R <= 170) continue;
      const L = 0.299 * R + 0.587 * G + 0.114 * B;
      if (L <= 150) continue;
      mask[base + x] = 1;
    }
  }
  const iw = w + 1;
  const integ = new Int32Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    const base = y * w;
    for (let x = 0; x < w; x++) {
      rs += mask[base + x];
      integ[(y + 1) * iw + x + 1] = integ[y * iw + x + 1] + rs;
    }
  }
  return { integ: integ, iw: iw, count: (function () { let n = 0; for (let i = 0; i < mask.length; i++) n += mask[i]; return n; })() };
}

/**
 * 找出「画中画浮窗棋盘」占据的矩形
 *
 * 抓屏会把画中画窗口一起抓进去（实测浮窗压住棋盘右上角时，
 * 那几个交叉点的暖色占比是 100%、墨迹 0% —— 那是浮窗里自己画的米黄棋盘）。
 * 浮窗棋盘底色实测 (227,203,161) L=205，比游戏棋盘空白（L≈170）
 * 和棋子盘面（L≈120~191）都亮得多，用亮度就能整块切出来。
 *
 * @returns {{x0,y0,x1,y1}|null}
 */
function findPipRect(pixels, w, h) {
  // 先按 16x16 分块统计「浮窗米黄」占比。
  // 直接用所有命中像素求外接矩形会被画面里零散的高光点撑满整屏（实测过），
  // 所以必须先分块、再挑最大的连通块。
  const BS = 16;
  const bw = Math.ceil(w / BS), bh = Math.ceil(h / BS);
  const ratio = new Float32Array(bw * bh);
  const total = new Int32Array(bw * bh);
  const hit = new Int32Array(bw * bh);

  for (let y = 0; y < h; y++) {
    const by = (y / BS) | 0;
    const base = y * w;
    for (let x = 0; x < w; x++) {
      const bi = by * bw + ((x / BS) | 0);
      total[bi]++;
      const i = (base + x) * 4;
      const R = pixels[i], G = pixels[i + 1], B = pixels[i + 2];
      if (R <= 205 || G <= 180 || B <= 135) continue;
      if ((R - B) <= 45) continue;
      const L = 0.299 * R + 0.587 * G + 0.114 * B;
      if (L <= 198) continue;
      hit[bi]++;
    }
  }
  for (let i = 0; i < ratio.length; i++) ratio[i] = total[i] ? hit[i] / total[i] : 0;

  // 连通块标记（4 邻域）
  const lab = new Int32Array(bw * bh).fill(-1);
  const stack = new Int32Array(bw * bh);
  let bestBox = null, bestArea = 0;

  for (let s = 0; s < ratio.length; s++) {
    if (ratio[s] < 0.60 || lab[s] >= 0) continue;
    let sp = 0;
    stack[sp++] = s;
    lab[s] = s;
    let n = 0, mnx = bw, mxx = -1, mny = bh, mxy = -1;
    while (sp > 0) {
      const p = stack[--sp];
      const py = (p / bw) | 0, px = p % bw;
      n++;
      if (px < mnx) mnx = px;
      if (px > mxx) mxx = px;
      if (py < mny) mny = py;
      if (py > mxy) mxy = py;
      for (let k = 0; k < 4; k++) {
        let q;
        if (k === 0) { if (px === 0) continue; q = p - 1; }
        else if (k === 1) { if (px === bw - 1) continue; q = p + 1; }
        else if (k === 2) q = p - bw;
        else q = p + bw;
        if (q < 0 || q >= ratio.length || lab[q] >= 0) continue;
        if (ratio[q] < 0.60) continue;
        lab[q] = s;
        stack[sp++] = q;
      }
    }
    if (n > bestArea) {
      bestArea = n;
      bestBox = {
        x0: mnx * BS, y0: mny * BS,
        x1: Math.min(w - 1, (mxx + 1) * BS - 1),
        y1: Math.min(h - 1, (mxy + 1) * BS - 1),
        blocks: n
      };
    }
  }

  if (!bestBox) return null;
  if (bestArea < 30) return null;                                   // 太小，不是浮窗
  const rw = bestBox.x1 - bestBox.x0, rh = bestBox.y1 - bestBox.y0;
  if (rw < w * 0.15 || rh < h * 0.05) return null;
  return bestBox;
}

/** 给定一组网格参数，统计 90 个交叉点上的棋子圆盘命中情况 */
function gridAlignScore(integ, iw, w, h, x0, cw, y0, ch, rad, skip) {
  let score = 0, hits = 0, usable = 0;
  const rr = Math.max(2, Math.round(rad));
  for (let r = 0; r < 10; r++) {
    const y = y0 + r * ch;
    const ya = Math.round(y - rr), yb = Math.round(y + rr);
    if (ya < 0 || yb >= h) continue;
    for (let c = 0; c < 9; c++) {
      const x = x0 + c * cw;
      const xa = Math.round(x - rr), xb = Math.round(x + rr);
      if (xa < 0 || xb >= w) continue;
      // 落在浮窗区域里的交叉点不参与打分 —— 那块是被自己浮窗盖住的，
      // 里面是我们自己画的米黄棋盘，拿它当「棋子」会把网格整体拉偏。
      if (skip && x >= skip.x0 && x <= skip.x1 && y >= skip.y0 && y <= skip.y1) continue;
      const a = integ[ya * iw + xa];
      const b = integ[ya * iw + xb + 1];
      const cc = integ[(yb + 1) * iw + xa];
      const d = integ[(yb + 1) * iw + xb + 1];
      const area = (xb - xa + 1) * (yb - ya + 1);
      const dens = (d - b - cc + a) / area;
      score += dens;
      usable++;
      if (dens > 0.35) hits++;
    }
  }
  return { score: score, hits: hits, usable: usable };
}

/**
 * ★ 用棋子反推网格（核心定位函数）
 *
 * @param {Uint8ClampedArray} pixels RGBA
 * @param {number} w
 * @param {number} h
 * @param {Array<[number,number]>} corners 可选：额外的搜索起点（边缘投影结果）
 * @returns {Array<[number,number]>|null}
 */
function refineByPieces(pixels, w, h, corners) {
  refineByPieces.lastDebug = null;
  if (!pixels || w < 60 || h < 60) return null;

  const di = buildDiskIntegral(pixels, w, h);
  if (di.count < 400) return null;    // 画面里几乎没有棋子圆盘，不是对局
  const integ = di.integ, iw = di.iw;

  // 候选起点：归一化先验 + 边缘投影结果（如果有）
  const seeds = [];
  seeds.push({ x0: BOARD_PRIOR.x0 * w, cw: BOARD_PRIOR.cw * w, y0: BOARD_PRIOR.y0 * h, ch: BOARD_PRIOR.ch * h, tag: 'prior' });
  if (corners && corners.length >= 4) {
    const cw0 = (corners[1][0] - corners[0][0]) / 8;
    const ch0 = (corners[3][1] - corners[0][1]) / 9;
    if (cw0 > 8 && ch0 > 8) {
      seeds.push({ x0: corners[0][0], cw: cw0, y0: corners[0][1], ch: ch0, tag: 'edges' });
    }
  }

  // 先找出自己浮窗盖住的矩形，打分时跳过那块
  const skipRect = findPipRect(pixels, w, h);

  // 先验基准（用于「离先验多远」的打分）
  const priorRef = seeds[0];

  function devOf(x0, cw, y0, ch) {
    // 以「格」为单位衡量偏离先验的程度
    return Math.abs(x0 - priorRef.x0) / Math.max(1, priorRef.cw)
      + Math.abs(y0 - priorRef.y0) / Math.max(1, priorRef.ch)
      + Math.abs(cw - priorRef.cw) / Math.max(1, priorRef.cw) * 8
      + Math.abs(ch - priorRef.ch) / Math.max(1, priorRef.ch) * 9;
  }

  let best = null;
  let coarse = true;
  let locked = false;
  const coarseCands = [];

  function consider(x0, cw, y0, ch, tag) {
    // 边界与比例检查
    if (!(cw > w * 0.03) || !(ch > h * 0.02)) return;
    if (cw > w * 0.30 || ch > h * 0.30) return;
    const ratio = cw / ch;
    if (ratio < 0.55 || ratio > 1.80) return;
    const rr = Math.min(cw, ch) * 0.30;
    const r = gridAlignScore(integ, iw, w, h, x0, cw, y0, ch, rr, null);
    if (r.hits < 2) return;   // 残局只有 6 个子，门槛必须放低
    if (r.usable < 40) return;
    const cand = { x0: x0, cw: cw, y0: y0, ch: ch, hits: r.hits, score: r.score, tag: tag, dev: devOf(x0, cw, y0, ch) };
    if (!best || r.hits > best.hits || (r.hits === best.hits && r.score > best.score)) best = cand;
    if (coarse) coarseCands.push(cand);
    return cand;
  }

  // ---- 粗搜 ----
  // ---- 先验优先：布局是死的，先验命中够多就别让搜索跑野 ----
  //
  // JJ象棋 的棋盘位置是固定布局（5 张真实截图反解出来完全一致：
  //   x0/W=0.0666  cw/W=0.1078  y0/H=0.2773  ch/H=0.0484）。
  // 一旦有东西被遮住（画中画挡住右上角 8 个交叉点），能参与打分的点就少了，
  // 搜索会找到一组「歪着的网格」，命中数反而多 1~4 个（浮窗边缘的高光被当成棋子），
  // 结果整盘采样点集体偏移 6~7 像素，第 0 排的車就被认成卒。
  //
  // 所以：先验的命中数只要够（>=16 个交叉点有棋子），就直接采用先验，
  // 只在 ±0.04 格 / ±0.8% 的极小窗口里微调（吸收不同机型的细微差异）。
  // 先验命中太少（换机型、换主题、或根本不是对局画面）才走完整搜索。
  {
    const sd = seeds[0];
    const rr = Math.min(sd.cw, sd.ch) * 0.30;
    const base = gridAlignScore(integ, iw, w, h, sd.x0, sd.cw, sd.y0, sd.ch, rr, null);
    // 只有「浮窗真的压到棋盘」时才锁先验。
    // 没遮挡的画面里完整搜索更准（能吃到 0.1% 的格距差异）；
    // 有遮挡时能参与打分的点变少，搜索会被浮窗边缘的高光带偏，就该退回先验。
    const bx0 = sd.x0 - sd.cw * 0.5, bx1 = sd.x0 + sd.cw * 8.5;
    const by0 = sd.y0 - sd.ch * 0.5, by1 = sd.y0 + sd.ch * 9.5;
    const occluded_unused = !!(skipRect && skipRect.x1 >= bx0 && skipRect.x0 <= bx1
      && skipRect.y1 >= by0 && skipRect.y0 <= by1);
    if (base.hits >= 3 && base.usable >= 40) {
      let pick = { x0: sd.x0, cw: sd.cw, y0: sd.y0, ch: sd.ch, hits: base.hits, score: base.score, dev: 0, tag: 'prior-fixed' };
      const oS = 0.02, sS = 0.004;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const cw = sd.cw * (1 + i * sS);
          const ch = sd.ch * (1 + j * sS);
          for (let a = -1; a <= 1; a++) {
            for (let b = -1; b <= 1; b++) {
              const x0 = sd.x0 + a * oS * sd.cw;
              const y0 = sd.y0 + b * oS * sd.ch;
              const r = gridAlignScore(integ, iw, w, h, x0, cw, y0, ch, rr, null);
              if (r.usable < 40) continue;
              // 只有明显更好（多命中 2 个以上）才离开先验
              if (r.hits >= pick.hits + 2) {
                pick = { x0: x0, cw: cw, y0: y0, ch: ch, hits: r.hits, score: r.score, dev: devOf(x0, cw, y0, ch), tag: 'prior-polish' };
              }
            }
          }
        }
      }
      best = pick;
      locked = true;
      coarseCands.length = 0;
    }
  }

  // ---- 粗搜 ----
  //   prior 种子（归一化先验）用窄窗口；edges 种子（边缘投影）误差大，才需要宽窗口。
  for (let s = 0; s < seeds.length; s++) {
    if (best) break;                      // 先验已经定案，不用再搜
    const sd = seeds[s];
    const tight = (sd.tag === 'prior');
    const nScale = tight ? 1 : 2;
    const nOrigin = tight ? 2 : 3;
    const sStep = tight ? 0.015 : 0.03;   // 先验种子：格距只搜 ±1.5%
    const oStep = tight ? 0.05 : 0.2;     // 先验种子：起点只搜 ±0.1 格
    for (let i = -nScale; i <= nScale; i++) {
      for (let j = -nScale; j <= nScale; j++) {
        const cw = sd.cw * (1 + i * sStep);
        const ch = sd.ch * (1 + j * sStep);
        for (let a = -nOrigin; a <= nOrigin; a++) {
          for (let b = -nOrigin; b <= nOrigin; b++) {
            consider(sd.x0 + a * oStep * sd.cw, cw, sd.y0 + b * oStep * sd.ch, ch, sd.tag);
          }
        }
      }
    }
  }
  if (!best) return null;
  coarse = false;

  // 粗搜定案：命中数相差 2 格以内时，选「离先验最近」的那组。
  // 画中画挡住右上角后，被遮住的交叉点不参与打分，歪着的网格命中数可能反而多 1~2 个
  // （浮窗边缘的高光被当成棋子）。而 JJ象棋 布局是死的，正确网格一定贴着先验。
  if (coarseCands.length) {
    let mx = 0;
    for (let ci = 0; ci < coarseCands.length; ci++) if (coarseCands[ci].hits > mx) mx = coarseCands[ci].hits;
    let pick = null;
    for (let ci = 0; ci < coarseCands.length; ci++) {
      const c = coarseCands[ci];
      if (c.hits < mx - 6) continue;
      if (!pick || c.dev < pick.dev || (c.dev === pick.dev && c.score > pick.score)) pick = c;
    }
    if (pick) best = pick;
  }

  // ---- 细搜：格距 ±1.5%，起点 ±0.1 格 ----
  if (!locked) {
    const b0 = best;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const cw = b0.cw * (1 + i * 0.0075);
        const ch = b0.ch * (1 + j * 0.0075);
        for (let a = -2; a <= 2; a++) {
          for (let b = -2; b <= 2; b++) {
            consider(b0.x0 + a * 0.04 * b0.cw, cw, b0.y0 + b * 0.04 * b0.ch, ch, b0.tag);
          }
        }
      }
    }
  }

  // ---- 超细：格距 ±0.4%，起点 ±0.02 格 ----
  if (!locked) {
    const b0 = best;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const cw = b0.cw * (1 + i * 0.002);
        const ch = b0.ch * (1 + j * 0.002);
        for (let a = -2; a <= 2; a++) {
          for (let b = -2; b <= 2; b++) {
            consider(b0.x0 + a * 0.008 * b0.cw, cw, b0.y0 + b * 0.008 * b0.ch, ch, b0.tag);
          }
        }
      }
    }
  }

  if (!best) return null;
  // 命中太少说明不是对局画面（比如停在菜单/结算界面），宁可报失败
  if (best.hits < 3) return null;   // 残局可能只有 5~6 个子

  refineByPieces.lastDebug = {
    cellW: best.cw, cellH: best.ch, ratio: best.cw / best.ch,
    hits: best.hits, score: best.score, seed: best.tag, pipRect: skipRect,
    x0: best.x0, y0: best.y0, diskPixels: di.count
  };

  const gx0 = best.x0, gx8 = best.x0 + 8 * best.cw;
  const gy0 = best.y0, gy9 = best.y0 + 9 * best.ch;
  return [
    [gx0, gy0],
    [gx8, gy0],
    [gx8, gy9],
    [gx0, gy9]
  ];
}

function autoDetectBoard(pixels, w, h) {
  if (!pixels || w < 60 || h < 60) return null;

  // ① 首选：棋子圆盘全格对齐（快、准、稳，不依赖棋盘线）
  refineByPieces.lastDebug = null;
  var fast = refineByPieces(pixels, w, h, null);
  if (fast) {
    autoDetectBoard.lastDebug = { used: 'pieces', pieceFit: refineByPieces.lastDebug };
    return fast;
  }

  // ② 兜底：棋盘线边缘投影 + 等距拟合，再用棋子校验一次
  var edge = edgeDetectBoard(pixels, w, h);
  if (!edge) {
    autoDetectBoard.lastDebug = { used: 'fail', pieceFit: null };
    return null;
  }
  refineByPieces.lastDebug = null;
  var fixed = refineByPieces(pixels, w, h, edge);
  autoDetectBoard.lastDebug = {
    used: fixed ? 'edges+pieces' : 'edges',
    edge: edge,
    pieceFit: refineByPieces.lastDebug
  };
  return fixed || edge;
}

function edgeDetectBoard(pixels, w, h) {

  // 1) 灰度
  const gray = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let x = 0; x < w; x++) {
      const i = (base + x) * 4;
      gray[base + x] = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    }
  }

  // 2) 垂直边缘强度 → 竖线投影
  const colScore = new Float32Array(w);
  for (let x = 3; x < w - 3; x++) {
    let s = 0;
    for (let y = 2; y < h - 2; y += 2) {
      const c = y * w + x;
      const g = Math.abs(gray[c + 3] - gray[c - 3]);
      if (g > 14) s += g;
    }
    colScore[x] = s;
  }

  // 3) 水平边缘强度 → 横线投影
  const rowScore = new Float32Array(h);
  for (let y = 3; y < h - 3; y++) {
    let s = 0;
    for (let x = 2; x < w - 2; x += 2) {
      const c = y * w + x;
      const g = Math.abs(gray[c + 3 * w] - gray[c - 3 * w]);
      if (g > 14) s += g;
    }
    rowScore[y] = s;
  }

  // 4) 找 9 竖 10 横（格距至少 12 像素）
  const cols = findEvenlySpacedPeaks(colScore, 9, 12);
  const rows = findEvenlySpacedPeaks(rowScore, 10, 12);
  if (!cols || !rows) return null;

  // 5) 用「中位间距」重建网格，而不是直接用首尾位置。
  //    首尾两条线最容易被装饰边框、棋盘外的 UI 干扰（实测下边会丢掉一整条线，
  //    导致格高差 22%，最下面那排棋子采样全部偏离）。
  //    中间几条线最干净，取相邻间距的中位数作为真实格距，再以中位线为锚点铺开。
  function gapsMedian(arr) {
    const g = [];
    for (let i = 1; i < arr.length; i++) g.push(arr[i] - arr[i - 1]);
    if (!g.length) return 0;
    g.sort((a, b) => a - b);
    return g[Math.floor(g.length / 2)];
  }

  const gapW = gapsMedian(cols);
  const gapH = gapsMedian(rows);
  if (gapW < 10 || gapH < 10) return null;

  // 格距比例校验：中国象棋格子接近正方形，横向纵向格距应接近
  const ratio2 = gapH / gapW;
  if (ratio2 < 0.75 || ratio2 > 1.35) return null;

  // 用中位线做锚点，按中位格距向两侧铺开
  const midC = cols[4];       // 第 5 条竖线（最中间）
  const midR = rows[4];       // 第 5 条横线
  const colsFit = new Array(9);
  const rowsFit = new Array(10);
  for (let i = 0; i < 9; i++) colsFit[i] = midC + (i - 4) * gapW;
  for (let j = 0; j < 10; j++) rowsFit[j] = midR + (j - 4) * gapH;

  // 6) 亚像素细化：用检测到的真实峰值修正（在重建位置附近找最近峰）
  function snapToPeak(profile, guess) {
    let best = guess, bestV = -1;
    const lo = Math.max(1, Math.round(guess) - Math.round(gapW * 0.25));
    const hi = Math.min(profile.length - 2, Math.round(guess) + Math.round(gapW * 0.25));
    for (let i = lo; i <= hi; i++) {
      if (profile[i] > bestV) { bestV = profile[i]; best = i; }
    }
    return refinePeak(profile, Math.round(best));
  }

  const colsF = colsFit.map(x => snapToPeak(colScore, x));
  const rowsF = rowsFit.map(y => snapToPeak(rowScore, y));

  // 边缘投影只给「大概的线」，交给调用方用棋子再校正一次
  return [
    [colsF[0], rowsF[0]],   // 左上
    [colsF[8], rowsF[0]],   // 右上
    [colsF[8], rowsF[9]],   // 右下
    [colsF[0], rowsF[9]]    // 左下
  ];
}




class BoardRecognizer {

  /**
   * @param {object} cfg
   *   corners: [[x,y]x4] 屏幕像素坐标，顺序 [左上, 右上, 右下, 左下]
   *   cellRadiusRatio: 采样半径占格距的比例，默认 0.40
   *   bgModel: 可选的已学习背景模型
   */
  constructor(cfg) {
    this.corners = cfg.corners ? cfg.corners.map(p => [p[0], p[1]]) : null;
    // 采样半径占格距的比例。
    //
    // 这个值同时决定「能采到多少字形」和「会不会被高亮圈污染」，实测扫描：
    //   0.42 → 上一步的高亮圈（半径 22~30 像素）整个落进 patch 外圈，
    //          红色通道被圈填满，红俥被判成红傌/红仕（实测 5 张图共错 7 格）
    //   0.34 → 圈在 patch 之外，只采到字形，5 张图 450 格只剩 2 格错
    //   0.30 → 采得太小，字形边缘被切掉，反而变差
    // 模板必须用同一个比例训练（tools/gen-templates.mjs）。
    this.cellRadiusRatio = cfg.cellRadiusRatio || 0.34;
    this.bgModel = cfg.bgModel || null;
    this.lastStats = null;
    // 模板在 patchWeights 构建完才能归一化，所以先占位、后面再装
    this.templates = null;
    // 低置信度格子再做多尺度重采样。
    // 默认关闭 —— 实测在 0.34 半径下它反而把本来认对的红子改成错的
    // （u_dots 从 0 错变成 2 错），逐格置信度 + 保留上一稳定值那套已经够用。
    this.enableLowConfRefine = !!cfg.enableLowConfRefine;
    // 兵种打分方式：'dot'（归一化点积）或 'mass'（点积 + 笔画总量惩罚）
    //
    // 实测（630 格，含两张困难残局）：
    //   dot         错 5
    //   mass:0.35   错 4
    //   mass:0.70   错 2   ← 采用
    // 原因：点积对「这个字到底有几笔」不敏感，笔画被采样丢一半时
    // 反而跟笔画最少的那个字最像（馬→卒、俥→仕、象→卒）。
    // 乘上一个「样本墨迹量 vs 模板墨迹量」的折扣，复杂度也成了判据。
    this.scoreMode = cfg.scoreMode || 'mass';
    this.massK = (typeof cfg.massK === 'number') ? cfg.massK : 0.70;

    // 径向权重：中心权重高、边缘权重低。
    // 空格的 patch 边缘是棋盘网格线（深色直线），棋子的边缘是圆形描边，
    // 两者在灰度上很像，全图等权比对会被边缘带偏。
    // 加权后由中心区域主导 —— 棋子中心是圆盘+字，空格中心是干净棋盘，差异最明显。
    const PW = PATCH_W;
    this.patchWeights = (() => {
      const w = new Float32Array(PW * PW);
      let sum = 0;
      const half = (PW - 1) / 2;
      for (let py = 0; py < PW; py++) {
        for (let px = 0; px < PW; px++) {
          const dx = (px - half) / half;
          const dy = (py - half) / half;
          const v = Math.exp(-(dx * dx + dy * dy) * 1.2);
          w[py * PW + px] = v;
          sum += v;
        }
      }
      for (let i = 0; i < w.length; i++) w[i] /= sum;
      return w;
    })();

    // ★ 内置模板：从已知正确的开局截图离线生成，装在引擎里。
    //   这样中途进入对局也能直接认，不再依赖「第一帧必须是开局」。
    this.templates = cfg.templates || this._buildBuiltinTemplates();
    this.templateCount = (function () { let n = 0; for (const k in this.templates) n += this.templates[k].length; return n; }).call(this);
  }

  /**
   * 从 templates.js 解包并归一化内置模板
   */
  _buildBuiltinTemplates() {
    let raw;
    try { raw = require('./templates').unpack(); } catch (e) { return null; }
    const out = {};
    for (const key in raw) {
      const list = raw[key];
      const conv = [];
      for (let i = 0; i < list.length; i++) {
        const nw = this.normalizePatch(list[i].w);
        const nr = this.normalizePatch(list[i].r);
        if (!nw || !nr) continue;
        conv.push({ w: nw, r: nr, i: list[i].i ? this.normalizePatch(list[i].i) : null });
      }
      if (conv.length) out[key] = conv;
    }
    return out;
  }

  /** 计算 90 个交叉点的像素坐标；返回 Float32Array(180) */
  gridPoints() {
    if (!this.corners) throw new Error('未标定四边形');
    const [p00, p10, p11, p01] = this.corners;
    const pts = new Float32Array(180);
    for (let r = 0; r < 10; r++) {
      const v = r / 9;
      for (let c = 0; c < 9; c++) {
        const u = c / 8;
        const p = bilinear(p00, p10, p11, p01, u, v);
        const i = (r * 9 + c) * 2;
        pts[i] = p[0];
        pts[i + 1] = p[1];
      }
    }
    return pts;
  }

  /**
   * 格距估算（像素）
   *
   * 【历史 bug】原来写成 hypot(pts[2]-pts[0], pts[3]-pts[1]) / 8，
   * 但 pts[0] 与 pts[2] 是「r0c0」和「r0c1」两个相邻交叉点，
   * 它们的距离本来就等于一个格宽，再除以 8 会让采样半径缩到 1/8
   * （约 2.5 像素），只采到棋子正中心那一点，什么都判不出来。
   */
  cellSize(pts) {
    const dx = pts[2] - pts[0];
    const dy = pts[3] - pts[1];
    return Math.hypot(dx, dy);
  }

  /**
   * 采样一个交叉点周围的特征 + 模板图
   *
   * 【历史 bug】原来 patch 的填充复用了统计用的 step（radius/4 = 5 像素），
   * 而 patch 每格只有 (2*radius/16 = 2.5) 像素宽，导致 256 个 patch 格
   * 里一大半根本没被赋值，全是初始 0 —— 所有格子的模板长得一样，
   * NSC 匹配全部失效，最终把棋子全判成空（正好 30 格偏差）。
   *
   * 现在 patch 按 16×16 网格逐格采样，一个不漏；
   * 统计特征也从同一批采样点累计，口径一致。
   */
  sampleCell(pixels, w, h, cx, cy, radius, wantPatch, gain) {
    const g = (typeof gain === 'number' && gain > 0) ? gain : 1;
    let n = 0, sumL = 0, red = 0, dark = 0, bright = 0, warm = 0, skipped = 0;
    let ink = 0, redInk = 0, darkInk = 0;
    let coreN = 0, coreInk = 0, coreRedInk = 0, coreDarkInk = 0;
    const PW = PATCH_W;
    let patchW = null, patchR = null, patchI = null, patchValid = null;

    // 纯绿像素过滤器（可走位置绿点、绿色高亮圈）
    const isPureGreen = (R, G, B) => (G > R + 30 && G > B + 30 && G > 90);

    if (wantPatch) {
      patchW = new Uint8Array(PW * PW);
      patchR = new Uint8Array(PW * PW);
      patchI = new Uint8Array(PW * PW);
      // 有效像素掩码：0 = 这一格像素是干扰（高亮圈 / 绿点 / 白边），
      // 模板比对时把它的权重归零，避免「上一步的高亮圈」把兵种带偏。
      patchValid = new Uint8Array(PW * PW);
      const span = radius * 2;
      const stepPx = span / PW;
      const halfP = (PW - 1) / 2;
      // ★ 亚像素四点平均（盒式滤波）
      //
      // 为什么必须这么做：patch 只有 24x24，而采样窗常常 50 像素以上 ——
      // 也就是说一个 patch 像素要代表 2 像素以上的源区域。原来的写法是
      // 「点采样」，细笔画（俥/傌/馬/象 的横竖撇）会随相位被稀疏采到、甚至整段漏掉。
      // 漏掉之后这个字看上去就像「笔画更少的那个字」，实测失败签名非常一致：
      //   俥→仕、傌→仕、象→卒、馬→卒（复杂字全被读成最简单的字）
      // 而且同一张图缩放到 700 和 589 会给出不同结果 —— 本质就是相位不同。
      // 现在每个 patch 像素在自身footprint 内取 4 个亚像素点、按多数表决，
      // 笔画不再随相位丢失，不同分辨率之间也一致。
      const subOff = stepPx * 0.25;
      for (let py = 0; py < PW; py++) {
        for (let px = 0; px < PW; px++) {
          const bx = cx - radius + (px + 0.5) * stepPx;
          const by = cy - radius + (py + 0.5) * stepPx;
          const du = (px - halfP) / halfP, dv = (py - halfP) / halfP;
          const rr = Math.sqrt(du * du + dv * dv);
          const inCore = (py >= 6 && py <= 17 && px >= 6 && px <= 17);
          let okN = 0, wN = 0, rN = 0, iN = 0, riN = 0, diN = 0;
          let lSum = 0, redN = 0, darkN = 0, brightN = 0, warmN = 0;
          for (let si = 0; si < 4; si++) {
            const sx = Math.round(bx + ((si === 0 || si === 2) ? -subOff : subOff));
            const sy = Math.round(by + (si < 2 ? -subOff : subOff));
            if (sx < 1 || sy < 1 || sx >= w - 1 || sy >= h - 1) continue;
            const i = (sy * w + sx) * 4;
            var R = pixels[i], G = pixels[i + 1], B = pixels[i + 2];
            if (g !== 1) {
              R = R * g > 255 ? 255 : (R * g) | 0;
              G = G * g > 255 ? 255 : (G * g) | 0;
              B = B * g > 255 ? 255 : (B * g) | 0;
            }
            if (isPureGreen(R, G, B)) continue;
            // 白色高亮圈：既不是墨也不是暖色，直接跳过，
            // 否则它会把整格的 ink/warm 拉成 0。
            if (R > 200 && G > 200 && B > 200) continue;
            // 外圈的「红色高亮圈」：亮红、绿通道很低，和棋子盘面/红字都不同。
            if (rr > 0.66 && R > 150 && G < 125 && (R - G) > 60) continue;

            const L = 0.299 * R + 0.587 * G + 0.114 * B;
            const rb = R - B;
            okN++;
            lSum += L;
            if (rb > 22 && R > 80) { warmN++; wN++; }
            if (R > 85 && (R - G) > 45 && rb > 45) { redN++; rN++; }
            if (L < 72) darkN++;
            if (L > 178) brightN++;
            // ---- 墨迹特征（核心判据）----
            // 棋子上的「字」是深色或红色，而棋子盘面、棋盘、绿点、高亮圈都是亮的。
            // 区分「红字」和「暖色盘面」靠绿通道：
            //   红字 (170, 30, 30)  G 极低（约 30）
            //   盘面 (200,150,100)  G 中等（约 150）
            const isRedInk = (R > 95 && G < 115 && (R - G) > 55 && (R - B) > 65);
            const isDarkInk = (L < 85) && !isRedInk;
            if (isRedInk || isDarkInk) iN++;
            if (isRedInk) riN++;
            if (isDarkInk) diN++;
          }
          if (!okN) { skipped++; continue; }
          const inv = 1 / okN;
          const idx = py * PW + px;
          patchValid[idx] = 1;
          patchW[idx] = (wN * 2 >= okN) ? 255 : 0;
          patchR[idx] = (rN * 2 >= okN) ? 255 : 0;
          patchI[idx] = (iN * 2 >= okN) ? 255 : 0;

          sumL += lSum * inv; n++;
          red += redN * inv;
          dark += darkN * inv;
          bright += brightN * inv;
          warm += warmN * inv;
          ink += iN * inv;
          redInk += riN * inv;
          darkInk += diN * inv;
          // 中心 8x8 单独统计墨迹：高亮圈的深色描边只落在极外圈，
          // 全图统计会把它算成「黑墨」，于是刚走过的红仕被判成黑兵。
          if (inCore) {
            coreN++;
            if (iN * 2 >= okN) coreInk++;
            if (riN * 2 >= okN) coreRedInk++;
            if (diN * 2 >= okN) coreDarkInk++;
          }
        }
      }
    } else {
      // 稀疏采样版也统计墨迹（精度略低但够用）
      const step = Math.max(1, Math.floor(radius / 5));
      const r2 = radius * radius;
      for (let dy = -radius; dy <= radius; dy += step) {
        for (let dx = -radius; dx <= radius; dx += step) {
          if (dx * dx + dy * dy > r2) continue;
          const x = Math.round(cx + dx);
          const y = Math.round(cy + dy);
          if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
          const i = (y * w + x) * 4;
          var R = pixels[i], G = pixels[i + 1], B = pixels[i + 2];
          if (g !== 1) {
            R = R * g > 255 ? 255 : (R * g) | 0;
            G = G * g > 255 ? 255 : (G * g) | 0;
            B = B * g > 255 ? 255 : (B * g) | 0;
          }
          if (isPureGreen(R, G, B)) { skipped++; continue; }
          if (R > 200 && G > 200 && B > 200) { skipped++; continue; }
          const L = 0.299 * R + 0.587 * G + 0.114 * B;
          sumL += L; n++;
          const rb = R - B;
          if (R > 85 && (R - G) > 45 && rb > 45) red++;
          if (L < 72) dark++;
          if (L > 178) bright++;
          if (rb > 26 && R > 85) warm++;

          const isRedInk = (R > 95 && G < 115 && (R - G) > 55 && (R - B) > 65);
          const isDarkInk = (L < 85) && !isRedInk;
          if (isRedInk || isDarkInk) ink++;
          if (isRedInk) redInk++;
          if (isDarkInk) darkInk++;
        }
      }
    }

    const denom = n > 0 ? n : 1;
    return {
      meanL: sumL / denom,
      redR: red / denom,
      darkR: dark / denom,
      brightR: bright / denom,
      warmR: warm / denom,
      inkR: ink / denom,
      redInkR: redInk / denom,
      darkInkR: darkInk / denom,
      // 中心区域（避开高亮圈）的墨迹占比 —— 判红黑用这个更准
      inkCoreR: coreInk / (coreN || 1),
      redInkCoreR: coreRedInk / (coreN || 1),
      darkInkCoreR: coreDarkInk / (coreN || 1),
      coreN,
      n,
      skipped,
      patchW,
      patchR,
      patchI,
      patchValid
    };
  }

  /**
   * 估计这一帧的亮度增益，把真机抓屏拉到模板的水平。
   *
   * 参考值 150：真实截图（模板来源）里棋盘区域的整体亮度约 150。
   * 增益夹在 0.55 ~ 1.9 之间，避免在极端画面上放大噪声。
   * 用棋盘内 90 个格点周围的稀疏采样来算，开销很小。
   */
  estimateGain(pixels, w, h, pts) {
    let sum = 0, n = 0;
    const step = 3;
    for (let sq = 0; sq < 90; sq++) {
      const cx = pts[sq * 2], cy = pts[sq * 2 + 1];
      for (let dy = -7; dy <= 7; dy += step) {
        const y = Math.round(cy + dy);
        if (y < 1 || y >= h - 1) continue;
        for (let dx = -7; dx <= 7; dx += step) {
          const x = Math.round(cx + dx);
          if (x < 1 || x >= w - 1) continue;
          const i = (y * w + x) * 4;
          sum += 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
          n++;
        }
      }
    }
    if (n < 50) return 1;
    const meanL = sum / n;
    if (!(meanL > 20)) return 1;
    let g = 150 / meanL;
    if (g < 0.55) g = 0.55;
    if (g > 1.9) g = 1.9;
    return g;
  }

  /** 全盘采样，返回 90 个特征 */
  sampleAll(pixels, w, h, wantPatch) {
    const pts = this.gridPoints();
    const cell = this.cellSize(pts);
    const radius = Math.max(3, Math.round(cell * this.cellRadiusRatio));

    // ★ 按帧自适应亮度
    //   模板是从「真实截图」生成的，而真机抓屏（ReplayKit 的 YUV→RGB）出来的
    //   亮度/对比常常和截图不一样。所有颜色判据（暖色、红字、墨迹）都是绝对阈值，
    //   整体偏亮偏暗就会把这些阈值全推歪 —— 表现就是「位置对、字和颜色全错」。
    //   这里先用整帧统计出一个增益，把这一帧拉到模板的水平再判。
    const gain = this.estimateGain(pixels, w, h, pts);

    const out = new Array(90);
    for (let sq = 0; sq < 90; sq++) {
      out[sq] = this.sampleCell(pixels, w, h, pts[sq * 2], pts[sq * 2 + 1], radius, wantPatch, gain);
    }
    this.lastStats = { pts, cell, radius, gain };
    // 顺便记下自己画中画的位置：既能用来跳过被遮挡的交叉点，
    // 也能让 App 端提醒用户「浮窗挡住棋盘了，拖走」。
    this.pipRect = findPipRect(pixels, w, h);
    this.pipOverlap = !!(this.pipRect && this.pipRect.y1 >= pts[1] - cell * 0.6
      && this.pipRect.y0 <= pts[9 * 9 * 2 + 1] + cell * 0.6
      && this.pipRect.x1 >= pts[0] - cell * 0.6
      && this.pipRect.x0 <= pts[8 * 2] + cell * 0.6);
    if (wantPatch && this.templates && this.enableLowConfRefine) {
      this.refineLowConfidence(out, pixels, w, h, pts, cell, radius, gain);
    }
    return out;
  }

  /**
   * 对「认不准的格子」做多尺度 + 多偏移的局部重采样
   *
   * 解决两类问题：
   *   1. JJ象棋 落子瞬间会把刚走的棋子放大 1.25 倍、偏移十几像素
   *      （那一帧模板分数只有 0.2，正常 1.3~2.7），红仕会被判成红兵；
   *   2. 网格残余误差（格距差 1%，累积到第 9 行就有 6 像素）。
   *
   * 只对「看起来有子但分数低」的格子做，空格直接跳过，
   * 所以正常情况几乎没有额外开销。
   *
   * @returns {number} 被修正的格子数
   */
  refineLowConfidence(stats, pixels, w, h, pts, cell, radius, gain) {
    let fixed = 0, budget = 18;
    const OFFS = [-1, 0, 1];
    // 尺度要能覆盖「这个主题的字比模板更大」的情况。
    // 「雨打芭蕉 19」那张盘面实测：車 在 1.0 尺度下只能拿 0.427、输给卒，
    // 拉到 1.20 立刻变 0.564 并赢下来；傌 同样在 1.20 才出头。
    const SCALES = [0.90, 0.95, 1.05, 1.10, 1.20, 1.30];

    for (let sq = 0; sq < 90 && budget > 0; sq++) {
      const s = stats[sq];
      if (!s || !s.patchW) continue;
      // 明显是空格就别浪费预算
      const warm = s.warmR || 0;
      const inkCore = s.inkCoreR || 0;
      if (warm < 0.24 && inkCore < 0.10) continue;

      const m0 = this.matchCell(s);
      // 空格的 warm 占比也可能很高（棋盘底色就是暖色），
      // 这些格子进来只会白吃预算。实测预算 16 个格子会被一条空行吃光，
      // 真正需要重采的低分棋子反而轮不到 —— 这就是 r7c5 明明有 0.512 的
      // 更好结果却一直没被采纳的原因。
      if (m0.score < 0.10) continue;
      // 「没把握」的两种形态：
      //   1) 分数低 —— 字形没对上；
      //   2) 分数不低但一二名差距很小 —— 这才是最危险的一类，
      //      实测 r1c1 的 俥 得 0.568 排第一，可正确答案 傌 就在 0.03 分之后。
      // 只要满足其中一条就值得重采一次。
      const m0margin = (m0.alts && m0.alts.length > 1) ? (m0.alts[0].score - m0.alts[1].score) : 9;
      if (m0.key !== 'E' && m0.score >= 0.62 && m0margin >= 0.10) continue;

      budget--;
      const cx = pts[sq * 2], cy = pts[sq * 2 + 1];
      // 偏移用 ±0.055 格：实测这类「棋子偏下半个字」的盘面，最佳平移就在 0.05 格附近，
      // 用 0.075 会跨过头（跨过头之后会咬到相邻棋子的笔画）。
      const off = cell * 0.055;
      let bestStats = s, bestScore = (m0.key === 'E') ? -2 : m0.score;

      // 两步走：先在同一尺度上找最佳偏移（9 次），再在最佳偏移上试尺度（4 次）。
      // 全组合 3x3x4=36 次太贵，实测两步走命中率一样。
      let ox = 0, oy = 0, offBest = bestScore, offStats = s;
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          if (dx === 1 && dy === 1) continue;   // 原位置已经试过
          const nx = cx + OFFS[dx] * off;
          const ny = cy + OFFS[dy] * off;
          const ns = this.sampleCell(pixels, w, h, nx, ny, radius, true, gain);
          const nm = this.matchCell(ns);
          if (nm.key !== 'E' && nm.score > offBest) {
            offBest = nm.score; offStats = ns; ox = OFFS[dx]; oy = OFFS[dy];
          }
        }
      }
      if (offStats !== s) { bestScore = offBest; bestStats = offStats; }

      if (ox || oy) {
        const bx = cx + ox * off, by = cy + oy * off;
        for (let si = 0; si < SCALES.length; si++) {
          if (SCALES[si] === 1.0) continue;   // 上面已经试过 1.0
          const r = Math.max(3, Math.round(radius * SCALES[si]));
          const ns = this.sampleCell(pixels, w, h, bx, by, r, true, gain);
          const nm = this.matchCell(ns);
          if (nm.key !== 'E' && nm.score > bestScore) {
            bestScore = nm.score; bestStats = ns;
          }
        }
      }

      // 采纳条件：必须比自己原来高出一截，否则宁可不改。
      // 只「略微更好」就替换，会把本来一次就对的格子搞坏（历史回退就是这么来的）。
      //
      // 绝对下限 0.30 而不是 0.55：像「团队配合 26 关」这种子被放大 + 红圈的盘面，
      // 整盘分数都被压到 0.25~0.6（正确棋子也只有 0.4 左右），
      // 用 0.55 当门槛会把本来能救回来的格子全部拒掉。
      // 真正防回退的是下面那条「至少高 0.12」。
      const baseScore = (m0.key === 'E') ? -2 : m0.score;
      // 还要求「赢得分明」：新结果对第二名的领先要 ≥0.04，
      // 否则说明这只是搜索空间变大后捞到的一个偶然高点，
      // 换掉原来的判断只会把好好的格子搞坏。
      let decisive = 1;
      if (bestStats !== s) {
        const mb = this.matchCell(bestStats);
        decisive = (mb.alts && mb.alts.length > 1) ? (mb.alts[0].score - mb.alts[1].score) : 1;
      }
      if (bestStats !== s && bestScore >= 0.30 && bestScore >= baseScore + 0.15 && decisive >= 0.04) {
        stats[sq] = bestStats;
        fixed++;
      }
    }
    this.lastRefined = fixed;
    return fixed;
  }

  /**
   * 用「双峰自动分割」学背景，不依赖「哪些格子是空的」这个先验。
   *
   * 原来靠开局 58 个空位采样，一旦画面不是开局就学错，还会污染模型。
   * 现在直接把 90 个格子的暖色度做直方图，用 Otsu 找最佳分割点：
   * 空棋盘（冷色）和有棋子（暖色）自然会分成两簇。
   *
   * @param {Array} stats sampleAll 的结果
   * @param {number[]} emptySquares 兼容旧调用，现在不依赖它
   */
  learnBackground(stats, emptySquares) {
    const vals = [];
    for (let i = 0; i < stats.length; i++) {
      const s = stats[i];
      if (s && s.n > 0) vals.push(s.warmR);
    }
    if (vals.length < 10) return null;

    // ---- Otsu 双峰分割 ----
    const BINS = 64;
    const hist = new Array(BINS).fill(0);
    for (let i = 0; i < vals.length; i++) {
      let b = Math.round(vals[i] * (BINS - 1));
      if (b < 0) b = 0;
      if (b >= BINS) b = BINS - 1;
      hist[b]++;
    }
    const total = vals.length;
    let sumAll = 0;
    for (let i = 0; i < BINS; i++) sumAll += i * hist[i];

    let wB = 0, sumB = 0, maxVar = -1, bestBin = 0;
    for (let i = 0; i < BINS; i++) {
      wB += hist[i];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += i * hist[i];
      const mB = sumB / wB;
      const mF = (sumAll - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) { maxVar = between; bestBin = i; }
    }

    let th = bestBin / (BINS - 1);
    // 阈值落在极端值说明画面里几乎全空或全满，给个保守默认
    if (th < 0.02 || th > 0.60) th = Math.max(0.06, Math.min(0.35, th || 0.15));

    // 红/黑判据的分布（相对量，不看绝对值）
    const reds = [], darks = [];
    for (let i = 0; i < stats.length; i++) {
      const s = stats[i];
      if (!s || s.n === 0) continue;
      reds.push(s.redR);
      darks.push(s.darkR);
    }
    const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

    this.bgModel = {
      warmThreshold: th,
      meanWarm: avg(vals),
      meanRed: avg(reds),
      meanDark: avg(darks),
      // 保留旧字段，别的代码可能还在读
      meanL: 0,
      stdL: 1,
      meanBright: 0,
      stdBright: 1,
      meanRedRaw: avg(reds),
      stdRed: 0.01,
      meanDarkRaw: avg(darks),
      stdDark: 0.01
    };
    return this.bgModel;
  }

  /**
   * 加权归一化 patch：减加权均值、除加权标准差
   * 比对的只是「中心区域的图案形状」，跟亮度、色调、边缘网格线无关
   */
  normalizePatch(patch) {
    return this.normalizePatchW(patch, this.patchWeights);
  }

  /**
   * 用指定权重做加权归一化。
   *
   * 模板训练时用全局 patchWeights；比对时用「按像素有效性过滤后」的权重，
   * 这样高亮圈 / 绿点盖住的像素不会把兵种比对带偏。
   * （高亮只在落子瞬间出现，但恰好是必须认准的那几帧。）
   */
  normalizePatchW(patch, weights) {
    const n = patch.length;
    if (!n) return null;
    const w = (weights && weights.length === n) ? weights : null;

    let sum = 0, sumW = 0;
    for (let i = 0; i < n; i++) {
      const wi = w ? w[i] : 1;
      sum += wi * patch[i];
      sumW += wi;
    }
    const mean = sum / (sumW || 1);

    let varSum = 0;
    for (let i = 0; i < n; i++) {
      const wi = w ? w[i] : 1;
      const d = patch[i] - mean;
      varSum += wi * d * d;
    }
    const std = Math.sqrt(varSum / (sumW || 1)) || 1;

    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = (patch[i] - mean) / std;
    return out;
  }

  /**
   * 从开局画面采集模板（双通道）
   */
  learnTemplates(stats, boardPieceAt) {
    const buckets = {};   // key -> [{w:归一化暖色, r:归一化红色}]
    for (let sq = 0; sq < 90; sq++) {
      const s = stats[sq];
      if (!s || !s.patchW) continue;
      const key = boardPieceAt[sq] || 'E';
      const vw = this.normalizePatch(s.patchW);
      const vr = this.normalizePatch(s.patchR);
      if (!vw || !vr) continue;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push({ w: vw, r: vr, i: s.patchI ? this.normalizePatch(s.patchI) : null });
    }
    this.templates = buckets;
    let total = 0;
    for (const k in buckets) total += buckets[k].length;
    this.templateCount = total;
    return buckets;
  }

  /**
   * 双通道加权 NCC 匹配
   *
   * 【必须先做暖色预筛】空格的 patchW 全是 0，归一化后得到全 0 向量，
   * 跟任何模板的点积都是 0 —— 于是所有空格都会被投给第一个碰上的红子模板
   * （曾经导致 58 格偏差，正好等于空格总数）。
   * 所以先用暖色占比把「明显是空格」的格子直接判掉，只让候选格进模板比对。
   */
  matchCell(stats) {
    const PW = stats.patchW.length;
    const valid = stats.patchValid;
    let warmCount = 0, redCount = 0, validCount = 0;
    for (let i = 0; i < PW; i++) {
      if (valid && !valid[i]) continue;
      validCount++;
      if (stats.patchW[i] > 0) warmCount++;
      if (stats.patchR[i] > 0) redCount++;
    }
    const warmRatio = warmCount / (validCount || PW);

    // 暖色像素占比太低 → 一定是空棋盘，直接判空
    if (warmRatio < 0.18) return { key: 'E', score: warmRatio, warmRatio };

    const n = PW;
    // 按像素有效性过滤后的权重：高亮圈 / 绿点 / 白边占掉的格直接不参与比对
    let wgt = null;
    if (this.patchWeights && this.patchWeights.length === n) {
      if (valid && validCount < n) {
        wgt = new Float32Array(n);
        let s = 0;
        for (let i = 0; i < n; i++) {
          const v = valid[i] ? this.patchWeights[i] : 0;
          wgt[i] = v;
          s += v;
        }
        if (s > 1e-6) {
          for (let i = 0; i < n; i++) wgt[i] /= s;
        } else {
          wgt = this.patchWeights;
        }
      } else {
        wgt = this.patchWeights;
      }
    }

    const vw = this.normalizePatchW(stats.patchW, wgt);
    const vr = this.normalizePatchW(stats.patchR, wgt);
    const vi = stats.patchI ? this.normalizePatchW(stats.patchI, wgt) : null;
    if (!vw || !vr || !this.templates) return { key: 'E', score: 0, warmRatio };

    let bestKey = 'E', best = -2;
    const all = [];
    // ---- 墨迹二值图（F1 打分用）----
    // 为什么要多算这一份：点积（余弦）只看「两个掩码同向有多长」，
    // 笔画被采样丢掉一部分时，残留下来的墨迹跟「笔画最少的那个字」同向性最好，
    // 于是复杂字被读成最简单的字 —— 实测就是 馬→卒、俥→仕、象→卒。
    // F1 = 2*|交集| / (|样本| + |模板|) 同时罚「漏检」和「多检」，
    // 少了一半笔画就会明显掉分，不会反而赢。
    const useF1 = (this.scoreMode === 'f1') && !!stats.patchI;
    const useMass = (this.scoreMode === 'mass') && !!stats.patchI;
    let vb = null, vInk = 0;
    if (useF1 || useMass) {
      vb = stats.patchI;
      for (let i = 0; i < n; i++) {
        if (valid && !valid[i]) continue;
        if (vb[i] > 0) vInk++;
      }
    }

    for (const key in this.templates) {
      const arr = this.templates[key];
      let typeBest = -9;
      for (let t = 0; t < arr.length; t++) {
        const tpl = arr[t];
        let score;
        if (tpl.i && useF1) {
          let tp = 0;
          for (let i = 0; i < n; i++) {
            if (vb[i] > 0 && tpl.i[i] > 0) tp++;
          }
          if (tpl._ni === undefined) {
            let s2 = 0;
            for (let i = 0; i < n; i++) if (tpl.i[i] > 0) s2++;
            tpl._ni = s2;
          }
          const den = vInk + tpl._ni;
          score = den > 0 ? (2 * tp) / den : 0;
        } else if (tpl.i) {
          // ★ 只算真正会用到的通道
          //
          // 兵种只看墨迹通道，但这里原来把暖色、红色两个点积也算了一遍再丢掉 ——
          // 86 个模板 x 576 像素 x 3 通道，光这一项每帧就多算 15 万次乘加。
          let dotI = 0;
          for (let i = 0; i < n; i++) {
            const wi = wgt ? wgt[i] : 1;
            dotI += wi * vi[i] * tpl.i[i];
          }
          score = dotI;
          if (useMass) {
            // 笔画总量惩罚：点积对「笔画多少」不敏感，残留一半笔画时
            // 跟「笔画最少的字」同向性反而最好（馬→卒、俥→仕 就是这么来的）。
            // 这里按「样本墨迹量 vs 模板墨迹量」的差异打个折，把复杂度也纳入判据。
            if (tpl._ni === undefined) {
              let s2 = 0;
              for (let i = 0; i < n; i++) if (tpl.i[i] > 0) s2++;
              tpl._ni = s2;
            }
            const mx = vInk > tpl._ni ? vInk : tpl._ni;
            const K = (typeof this.massK === 'number') ? this.massK : 0.35;
            if (mx > 0) score *= (1 - K * Math.abs(vInk - tpl._ni) / mx);
          }
        } else {
          let dotW = 0, dotR = 0;
          for (let i = 0; i < n; i++) {
            const wi = wgt ? wgt[i] : 1;
            dotW += wi * vw[i] * tpl.w[i];
            dotR += wi * vr[i] * tpl.r[i];
          }
          score = dotW + dotR * 0.3;
        }
        if (score > typeBest) typeBest = score;
        if (score > best) { best = score; bestKey = key; }
      }
      all.push({ key: key, score: typeBest });
    }
    // 候选项按分数降序，最多留 4 个，供「棋子数量上限」修复挑选
    all.sort((a, b) => b.score - a.score);
    return { key: bestKey, score: best, warmRatio, alts: all.slice(0, 4) };
  }

  /**
   * 模板匹配版三分类（以「墨迹」为主判据）
   *
   * 分工：
   *   墨迹（字是深色或红色）→ 决定「有没有子」和「红还是黑」   ← 最可靠，绿点/高亮圈都骗不到
   *   模板匹配              → 只决定「是哪个兵种」            ← 模板错了也不会把空判成有子
   *
   * 之前完全靠模板判有无，一旦模板受干扰（绿点、高亮圈、采样偏移），
   * 就会出现「空格被当成棋子」这种致命错误，整个 FEN 全废。
   */
  classifyByTemplate(stats) {
    const grid = new Int8Array(90);
    const codes = new Int8Array(90);
    const conf = new Float32Array(90);
    const rankedCodes = new Array(90);
    const hidden = new Uint8Array(90);
    const margins = new Float32Array(90);
    let hiddenCount = 0;
    let tplFail = 0;

    for (let sq = 0; sq < 90; sq++) {
      const s = stats[sq];
      if (!s || !s.patchW) { grid[sq] = EMPTY; codes[sq] = 0; continue; }

      // 河界两行（row 4/5）中央有「楚河」「汉界」和水印文字，
      // 那文字是深色的，会被墨迹判据当成棋子。这两行阈值单独抬高。
      const isRiverRow = (sq >= 4 * 9 && sq < 6 * 9);
      const inkTh = isRiverRow ? 0.22 : 0.085;

      const inkR = (typeof s.inkR === 'number') ? s.inkR : 0;
      const warmR = (typeof s.warmR === 'number') ? s.warmR : 0;

      // 【已删除「被画中画盖住的格子判未知」那段逻辑】
      //   它按「暖色占比 > 93% 且几乎无墨」+「落在浮窗矩形内」两条判据把格子抹成空。
      //   在真机抓屏上，空棋盘格也会被判成「暖色无墨」（抓屏色彩比真实截图更亮更饱和），
      //   于是半盘格子被抹空、还因为浮窗矩形框偏弹出「浮窗挡棋盘」的假提示。
      //   这条路走不通，直接去掉：格子一律按正常流程识别。

      const hasInk = (inkR >= inkTh);
      const hasFace = (warmR >= 0.28);
      if (!hasInk && !hasFace) {
        grid[sq] = EMPTY;
        codes[sq] = 0;
        continue;
      }

      // 2) 墨迹颜色定红黑；字被遮住时退回「红色占比」
      //    优先用中心 8x8 的墨迹：外圈是「上一步」的高亮圈，
      //    圈的深色描边会被算成黑墨，把刚走过的红仕判成黑兵（实测）。
      const redInkR = (typeof s.redInkR === 'number') ? s.redInkR : 0;
      const darkInkR = (typeof s.darkInkR === 'number') ? s.darkInkR : 0;
      const coreInkR = (typeof s.inkCoreR === 'number') ? s.inkCoreR : 0;
      const coreRedR = (typeof s.redInkCoreR === 'number') ? s.redInkCoreR : 0;
      const coreDarkR = (typeof s.darkInkCoreR === 'number') ? s.darkInkCoreR : 0;
      let inkRed;
      if (coreInkR >= 0.10) {
        inkRed = coreRedR >= coreDarkR;
      } else if (inkR >= inkTh) {
        inkRed = redInkR >= darkInkR;
      } else {
        inkRed = (s.redR || 0) > 0.012;
      }
      const inkColor = inkRed ? RED_PC : BLK_PC;

      // 3) 模板只用来认兵种
      const r = this.matchCell(s);
      conf[sq] = r.score;
      // 分数低到个位数 = 这一格根本没有字形。
      //
      // 为什么需要这条：上面 hasFace 是「暖色占比」，可棋盘底色本身就是暖色的，
      // 空格配上一点网格线就能过 hasFace，然后模板比出来的分数只有 0.01~0.02，
      // 随便挑个相似的兵种就填上去了 —— 实测 user_dots 的 r6c6 是空格，
      // 墨迹 0.003、模板分 0.016，被读成了红仕。
      // 真棋子在这个尺度下最低也有 0.25 以上，所以 0.10 这条线足够安全。
      if (r.score < 0.10) {
        grid[sq] = EMPTY;
        codes[sq] = 0;
        tplFail++;
        continue;
      }
      // 记下「第一名和第二名的分差」—— 分差小说明没把握，数量约束修复只动这些格子
      margins[sq] = (r.alts && r.alts.length > 1) ? (r.alts[0].score - r.alts[1].score) : 99;

      if (r.key === 'E') {
        // 模板说空。
        // 以前这里兜底成「兵/卒」，结果模板一失效就把整盘棋子全填成卒，
        // 生成一张满盘卒的 FEN，评分直接 -299。
        // 现在判空：宁可漏掉一个子，也不能把整盘搞成垃圾。
        grid[sq] = EMPTY;
        codes[sq] = 0;
        tplFail++;
        continue;
      }

      let code = (typeof r.key === 'number') ? r.key : parseInt(r.key, 10);
      if (!code) {
        grid[sq] = EMPTY;
        codes[sq] = 0;
        tplFail++;
        continue;
      }

      const codeIsRed = (code < 8);
      let finalCode;
      if (codeIsRed === inkRed) {
        finalCode = code;
      } else {
        // 颜色冲突 → 信墨迹，兵种取对应阵营的同一兵种
        const t = codeIsRed ? code : code - 7;
        finalCode = inkRed ? t : (t + 7);
      }
      grid[sq] = inkColor;
      codes[sq] = finalCode;

      // 记录候选兵种（按分数排序），供后面的「数量上限」修复用
      const alts = r.alts || [];
      const ranked = [];
      for (let ai = 0; ai < alts.length; ai++) {
        const k = (typeof alts[ai].key === 'number') ? alts[ai].key : parseInt(alts[ai].key, 10);
        if (!k) continue;
        const kRed = (k < 8);
        const t = kRed ? k : k - 7;
        const c = inkRed ? t : (t + 7);
        if (ranked.indexOf(c) < 0) ranked.push(c);
      }
      if (ranked.indexOf(finalCode) < 0) ranked.unshift(finalCode);
      rankedCodes[sq] = ranked;
    }

    // ---- 棋子数量上限修复 ----
    // 象棋每种棋子的数量是固定的，超出上限就一定是认错了：
    //   將帥1  仕2  象2  馬2  車2  炮2  兵5
    // 实测最有价值的一条：红方本来只有两个馬，某一格把带高亮圈的红俥
    // 认成紅傌，就会出现「三个馬」，改成車之后局面立刻合法。
    const LIMIT = [0, 1, 2, 2, 2, 2, 2, 5];
    // 有格子被浮窗盖住时，棋子总数本身就是错的，这时候做数量修复只会更乱
    const allowRepair = (hiddenCount === 0);
    const MARGIN_MAX = 0.35;   // 只动「第一名和第二名分差很小」的格子
    const MAX_REPAIR = 4;      // 最多改 4 格，防止雪崩
    const cnt = [new Array(8).fill(0), new Array(8).fill(0)];
    for (let sq = 0; sq < 90; sq++) {
      const v = codes[sq];
      if (!v) continue;
      if (v <= 7) cnt[0][v]++; else cnt[1][v - 7]++;
    }
    // 先修「分数差距最小」的格子（最可能认错的那个）
    const order = [];
    for (let sq = 0; sq < 90; sq++) {
      const v = codes[sq];
      if (!v) continue;
      const margin = margins[sq];
      if (margin > MARGIN_MAX) continue;   // 有把握的格子不碰
      const side = v <= 7 ? 0 : 1;
      const t = v <= 7 ? v : v - 7;
      if (allowRepair && cnt[side][t] > LIMIT[t]) order.push({ sq: sq, key: margin });
    }
    order.sort((a, b) => a.key - b.key);

    let repaired = 0;
    for (let oi = 0; oi < order.length && repaired < MAX_REPAIR; oi++) {
      const sq = order[oi].sq;
      const v = codes[sq];
      if (!v) continue;
      const side = v <= 7 ? 0 : 1;
      const t = v <= 7 ? v : v - 7;
      if (cnt[side][t] <= LIMIT[t]) continue;
      const ranked = rankedCodes[sq] || [];
      for (let ri = 0; ri < ranked.length; ri++) {
        const alt = ranked[ri];
        if (!alt || alt === v) continue;
        const as = alt <= 7 ? 0 : 1;
        const at = alt <= 7 ? alt : alt - 7;
        if (as !== side) continue;           // 红黑不改，颜色比兵种更可靠
        if (cnt[side][at] >= LIMIT[at]) continue;
        cnt[side][t]--;
        cnt[side][at]++;
        codes[sq] = alt;
        grid[sq] = alt <= 7 ? RED_PC : BLK_PC;
        repaired++;
        break;
      }
    }

    // ---- 将/帅必在：整盘找不到某一方的将帅时，把它找回来 ----
    //
    // 用户实测的现象：黑将那个位置「有棋子、是黑的，但认成了炮」。
    // 也就是说颜色和位置都对，只是兵种错（將 和 炮 字形都很密，容易混）。
    // 但象棋里一方不可能没有将帅 —— 只要某一方将帅数为 0，
    // 就说明有一个子被认成了别的兵种。这里把「将/帅在候选里排得最靠前」的那格改回来，
    // 比让整盘缺将帅强得多（缺将帅的盘面引擎根本没法算）。
    (function repairKings() {
      for (let side = 0; side < 2; side++) {
        const kingCode = side === 0 ? 1 : 8;      // 红帥 / 黑將
        let kingCount = 0;
        for (let sq = 0; sq < 90; sq++) if (codes[sq] === kingCode) kingCount++;
        if (kingCount > 0) continue;

        let bestSq = -1, bestRank = 99;
        for (let sq = 0; sq < 90; sq++) {
          const v = codes[sq];
          if (!v) continue;
          const isRed = v <= 7;
          if ((side === 0) !== isRed) continue;      // 只在本方格子里找
          if (v === kingCode) continue;
          // 别的兵种数量还没超上限时，优先别动它（说明它自己可能是对的）
          const ranked = rankedCodes[sq] || [];
          const rank = ranked.indexOf(kingCode);
          if (rank < 0) continue;
          // 该兵种已经超上限的格子，最值得改
          const t = isRed ? v : v - 7;
          const overs = cnt[side][t] > LIMIT[t] ? 0 : 10;
          const score = rank * 2 + overs;
          if (score < bestRank) { bestRank = score; bestSq = sq; }
        }
        if (bestSq >= 0) {
          const old = codes[bestSq];
          const ot = old <= 7 ? old : old - 7;
          if (cnt[side][ot] > 0) cnt[side][ot]--;
          codes[bestSq] = kingCode;
          cnt[side][1]++;
          grid[bestSq] = side === 0 ? RED_PC : BLK_PC;
          repaired++;
        }
      }
    })();

    // 把每格的置信度和候选留下来，给 App 的「识别留证」页用
    this.lastConf = Array.prototype.slice.call(conf);
    this.lastRanked = rankedCodes.map(function (a) { return a ? a.slice(0, 3) : []; });
    return { grid, conf, codes, tplFail, repaired: repaired, hidden: hidden, hiddenCount: hiddenCount };
  }

  /**
   * 三分类主入口：有模板就走模板匹配，没模板才退回颜色阈值。
   *
   * 模板匹配对光照、棋子高光、棋盘皮肤、上一步的绿圈红圈全都免疫，
   * 因为它比的是「归一化后的图案形状」，不是绝对颜色。
   */
  classify(stats, opts) {
    if (this.templates) {
      return this.classifyByTemplate(stats);
    }
    return this.classifyByColor(stats, opts);
  }

  /**
   * 颜色版三分类（仅在还没采到模板时使用）
   * 有子：暖色度（棋子棕黄、棋盘灰绿）
   * 红黑：只看红色占比（黑字永远不发红）
   */
  classifyByColor(stats, opts) {
    const o = Object.assign({
      warmTh: 0.20,
      redTh: 0.012,
    }, opts || {});

    const bg = this.bgModel;
    const warmTh = bg && typeof bg.warmThreshold === 'number' ? bg.warmThreshold : o.warmTh;

    const grid = new Int8Array(90);
    const conf = new Float32Array(90);

    for (let sq = 0; sq < 90; sq++) {
      const s = stats[sq];
      if (!s || s.n === 0) { grid[sq] = EMPTY; continue; }
      const occupied = s.warmR >= warmTh;
      conf[sq] = warmTh > 0 ? s.warmR / warmTh : 0;
      if (!occupied) { grid[sq] = EMPTY; continue; }
      grid[sq] = (s.redR > o.redTh) ? RED_PC : BLK_PC;
    }
    return { grid, conf };
  }

  /** 模板 SAD 匹配，用于歧义消解：返回与给定 patch 最相似的模板 key */
  matchTemplate(patch, colorHint) {
    if (!this.templates || !this.templates.length) return null;
    let best = null, bestD = Infinity;
    for (const t of this.templates) {
      if (colorHint !== undefined) {
        const tRed = (t.key === 1 || t.key === 2 || t.key === 3 || t.key === 4 || t.key === 5 || t.key === 6 || t.key === 7);
        if ((colorHint === RED_PC) !== tRed) continue;
      }
      let d = 0;
      const g = t.gray;
      for (let i = 0; i < patch.length; i++) {
        const diff = patch[i] - g[i];
        d += diff < 0 ? -diff : diff;
      }
      if (d < bestD) { bestD = d; best = t; }
    }
    return best ? { key: best.key, dist: bestD } : null;
  }
}

module.exports = {
  BoardRecognizer, EMPTY, RED_PC, BLK_PC,
  bilinear, homography, applyH,
  autoDetectBoard, findEvenlySpacedPeaks,
  refineByPieces, refineGrid, fitEvenLines, findPeaks1D, findPipRect, gridAlignScore
};

};

/* ---- vision/tracker ---- */
__modules["vision/tracker"] = function (module, exports, require) {
'use strict';
/*
 * 走法追踪器 —— 把「三分类画面」变成「确切的一步棋」
 *
 * 原理：
 *   上一局面已知（开局标准 FEN 锚定）。枚举全部合法走法，逐一模拟，
 *   把模拟结果压成三分类（空/红/黑），与画面识别结果逐格比对，
 *   差异格数最少且为 0（或极小）的那一步就是真实走法。
 *
 *   这一步同时完成了「兵种识别」——不用认字，兵种由规则反推。
 *   两个同兵种都能到同一格时，起点格「变空」的差异会自动把另一个排除。
 */
const C = require('../cst/constants');
const { Position } = require('../cst/position');
const { EMPTY, RED_PC, BLK_PC } = require('./recognizer');

/** 棋盘 → 三分类 */
function boardToGrid(board) {
  const g = new Int8Array(90);
  for (let sq = 0; sq < 90; sq++) {
    const pc = board[sq];
    if (!pc) g[sq] = EMPTY;
    else g[sq] = pc < 8 ? RED_PC : BLK_PC;
  }
  return g;
}

/** 开局 58 个空位（用于学习背景） */
function startEmptySquares() {
  const pos = new Position(C.START_FEN);
  const out = [];
  for (let sq = 0; sq < 90; sq++) if (pos.board[sq] === 0) out.push(sq);
  return out;
}

/** 开局 32 个棋子位置 → 兵种编码，用于采集模板 */
function startPieceMap() {
  const pos = new Position(C.START_FEN);
  const out = new Array(90).fill(0);
  for (let sq = 0; sq < 90; sq++) out[sq] = pos.board[sq];
  return out;
}

class MoveTracker {
  /**
   * @param {string} fen 起始局面（通常是开局）
   */
  constructor(fen) {
    this.pos = new Position(fen || C.START_FEN);
    this.lastGrid = boardToGrid(this.pos.board);
    this.lastMove = null;      // {move, ucci, chinese, captured}
    this.moveList = [];        // 历史走法
    this.stableFrames = 0;

    // 连续帧确认：真实走子会持续存在，识别噪声只会闪一帧。
    // 同一个走法连续被检测到 confirmFrames 次才真正落子。
    this.pendingMove = 0;
    this.pendingCount = 0;
    this.confirmFrames = 3;
  }

  get fen() { return this.pos.getFen(); }

  reset(fen) {
    this.pos = new Position(fen || C.START_FEN);
    this.lastGrid = boardToGrid(this.pos.board);
    this.lastMove = null;
    this.moveList = [];
    this.stableFrames = 0;
    this.pendingMove = 0;
    this.pendingCount = 0;
  }

  /** 当前局面三分类（引擎视角，用于显示） */
  currentGrid() { return boardToGrid(this.pos.board); }

  /**
   * 用识别到的三分类画面推断是否发生了走法
   *
   * 【算法要点】
   * 不去数「差异格数」，而是看「变化的结构」：
   *   走子 = 一个格子「有子→空」+ 另一个格子「空→有子」（吃子则是「我方色→对方色」）
   *   噪声 = 随机散落在任意格子
   * 所以先把变化分成 emptied / filled / changed 三类，
   * 没有移动结构就直接判定「局面没变」，避免被噪声带偏；
   * 有结构时再对候选走法做加权比对：起点和终点不一致重罚，其他格轻罚。
   *
   * @param {Int8Array} grid 90 格 0/1/2
   * @returns {{move:number, ucci:string, chinese:string, diff:number, candidates:number}|null}
   *          返回 null 表示局面没变（还在等对方出招）
   */
  tryAdvance(grid, maxDiff) {
    const tol = (maxDiff === undefined) ? 3 : maxDiff;
    const cur = boardToGrid(this.pos.board);

    // ---- 第一步：把差异按结构分类 ----
    const emptied = [];   // 原来有子，现在空了
    const filled = [];    // 原来空，现在有子
    const changed = [];   // 原来有子，现在还有子但颜色变了（吃子）

    for (let sq = 0; sq < 90; sq++) {
      const a = cur[sq], b = grid[sq];
      if (a === b) continue;
      if (a === 0) filled.push(sq);
      else if (b === 0) emptied.push(sq);
      else changed.push(sq);
    }

    const totalDiff = emptied.length + filled.length + changed.length;

    // 没有任何「棋子移动」的结构 → 判定为识别噪声，局面没变
    if (emptied.length === 0 && filled.length === 0 && changed.length === 0) {
      this.stableFrames++;
      return null;
    }

    // 纯噪声：变化格数很少且不成对，直接当没走
    if (totalDiff <= tol && !(emptied.length >= 1 && filled.length >= 1)) {
      this.stableFrames++;
      return null;
    }

    // ---- 第二步：枚举全部合法走法，严格区分「签名格」与「噪声格」----
    // 签名格 = 这条走法的起点和终点。它们对不上，就不是真走法。
    // 宁可拒判（回到 detectFail，浮窗继续显示上一步建议），也不要点错一步把整盘推歪。
    const moves = this.pos.genLegalMoves();
    let best = null, bestScore = 1e9, bestDiff = 999, bestSig = 999, bestNoise = 999, bestCount = 0;

    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const from = C.mvFrom(m), to = C.mvTo(m);
      const cap = this.pos.makeMove(m);
      const g2 = boardToGrid(this.pos.board);
      this.pos.unmakeMove(m, cap);

      let sig = 0, noise = 0;
      for (let sq = 0; sq < 90; sq++) {
        if (g2[sq] === grid[sq]) continue;
        if (sq === from || sq === to) sig++;
        else noise++;
      }

      // 硬门槛：签名格最多错 1 个，其他噪声格最多 4 个
      if (sig > 1 || noise > 4) continue;

      const score = sig * 10 + noise;
      if (score < bestScore) {
        bestScore = score;
        best = m;
        bestDiff = sig + noise;
        bestSig = sig;
        bestNoise = noise;
        bestCount = 1;
      } else if (score === bestScore) {
        bestCount++;
      }
    }

    if (!best) {
      this.pendingMove = 0;
      this.pendingCount = 0;
      return { move: 0, diff: totalDiff, candidates: 0, fail: true };
    }

    // ---- 连续帧确认：过滤掉只闪一帧的识别噪声 ----
    if (this.pendingMove === best) {
      this.pendingCount++;
    } else {
      this.pendingMove = best;
      this.pendingCount = 1;
    }
    if (this.pendingCount < this.confirmFrames) {
      return null;   // 还没确认，本帧先不落子（浮窗继续显示上一步建议）
    }

    this.pendingMove = 0;
    this.pendingCount = 0;

    // ---- 第三步：落子 ----
    const from = C.mvFrom(best), to = C.mvTo(best);
    const captured = this.pos.board[to];
    const chinese = this._chinese(best, this.pos.side);

    this.pos.makeMove(best);
    this.lastGrid = grid;
    this.stableFrames = 0;

    const info = {
      move: best,
      ucci: C.mvToUcci(best),
      chinese,
      captured,
      from, to,
      diff: bestDiff,
      sigDiff: bestSig,
      noiseDiff: bestNoise,
      candidates: bestCount,
      side: this.pos.side ^ 1,
      fen: this.pos.getFen()
    };
    this.lastMove = info;
    this.moveList.push(info);
    return info;
  }

  _chinese(m, side) {
    // 需要在走子前的棋盘上生成记谱，所以先克隆状态
    const save = this.pos.board.slice();
    const txt = require('../cst/notation').mvToChinese(save, m, side);
    return txt;
  }

  /** 引擎给出的建议走法 → 中文 */
  describe(boardSnapshot, ucci, side) {
    const m = C.ucciToMv(ucci);
    if (!m) return ucci;
    return require('../cst/notation').mvToChinese(boardSnapshot, m, side);
  }
}

function diffCount(a, b) {
  let d = 0;
  for (let i = 0; i < 90; i++) if (a[i] !== b[i]) d++;
  return d;
}

module.exports = {
  MoveTracker, boardToGrid, startEmptySquares, startPieceMap, diffCount
};

};

function __require(id) {
  if (__cache[id]) return __cache[id].exports;
  var m = { exports: {} };
  __cache[id] = m;
  var fn = __modules[id];
  if (!fn) throw new Error('模块未找到: ' + id);
  fn(m, m.exports, function (p) { return __require(__resolve(id, p)); });
  return m.exports;
}

function __resolve(fromId, reqPath) {
  var parts = fromId.split('/');
  parts.pop();
  var segs = reqPath.split('/');
  for (var i = 0; i < segs.length; i++) {
    if (segs[i] === '.' || segs[i] === '') continue;
    if (segs[i] === '..') parts.pop();
    else parts.push(segs[i]);
  }
  return parts.join('/');
}

var C = __require('cst/constants');
var POS = __require('cst/position');
var NOTE = __require('cst/notation');
var ENG = __require('cst/search');
var REC = __require('vision/recognizer');
var TRK = __require('vision/tracker');

/* ============================================================
 *  一站式接口 —— 给 iOS / ObjC 调用
 * ============================================================ */

/* ============================================================
 *  棋盘朝向处理
 *  用户执红时红子在下（标准朝向），执黑时 JJ象棋 会翻转棋盘、黑子在下。
 *  引擎内部统一用「红在下」的标准坐标，所以画面翻转时要翻回来。
 * ============================================================ */

/** 上下翻转一张棋子编码表 */
function flipPieceMap(map) {
  var out = new Array(90).fill(0);
  for (var sq = 0; sq < 90; sq++) {
    var v = map[sq];
    if (!v) continue;
    var r = (sq / 9) | 0, c = sq % 9;
    out[(9 - r) * 9 + c] = v;
  }
  return out;
}

/** 上下翻转一张三分类网格（返回新数组，不改原数组） */
function flipGrid(grid) {
  var out = new Int8Array(90);
  for (var sq = 0; sq < 90; sq++) {
    var r = (sq / 9) | 0, c = sq % 9;
    // ★ 必须是「旋转 180 度」，不是「上下翻转」
    //
    //   你执黑时，看盘的视角是从对面看过来 —— 相当于把棋盘在桌面里转了 180 度，
    //   行和列同时反向。原来只翻了行、列没翻，得到的是一张「左右镜像」的假局面：
    //   帅/将恰好还在九宫里（九宫左右对称），所以合法性检查也发现不了，
    //   但整盘棋子全在错的列上，引擎算出来的着法自然全废。
    out[(9 - r) * 9 + (8 - c)] = grid[sq];
  }
  return out;
}

/** 屏幕坐标 ↔ 引擎坐标（红在下）：旋转 180 度 */
function flipCodes(codes) {
  var out = new Int8Array(90);
  for (var sq = 0; sq < 90; sq++) {
    var r = (sq / 9) | 0, c = sq % 9;
    out[(9 - r) * 9 + (8 - c)] = codes[sq];
  }
  return out;
}

/* ============================================================
 *  直接把识别出的兵种编码组回 FEN
 *
 *  这才是象棋软件该有的架构：识别整盘棋子 → 组局面 → 引擎算。
 *  不依赖「从开局一步步跟踪」，所以随时中途进去也能用。
 * ============================================================ */

var PC2FEN_TABLE = ['', 'K', 'A', 'B', 'N', 'R', 'C', 'P', 'k', 'a', 'b', 'n', 'r', 'c', 'p'];

/** 只拼棋盘部分（不带走子方） */
function codesToBoardFen(codes) {
  var rows = [];
  for (var r = 0; r < 10; r++) {
    var s = '', empty = 0;
    for (var c = 0; c < 9; c++) {
      var v = codes[r * 9 + c];
      if (!v) { empty++; continue; }
      if (empty) { s += empty; empty = 0; }
      s += PC2FEN_TABLE[v] || '1';
    }
    if (empty) s += empty;
    rows.push(s);
  }
  return rows.join('/');
}

/**
 * 局面合法性校验
 *
 * 只拦「明显不合理」的情况，不做严格将帅计数校验。
 * 之前要求 redK===1 && blkK===1，结果红帅被高亮圈/绿点遮住一帧就整盘作废，
 * 浮窗直接冻住不动。宁可容忍个别格识别错，也不要让程序彻底停止工作。
 */
function validateCodes(codes) {
  var redN = 0, blkN = 0;
  for (var i = 0; i < 90; i++) {
    var v = codes[i];
    if (!v) continue;
    if (v >= 1 && v <= 7) redN++;
    else if (v >= 8 && v <= 14) blkN++;
  }
  // 棋子数不可能超过初始布局
  if (redN > 16 || blkN > 16) return false;
  // 全是空 / 只剩两三个子，说明识别彻底失败
  if (redN + blkN < 6) return false;
  return true;
}

/** 宽松版：只要不是全空就接受，用于「让程序继续工作」 */
/**
 * 有没有认出东西来。
 *
 * 只要认出至少 1 个棋子就算有结果 —— 象棋可以有只剩两个王的盘面，
 * 任何「至少 N 个子」的门槛都是瞎猜，会误杀合法残局（实测 6 子、4 子残局都栽在这上面）。
 * 真正意义上「什么都没认出来」是 0 个棋子，那种情况才不该覆盖上一局面。
 */
function codesUsable(codes) {
  for (var i = 0; i < 90; i++) if (codes[i]) return true;
  return false;
}

/**
 * 严格合法性校验：这一帧识别出来的盘面「有没有可能是一盘真棋」。
 *
 * 为什么要这道闸：真机抓屏和离线截图不完全一致，偶尔会出几帧垃圾识别。
 * 垃圾盘面一旦被显示出去，用户看到的就是「满盘车」「红帅变黑将」这种乱象，
 * 而真正该做的是：宁可继续显示上一帧合法盘面，也不要把垃圾推给用户。
 *
 * 判据（象棋规则里不可能出现的组合）：
 *   每方最多 1 个将帅、2 仕、2 相、2 马、2 车、2 炮、5 兵
 *   双方棋子总数都不能超过 16，且不能少到 5 个以下（那是识别崩了）
 *   必须有一方有将帅（至少红黑各 1 个里的一个，允许另一侧被遮挡漏读）
 */
function codesLegal(codes) {
  var LIM = [0, 1, 2, 2, 2, 2, 2, 5];   // 将 仕 相 马 车 炮 兵
  var cnt = [new Array(8).fill(0), new Array(8).fill(0)];
  var redN = 0, blkN = 0;
  for (var i = 0; i < 90; i++) {
    var v = codes[i];
    if (!v) continue;
    if (v >= 1 && v <= 7) { redN++; cnt[0][v]++; }
    else if (v >= 8 && v <= 14) { blkN++; cnt[1][v - 7]++; }
  }
  // 只拦「规则上不可能」的情况，一律是上限：
  //   每方最多 16 子（象棋不能升变，子只会少不会多）
  //   每类子不超过初始数量（将1 仕2 相2 马2 车2 炮2 兵5）
  // 【没有任何下限】
  //   只剩两个王、只剩一个车，都是合法局面；任何「至少 N 个子」的门槛
  //   都会误杀残局（实测 6 子和 4 子的残局全被误杀过）。
  if (redN > 16 || blkN > 16) return false;
  for (var s = 0; s < 2; s++) {
    for (var t = 1; t <= 7; t++) {
      if (cnt[s][t] > LIM[t]) return false;
    }
  }
  return true;
}

/* ============================================================
 *  全局会话状态（单例）
 * ============================================================ */
var session = {
  recognizer: null,
  tracker: null,
  corners: null,
  lastFen: '',
  lastResult: null,
  pending: false,
  flipped: false,          // true = 黑在下（用户执黑）
  lastGridHash: 0,
  gridStable: 0,
  lastBoardFen: '',        // 上一帧的棋盘部分（用于判断局面是否变化）
  sideToMoveNow: 'red'     // 当前该谁走
};

var JJEngine = {
  version: '1.0.0',
  C: C,

  /** 初始化 / 更新四点标定  corners = [[x,y],[x,y],[x,y],[x,y]] */
  setCorners: function (corners) {
    session.corners = corners;
    if (!session.recognizer) {
      session.recognizer = new REC.BoardRecognizer({ corners: corners, enableLowConfRefine: true });
    } else {
      session.recognizer.corners = corners.map(function (p) { return [p[0], p[1]]; });
    }
    return true;
  },

  /** 重置到指定局面（默认开局） */
  reset: function (fen) {
    session.tracker = new TRK.MoveTracker(fen || C.START_FEN);
    session.lastFen = session.tracker.fen;
    session.lastResult = null;
    session.lastGridHash = 0;
    session.gridStable = 0;
    // 逐格「上一稳定值」也清掉，否则换局后残留上一局的棋子
    session.stableCodes = null;
    session.lowStreak = null;
    session.lowConfCount = 0;
    // 稳定判定和朝向投票也要清，否则换一局后会被上一局的哈希/投票带偏
    session.lastCodesHash = -1;
    session.codesStable = 0;
    session.legalStreak = 0;
    session.illegalStreak = 0;
    session.orientVote = null;
    session.orientCount = 0;
    if (session.lastBoardFen !== undefined) session.lastBoardFen = '';
    if (session.lastRawFen !== undefined) session.lastRawFen = '';
    session.searchKey = '';
    session.searchLevel = 0;
    session.lastBudget = 0;
    return session.tracker.fen;
  },

  /** 在开局局面状态下学习棋盘背景 */
  learnBoard: function (pixels, w, h) {
    if (!session.recognizer) throw new Error('未标定');

    var stats = session.recognizer.sampleAll(pixels, w, h, true);
    session.recognizer.learnBackground(stats, []);

    var startMap = TRK.startPieceMap();

    function compare(a, b) {
      var d = 0;
      for (var i = 0; i < 90; i++) if (a[i] !== b[i]) d++;
      return d;
    }

    // ★ 朝向判定：用「颜色分类」而不是「翻转标签再学一遍」。
    //   为什么不能用模板：模板的红黑是靠标签给的，标签一翻，识别结果也跟着翻，
    //   两边永远打平（实测 diffNormal=0 且 diffFlipped=0，完全分不出来）。
    //   颜色分类只看像素本身（棋子暖色、棋盘冷色；红字发红、黑字不发红），
    //   和标签无关，才是可靠的物理判据。
    var colorCls = null;
    try { colorCls = session.recognizer.classifyByColor(stats); } catch (e) { colorCls = null; }

    var bRed = 0, bBlk = 0, tRed = 0, tBlk = 0;
    if (colorCls) {
      for (var c = 0; c < 9; c++) {
        var vb = colorCls.grid[9 * 9 + c];
        if (vb === 1) bRed++; else if (vb === 2) bBlk++;
        var vt = colorCls.grid[0 * 9 + c];
        if (vt === 1) tRed++; else if (vt === 2) tBlk++;
      }
    }

    // 手机屏幕上「棋盘最下方」永远是自己这边：
    //   下排红多 → 我执红（红在下）
    //   下排黑多 → 我执黑（JJ象棋 会翻转棋盘）
    // 上下都判不出来时，退回「谁在下方看谁」，再不行默认红。
    var flipped = false;
    if (colorCls) {
      if (bBlk > bRed + 2) {
        flipped = true;                    // 下排明显是黑
      } else if (bRed > bBlk + 2) {
        flipped = false;                   // 下排明显是红
      } else {
        // 下排看不清，用上排反推
        flipped = (tRed > tBlk + 2);
      }
    }
    session.flipped = flipped;

    // ★ 不再用第一帧去学模板。
    //   原来的做法是把第一帧当成标准开局，用开局棋子位置给模板贴标签；
    //   用户中途进对局时第一帧就是中局，标签全错（车被标成马、炮被标成兵），
    //   于是识别出来的 FEN 永远是开局 rnbakabnr/9/1c5c1/...。
    //   现在模板是离线从已知正确盘面生成、内置在引擎里的，和当前帧无关。
    //   这里只做校验，不改模板。

    // 验证：用刚学到的模板识别同一帧，和标准开局比（翻转时先翻回标准坐标）
    var clsV = session.recognizer.classify(stats);
    var verifyDiff = 999;
    if (clsV && clsV.codes) {
      var got = flipped ? flipCodes(clsV.codes) : clsV.codes;
      verifyDiff = compare(got, startMap);
    }
    var ok = (verifyDiff <= 8);

    var learned = session.recognizer.bgModel ? 1 : 0;
    var warmTh = session.recognizer.bgModel ? session.recognizer.bgModel.warmThreshold : -1;

    return {
      learned: learned,
      warmThreshold: warmTh,
      templateCount: session.recognizer.templateCount || 0,
      verifyDiff: verifyDiff,
      ok: ok,
      isOpening: ok,
      flipped: session.flipped ? 1 : 0,
      mySide: session.flipped ? 'black' : 'red',
      diffNormal: verifyDiff,
      diffFlipped: flipped ? verifyDiff : -1,
      bottomRed: bRed,
      bottomBlack: bBlk,
      topRed: tRed,
      topBlack: tBlk
    };
  },

  /** 清空学习结果，退回默认阈值模式（画面不是开局时的兜底） */
  skipLearning: function () {
    if (session.recognizer) {
      session.recognizer.bgModel = null;
      // 模板不能清空 —— 内置模板是离线从已知正确盘面生成的，
      // 清空后就只剩「纯颜色判断」，识别率会掉一大截。
      // 这里只是「重新装回内置模板」，等价于丢弃任何运行时学出来的模板。
      try {
        session.recognizer.templates = session.recognizer._buildBuiltinTemplates();
      } catch (e) { /* 保持原样 */ }
    }
    return { skipped: true };
  },

  /**
   * 自动检测棋盘四角
   * 棋盘是严格等间距的 9 竖 10 横网格，用边缘投影 + 等距约束就能定位，
   * 完全不需要用户手点。
   * @returns {Array<[number,number]>|null} [[左上],[右上],[右下],[左下]]，检测失败返回 null
   */
  autoDetectBoard: function (pixels, w, h) {
    try {
      var r = REC.autoDetectBoard(pixels, w, h);
      if (!r) return null;
      return [
        [r[0][0], r[0][1]],
        [r[1][0], r[1][1]],
        [r[2][0], r[2][1]],
        [r[3][0], r[3][1]]
      ];
    } catch (e) {
      return null;
    }
  },

  /**
   * 自动检测 + 用棋子实测校验，校验不过就明确报不通过。
   *
   * 为什么要校验：边缘投影找到的线间距可能偏小 10~20%（实测格高 59.9 vs 实际 73.3），
   * 这种误差逐行累积，到第 7 行采样点已经偏了整整一格，炮就被采到上面空格去了。
   * 检测本身没法自己发现自己错了，只能用「棋子应该落在交叉点上」来验证。
   *
   * 校验方法：网格算出来后，采 90 个格子，统计「暖色盘面」的格子数
   * 和它们到最近交叉点的偏移。棋子数太少或偏移太大 → 判定网格不可信。
   */
  /**
   * 自动检测的调试信息：初始边缘投影四角 / 棋子反推结果 / 最终走了哪条路
   */
  autoDetectDebug: function (pixels, w, h) {
    var r = null;
    try { r = JJEngine.autoDetectBoard(pixels, w, h); } catch (e) { return { error: String(e && e.message || e) }; }
    return { corners: r, debug: REC.autoDetectBoard.lastDebug || null };
  },

  autoDetectBoardChecked: function (pixels, w, h) {
    var corners = JJEngine.autoDetectBoard(pixels, w, h);
    if (!corners) return { ok: false, reason: 'no_grid' };

    // 用这组角采样，看有多少格是「有棋子盘面」
    JJEngine.setCorners(corners);
    if (!session.recognizer) return { ok: false, reason: 'no_recognizer' };
    var stats;
    try { stats = session.recognizer.sampleAll(pixels, w, h, false); } catch (e) { return { ok: false, reason: 'sample_fail' }; }

    var pieceCells = 0;
    var warmSum = 0;
    for (var i = 0; i < 90; i++) {
      var s = stats[i];
      if (!s) continue;
      var warmR = s.warmR || 0;
      if (warmR >= 0.30) { pieceCells++; warmSum += warmR; }
    }
    return {
      ok: true,
      corners: corners,
      pieceCells: pieceCells,
      avgWarm: pieceCells ? (warmSum / pieceCells) : 0,
      // 中局一般 20~32 个子，低于 8 个基本就是网格歪了
      plausible: pieceCells >= 8
    };
  },

  /** 自动检测并直接应用（一步到位） */
  autoCalibrate: function (pixels, w, h) {
    var r = JJEngine.autoDetectBoard(pixels, w, h);
    if (!r) return { ok: false };
    JJEngine.setCorners(r);
    return { ok: true, corners: r };
  },

  /** 调试：直接输出单帧的兵种识别结果（不走稳定性门槛、不写 session） */
  classifyBoard: function (pixels, w, h) {
    if (!session.recognizer) return null;
    var stats = session.recognizer.sampleAll(pixels, w, h, true);
    var cls = null;
    try { cls = session.recognizer.classify(stats); } catch (e) { return { error: String(e && e.message || e) }; }
    if (!cls || !cls.codes) return { error: 'no_codes' };
    var codes = Array.prototype.slice.call(cls.codes);
    var redN = 0, blkN = 0, details = [];
    for (var i = 0; i < 90; i++) {
      var v = codes[i];
      if (!v) continue;
      if (v >= 1 && v <= 7) redN++; else blkN++;
      details.push([i, v]);
    }
    return {
      codes: codes,
      fen: codesToBoardFen(codes),
      redN: redN,
      blkN: blkN,
      valid: validateCodes(codes),
      usable: codesUsable(codes),
      occupied: details.length,
      details: details,
      conf: session.recognizer.lastConf ? Array.prototype.slice.call(session.recognizer.lastConf) : null,
      ranked: session.recognizer.lastRanked || null
    };
  },

  /**
   * 调试：对单格做半径/偏移扫描，看「换个采样窗口这一格会变成什么」
   * @param {number} sq 格子序号 0..89
   * @param {number} scale 半径倍率（相对默认 radius）
   * @param {number} dxF cell 单位的水平偏移
   * @param {number} dyF cell 单位的垂直偏移
   */
  debugCell: function (pixels, w, h, sq, scale, dxF, dyF) {
    var rec = session.recognizer;
    if (!rec) return null;
    var pts = rec.gridPoints();
    var cell = rec.cellSize(pts);
    var radius = Math.max(3, Math.round(cell * rec.cellRadiusRatio * (scale || 1)));
    var gain = rec.estimateGain(pixels, w, h, pts);
    var cx = pts[sq * 2] + (dxF || 0) * cell;
    var cy = pts[sq * 2 + 1] + (dyF || 0) * cell;
    var s = rec.sampleCell(pixels, w, h, cx, cy, radius, true, gain);
    var m = rec.matchCell(s);
    return {
      key: m.key, score: m.score, warmRatio: m.warmRatio,
      alts: (m.alts || []).map(function (a) { return [a.key, Math.round(a.score * 1000) / 1000]; }),
      inkR: Math.round((s.inkR || 0) * 1000) / 1000,
      warmR: Math.round((s.warmR || 0) * 1000) / 1000,
      skipped: s.skipped || 0,
      cell: cell, radius: radius
    };
  },

  /** 调试：切换兵种打分方式 'dot' | 'f1' | 'mass' | 'mass:0.5'（后者同时设惩罚系数） */
  setScoreMode: function (mode) {
    if (!session.recognizer) return false;
    var parts = String(mode).split(':');
    session.recognizer.scoreMode = parts[0];
    if (parts.length > 1) session.recognizer.massK = parseFloat(parts[1]);
    return session.recognizer.scoreMode === parts[0];
  },

  /** 调试：输出 90 个格子的原始特征，用来定位「哪一格为什么判错」 */
  debugSample: function (pixels, w, h) {
    if (!session.recognizer) return null;
    var stats = session.recognizer.sampleAll(pixels, w, h, true);
    var out = [];
    for (var i = 0; i < 90; i++) {
      var s = stats[i] || {};
      out.push([
        i,
        Math.round((s.inkR || 0) * 1000) / 1000,
        Math.round((s.warmR || 0) * 1000) / 1000,
        Math.round((s.redInkR || 0) * 1000) / 1000,
        Math.round((s.darkInkR || 0) * 1000) / 1000,
        Math.round((s.redR || 0) * 1000) / 1000,
        s.skipped || 0
      ]);
    }
    return out;
  },

  /**
   * 主流程：喂一帧 RGBA 像素，返回识别 + 建议
   * @param {Uint8ClampedArray|Uint8Array} pixels RGBA
   * @param {number} w
   * @param {number} h
   * @param {object} opts { timeMs, autoReset }
   * @returns {object}
   */
  process: function (pixels, w, h, opts) {
    opts = opts || {};
    if (!session.recognizer) throw new Error('未标定');
    if (!session.tracker) JJEngine.reset();

    // 模板匹配需要 patch，所以这里必须采
    var stats = session.recognizer.sampleAll(pixels, w, h, true);
    var cls = session.recognizer.classify(stats);

    // ★ 逐格置信度 + 保留上一稳定值
    //
    // 为什么需要：JJ象棋 在落子瞬间会把刚走的棋子放大 1.25 倍并偏移十几像素
    // （还有红圈/白圈/绿点），那一两帧的模板分数会掉到 0.2 左右（正常 1.3~2.7），
    // 于是红仕被判成红兵。这些效果「只在特定时候出现」，是瞬时干扰。
    //
    // 做法：分数够高的格子直接采信；分数太低的格子沿用上一帧的稳定值，
    // 连续多帧都低才认这一次的结果（避免被一个动画帧永久带偏）。
    var LOWCONF = 0.55;
    var prevCodes = session.stableCodes;
    var mergedCodes = new Array(90);
    var lowConfCount = 0;
    for (var sm = 0; sm < 90; sm++) {
      var raw = cls.codes ? cls.codes[sm] : 0;
      var conf = cls.conf ? (cls.conf[sm] || 0) : 1;
      var st = stats[sm];
      var warm = st ? (st.warmR || 0) : 0;
      var okCell;
      if (!raw) {
        // 判空：暖色占比确实很低才可信
        okCell = (warm < 0.12);
      } else {
        okCell = (conf >= LOWCONF);
      }
      if (!okCell) lowConfCount++;
      if (okCell || !prevCodes || prevCodes[sm] === undefined || prevCodes[sm] === null) {
        mergedCodes[sm] = raw;
        session.lowStreak = session.lowStreak || new Array(90).fill(0);
        session.lowStreak[sm] = 0;
      } else if ((session.lowStreak[sm] = (session.lowStreak[sm] || 0) + 1) >= 8) {
        // 连续 8 帧都不确定，就接受新值，免得永远卡在旧局面上
        mergedCodes[sm] = raw;
        session.lowStreak[sm] = 0;
      } else {
        mergedCodes[sm] = prevCodes[sm];
      }
    }
    if (cls.codes) cls.codes = mergedCodes;
    session.lowConfCount = lowConfCount;

    // 画面翻转时（用户执黑）翻回标准坐标，引擎内部一律「红在下」
    //
    // ★ 朝向改成每帧重判，不再只信 learnBoard 那一帧的结论。
    //   之前 session.flipped 只在 learnBoard 时定一次，之后永不更新：
    //   learnBoard 那一帧如果刚好没读准，或者你换了执红/执黑，
    //   朝向就一直错着，着法自然全是乱的（浮窗还会把「你执黑」写成「你执红」）。
    //   判据：看底部两行（第 8、9 行）以哪一方棋子为主 —— 玩家自己永远在下方。
    //   只有双方数量差 ≥3 才投票，且要连续 2 帧一致才改，避免中途抖动。
    (function detectOrientation(codes) {
      // ★ 朝向改用「走不出自己半场」的棋子投票，不再数底两行的颜色
      //
      // 老判据是「屏幕底两行哪种颜色多，哪种就是玩家」。这在开局没问题，
      // 但残局会直接反掉：「雨打芭蕉 编号:19」里黑方 5 个子已经压到红方底线，
      // 底两行黑 6 红 2，于是被判成「玩家执黑」——
      // 整盘翻面、引擎 FEN 全反，我方得分算出 -29999（自己被将死），着法全废。
      //
      // 帅/将出不了九宫（红帅只可能在下三行、黑将只可能在上三行），
      // 仕/士同样只在九宫，相/象过不了河 —— 这些都是「位置锁定」的棋子，
      // 拿它们投票，对方冲到哪都不会干扰。
      var s = 0;
      for (var i = 0; i < 90; i++) {
        var c = codes[i];
        if (!c) continue;
        var row = (i / 9) | 0;
        if (c === 1) s += (row >= 5 ? 6 : -6);          // 红帅在下方 → 画面正常
        else if (c === 8) s += (row <= 4 ? 6 : -6);     // 黑将在上方 → 画面正常
        else if (c === 2) s += (row >= 5 ? 2 : -2);     // 红仕只能在下方九宫
        else if (c === 9) s += (row <= 4 ? 2 : -2);
        else if (c === 3) s += (row >= 5 ? 1 : -1);     // 红相过不了河
        else if (c === 10) s += (row <= 4 ? 1 : -1);
      }
      var vote = null;
      if (s >= 3) vote = 'red';        // 红在下 → 我执红
      else if (s <= -3) vote = 'black'; // 红在上 → 我执黑
      if (!vote) {
        // 将帅都没认出来时，退回老办法（底两行颜色），聊胜于无
        var r2 = 0, b2 = 0;
        for (var rr = 8; rr <= 9; rr++) {
          for (var cc = 0; cc < 9; cc++) {
            var code2 = codes[rr * 9 + cc];
            if (code2 >= 1 && code2 <= 7) r2++; else if (code2 >= 8) b2++;
          }
        }
        if (b2 >= r2 + 3) vote = 'black';
        else if (r2 >= b2 + 3) vote = 'red';
        if (!vote) return;
      }
      if (vote === session.orientVote) {
        session.orientCount = (session.orientCount || 0) + 1;
      } else {
        session.orientVote = vote;
        session.orientCount = 1;
      }
      if (!session.orientSeen || (session.orientCount || 0) >= 2) {
        session.orientSeen = true;
        session.flipped = (vote === 'black');
      }
    })(cls.codes);

    var grid = session.flipped ? flipGrid(cls.grid) : cls.grid;

    // ★ 我执红还是执黑：由画面朝向决定（黑在下 = 我执黑，红在下 = 我执红）
    var mySideDetected = session.flipped ? 'black' : 'red';
    var bottomRed = mySideDetected === 'red' ? 1 : 0;
    var bottomBlack = mySideDetected === 'black' ? 1 : 0;

    // 1) 尝试推进一步棋
    // ★ 画面稳定性检测
    //   落子动画、高亮圈闪烁会让同一局面在相邻帧里识别出不同结果，
    //   如果每帧都拿去匹配走法，tracker 会被误判推着往前跑（而且退不回来），
    //   表现就是「一会这样一会那样，一会又等对方走」。
    //   所以要求连续 2 帧识别结果完全一致，才认为画面稳定、才做走法判定。
    var gridHash = 0;
    for (var gi = 0; gi < 90; gi++) {
      gridHash = ((gridHash * 31) + grid[gi]) | 0;
    }
    if (session.lastGridHash === gridHash) {
      session.gridStable = (session.gridStable || 0) + 1;
    } else {
      session.gridStable = 0;
      session.lastGridHash = gridHash;
    }
    var isStable = (session.gridStable >= 1);

    var out = {
      grid: Array.prototype.slice.call(grid),
      fen: session.tracker.fen,
      moveDetected: false,
      mySide: mySideDetected,
      bottomRed: bottomRed,
      bottomBlack: bottomBlack,
      stable: isStable ? 1 : 0,
      // 遮挡提示已删除：真机抓屏下「暖色无墨」这个判据连空棋盘格都会命中，
      // 会导致半盘被抹空 + 假报「挡住」。恒为 0，App 不再显示该提示。
      pipOverlap: 0,
      hiddenCells: 0
    };

    // ★ 主路径：直接把识别出的兵种组回 FEN
    //   这才是象棋软件该有的做法 —— 不依赖「从开局一步步跟踪」，
    //   所以哪怕你中途进对局，也能立刻认出当前局面并给出下一步。
    //
    //   关键：识别结果必须先稳定下来才更新局面。
    //   采样点只要偏几像素，相邻帧可能把同一个棋子识别成不同兵种，
    //   FEN 每帧都不一样，着法就会乱跳（实测同一开局给出过相三进五/兵四进一/兵三进一三个答案）。
    var directFen = null;
    var codesOk = false;
    var codesHash = 0;
    if (cls.codes) {
      for (var ci = 0; ci < 90; ci++) {
        codesHash = ((codesHash * 31) + cls.codes[ci]) | 0;
      }
    }
    if (session.lastCodesHash === codesHash) {
      session.codesStable = (session.codesStable || 0) + 1;
    } else {
      session.codesStable = 0;
      session.lastCodesHash = codesHash;
    }
    // 要求连续 3 帧识别结果完全一致才认为局面定下来了。
    // 2 帧门槛太低：一次落子动画 + 高亮圈切换就能凑够两帧抖动。
    var codesSettled = (session.codesStable >= 2);

    // 第一帧只要认出来就直接落地，不再等「3 帧完全一致」。
    //   之前一律要求 3 帧一致才更新，结果中途进对局时识别在两组结果之间抖
    //   （几个高亮格来回翻），永远凑不出 3 帧一致，浮窗就一直是开局的棋盘。
    //   现在：第一次落地无条件（限流照旧），之后才要求稳定，抖动照样挡得住。
    var firstLatch = !session.lastBoardFen;
    // ★ 合法性闸门
    //   真机抓屏偶尔会出几帧垃圾识别（满盘车、红帅变黑将之类）。
    //   与其把垃圾显示出去，不如继续显示上一帧合法盘面 ——
    //   你看到的永远是「一盘真棋」，不会是乱码盘。
    var legalNow = cls.codes && codesLegal(session.flipped ? flipCodes(cls.codes) : cls.codes);
    if (!legalNow) {
      session.legalStreak = 0;
      session.illegalStreak = (session.illegalStreak || 0) + 1;
      // 连续 12 帧都不合法 → 清掉旧局面，让下一帧合法识别重新落地（别卡死在一个错盘面上）
      if (session.illegalStreak > 12) {
        session.lastBoardFen = '';
        session.lastRawFen = '';
        session.lastResult = null;
        session.illegalStreak = 0;
      }
    } else {
      session.illegalStreak = 0;
      session.legalStreak = (session.legalStreak || 0) + 1;
    }

    if (legalNow && (firstLatch || codesSettled) && cls.codes && codesUsable(cls.codes)) {
      // 两套 FEN，别再混用：
      //   rawFen = 屏幕原样（给浮窗显示，必须跟你眼睛看到的一模一样）
      //   engFen = 引擎内部坐标（红永远在下，给算棋用）
      // 你执黑时这两套是上下相反的。之前只存了一套、还按屏幕方向去算棋，
      // 引擎会把黑方当红方，着法自然全错。
      var rawFen = codesToBoardFen(cls.codes);
      var engCodes = session.flipped ? flipCodes(cls.codes) : cls.codes;
      var boardFen = codesToBoardFen(engCodes);
      // 局面更新限流：最多每 700ms 换一次。
      // 识别偶尔抖动时，靠这道闸门挡住「一秒内连换五个着法」的情况。
      var nowMs = Date.now();
      var canUpdate = (!session.lastFenUpdateTime) || (nowMs - session.lastFenUpdateTime > 700);

      session.lastRawFen = rawFen;

      if (boardFen !== session.lastBoardFen && canUpdate) {
        session.lastBoardFen = boardFen;
        session.lastFenUpdateTime = nowMs;
        out.moveDetected = true;
        session.lastResult = null;    // 强制重算
        session.stableCodes = mergedCodes.slice();
      } else if (!session.lastBoardFen) {
        // 第一次进来先落地，不占用限流
        session.lastBoardFen = boardFen;
        session.lastFenUpdateTime = nowMs;
        out.moveDetected = true;
        session.lastResult = null;
        session.stableCodes = mergedCodes.slice();
      }
      // 局面没变也要更新「上一稳定值」，这样高置信度的格子能持续收敛
      if (!session.stableCodes) session.stableCodes = mergedCodes.slice();
      codesOk = true;

      // FEN 的走子方一律取「我方」。
      // 之前绕了一个 session.sideToMoveNow 变量，它和 mySide 会不同步，
      // 结果就是「显示我执红、却一直说等对方走」。
      // 你的诉求是「告诉我我该走哪步」，所以引擎永远站在我方算。
      directFen = session.lastBoardFen + ' ' +
        (mySideDetected === 'red' ? 'w' : 'b') + ' - - 0 1';
      // 浮窗显示用「屏幕原样」的 FEN：你执黑时它就是黑在下，
      // 跟你眼睛看到的完全一致。算棋用的是 directFen（内部坐标，红永远在下）。
      out.fen = (session.lastRawFen || session.lastBoardFen) + ' ' +
        (mySideDetected === 'red' ? 'w' : 'b') + ' - - 0 1';
      out.recognized = 1;
      out.conf90 = session.recognizer.lastConf || null;
      out.tops90 = session.recognizer.lastRanked || null;
      out.engineFen = directFen;
      out.sideToMove = mySideDetected;
      try { session.tracker.pos.setFen(directFen); } catch (e) {}
    } else {
      // 还在等识别稳定，沿用上一次的结论
      // 【别再拿「开局盘面」冒充识别结果】
      //   以前这里兜底成 session.tracker.fen（= 开局 FEN），
      //   于是识别彻底失败时界面会显示一盘完整的开局、还说「识别完成 · 32 个子」。
      //   现在没有识别结果就返回空串，让上层明确报「没认出来」。
      out.fen = session.lastRawFen || session.lastBoardFen || '';
      out.recognized = out.fen ? 1 : 0;
      if (isStable) {
        var mv2 = session.tracker.tryAdvance(grid, 1);
        if (mv2 && !mv2.fail) {
          out.moveDetected = true;
          out.move = mv2.ucci;
          out.moveChinese = mv2.chinese;
        }
      }
    }
    out.codesValid = codesOk ? 1 : 0;
    out.codesSettled = codesSettled ? 1 : 0;

    // 2) 到了我方走 → 算棋
    var analyzeFen = directFen || session.tracker.fen;
    if (out.moveDetected || !session.lastResult || session.lastFen !== analyzeFen) {
      var t0 = Date.now();
      var res = ENG.analyze(analyzeFen, { timeMs: opts.timeMs || 800 });
      var pos = new POS.Position(analyzeFen);
      var mv = C.ucciToMv(res.bestmove);

      // 完整缓存：中文着法、起止格、分值、胜率、深度、走子方
      // 否则下一帧走缓存分支时，着法就丢了，浮窗会退回「识别中…」
      session.lastFen = analyzeFen;
      session.lastResult = {
        bestmove: res.bestmove,
        chinese: res.bestmove ? NOTE.mvToChinese(pos.board, mv, pos.side) : '',
        from: res.bestmove ? C.mvFrom(mv) : -1,
        to: res.bestmove ? C.mvTo(mv) : -1,
        score: res.score,
        scoreText: (res.score >= 0 ? '+' : '') + (res.score / 100).toFixed(2),
        winrate: Math.round(res.winrate * 1000) / 10,
        depth: res.depth,
        pv: res.pv,
        nodes: res.nodes,
        mate: res.mate,
        sideToMove: pos.side === C.RED ? 'red' : 'black'
      };

      var c = session.lastResult;
      out.suggest = c.bestmove;
      out.suggestChinese = c.chinese;
      out.from = c.from;
      out.to = c.to;
      out.score = c.score;
      out.scoreText = c.scoreText;
      out.winrate = c.winrate;
      out.depth = c.depth;
      out.pv = c.pv;
      out.nodes = c.nodes;
      out.elapsed = Date.now() - t0;
      out.sideToMove = c.sideToMove;
      out.mate = c.mate;
    } else {
      // 局面没变：直接把上一次的完整结论端出来，不要清空
      var c2 = session.lastResult || {};
      out.suggest = c2.bestmove || '';
      out.suggestChinese = c2.chinese || '';
      out.from = (c2.from === undefined) ? -1 : c2.from;
      out.to = (c2.to === undefined) ? -1 : c2.to;
      out.score = c2.score || 0;
      out.scoreText = c2.scoreText || '+0.00';
      out.winrate = (c2.winrate === undefined) ? 50 : c2.winrate;
      out.depth = c2.depth || 0;
      out.sideToMove = c2.sideToMove || 'red';
      out.mate = c2.mate || 0;
    }

    return out;
  },

  /** 直接分析一个 FEN（不走视觉） */
  /**
   * 多候选着法：界面上的「思考列表」
   * 返回 {bestmove, score, depth, nodes, ms, rows:[{move, chinese, score, winrate, depth}]}
   */
  analyzeTop: function (fen, opts) {
    try {
      return ENG.analyzeTop(fen, opts || {});
    } catch (e) {
      return { bestmove: '', score: 0, depth: 0, nodes: 0, ms: 0, rows: [] };
    }
  },
  analyzeFen: function (fen, timeMs) {
    var res = ENG.analyze(fen, { timeMs: timeMs || 1000 });
    var pos = new POS.Position(fen);
    var mv = C.ucciToMv(res.bestmove);
    return {
      bestmove: res.bestmove,
      chinese: res.bestmove ? NOTE.mvToChinese(pos.board, mv, pos.side) : '',
      score: res.score,
      scoreText: (res.score >= 0 ? '+' : '') + (res.score / 100).toFixed(2),
      winrate: Math.round(res.winrate * 1000) / 10,
      depth: res.depth,
      pv: res.pv,
      nodes: res.nodes,
      mate: res.mate,
      from: res.bestmove ? C.mvFrom(mv) : -1,
      to: res.bestmove ? C.mvTo(mv) : -1
    };
  },

  /** 当前局面 */
  currentFen: function () { return session.tracker ? session.tracker.fen : C.START_FEN; },

  /** 手动修正局面（识别错了的时候用） */
  forceSetFen: function (fen) {
    session.tracker = new TRK.MoveTracker(fen);
    session.lastFen = fen;
    session.lastResult = null;
    return session.tracker.fen;
  },

  /** 调试：把一个 FEN 渲染成 90 格三分类（验证追踪逻辑） */
  fenToGrid: function (fen) {
    var pos = new POS.Position(fen);
    return Array.prototype.slice.call(TRK.boardToGrid(pos.board));
  },

  /** 棋盘 → 每个交叉点在该帧中的像素坐标，给 UI 画箭头用 */
  gridPoints: function () {
    if (!session.recognizer) return [];
    var pts = session.recognizer.gridPoints();
    var out = [];
    for (var i = 0; i < 90; i++) out.push([pts[i * 2], pts[i * 2 + 1]]);
    return out;
  }
};

global.JJEngine = JJEngine;
if (typeof module !== 'undefined' && module.exports) module.exports = JJEngine;

})(typeof globalThis !== 'undefined' ? globalThis : this);
