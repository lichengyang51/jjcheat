/* ============================================================
 *  JJ象棋 辅助引擎内核 —— 单文件打包
 *  目标运行环境: iOS JavaScriptCore / Node / 浏览器
 *  生成时间: 2026-10-29T11:06:20.791Z
 *  模块数: 7
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
function analyze(fen, opts) {
  if (!_shared) _shared = new Searcher();
  const pos = new Position(fen);
  const res = _shared.search(pos, (opts && opts.timeMs) || 1200, (opts && opts.maxDepth) || 0);
  return res;
}

module.exports = {
  Searcher, analyze, scoreToWinrate,
  MATE, MATE_BOUND, INF
};

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

class BoardRecognizer {
  /**
   * @param {object} cfg
   *   corners: [[x,y]x4] 屏幕像素坐标，顺序 [左上, 右上, 右下, 左下]
   *   cellRadiusRatio: 采样半径占格距的比例，默认 0.40
   *   bgModel: 可选的已学习背景模型
   */
  constructor(cfg) {
    this.corners = cfg.corners ? cfg.corners.map(p => [p[0], p[1]]) : null;
    this.cellRadiusRatio = cfg.cellRadiusRatio || 0.40;
    this.bgModel = cfg.bgModel || null;
    this.templates = cfg.templates || null; // [{key, w, h, gray:Uint8Array}]
    this.lastStats = null;
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

  /** 格距估算（像素） */
  cellSize(pts) {
    const dx = pts[2] - pts[0];
    const dy = pts[3] - pts[1];
    return Math.hypot(dx, dy) / 8;
  }

  /**
   * 采样一个交叉点周围的特征
   * @returns {{meanL, redR, darkR, brightR, n, patch:Uint8Array|null}}
   */
  sampleCell(pixels, w, h, cx, cy, radius, wantPatch) {
    let n = 0, sumL = 0, red = 0, dark = 0, bright = 0;
    // 环带：跳过最中心（那里可能被上一帧的箭头/高亮遮挡）
    const step = Math.max(1, Math.floor(radius / 4));
    const r2 = radius * radius;
    const inner = (radius * 0.18) * (radius * 0.18);

    // 灰度 patch（16x16）用于模板
    const PW = 16;
    const patch = wantPatch ? new Uint8Array(PW * PW) : null;
    const pw = wantPatch ? (radius * 2) / PW : 0;

    for (let dy = -radius; dy <= radius; dy += step) {
      for (let dx = -radius; dx <= radius; dx += step) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const x = Math.round(cx + dx);
        const y = Math.round(cy + dy);
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        const i = (y * w + x) * 4;
        const R = pixels[i], G = pixels[i + 1], B = pixels[i + 2];
        const L = 0.299 * R + 0.587 * G + 0.114 * B;
        sumL += L; n++;
        if (R > 85 && (R - G) > 45 && (R - B) > 45) red++;
        if (L < 72) dark++;
        if (L > 178) bright++;
        if (d2 >= inner) { /* 全部计入 */ }

        if (wantPatch) {
          const px = Math.min(PW - 1, Math.max(0, Math.floor((dx + radius) / pw)));
          const py = Math.min(PW - 1, Math.max(0, Math.floor((dy + radius) / pw)));
          patch[py * PW + px] = L;
        }
      }
    }
    if (n === 0) return { meanL: 0, redR: 0, darkR: 0, brightR: 0, n: 0, patch };
    return {
      meanL: sumL / n,
      redR: red / n,
      darkR: dark / n,
      brightR: bright / n,
      n,
      patch
    };
  }

  /** 全盘采样，返回 90 个特征 */
  sampleAll(pixels, w, h, wantPatch) {
    const pts = this.gridPoints();
    const cell = this.cellSize(pts);
    const radius = Math.max(3, Math.round(cell * this.cellRadiusRatio));
    const out = new Array(90);
    for (let sq = 0; sq < 90; sq++) {
      out[sq] = this.sampleCell(pixels, w, h, pts[sq * 2], pts[sq * 2 + 1], radius, wantPatch);
    }
    this.lastStats = { pts, cell, radius };
    return out;
  }

  /**
   * 从已知空位学习背景模型
   * @param {Array} stats sampleAll 的结果
   * @param {number[]} emptySquares 已知为空的格子
   */
  learnBackground(stats, emptySquares) {
    const vals = emptySquares.map(sq => stats[sq]).filter(s => s && s.n > 0);
    if (!vals.length) return null;
    const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = (arr, m) => Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length);
    const Ls = vals.map(v => v.meanL);
    const Rs = vals.map(v => v.redR);
    const Ds = vals.map(v => v.darkR);
    const Bs = vals.map(v => v.brightR);
    const mL = mean(Ls), sL = Math.max(3, std(Ls, mL));
    const mR = mean(Rs), sR = Math.max(0.004, std(Rs, mR));
    const mD = mean(Ds), sD = Math.max(0.004, std(Ds, mD));
    const mB = mean(Bs), sB = Math.max(0.01, std(Bs, mB));
    this.bgModel = {
      meanL: mL, stdL: sL,
      meanRed: mR, stdRed: sR,
      meanDark: mD, stdDark: sD,
      meanBright: mB, stdBright: sB
    };
    return this.bgModel;
  }

  /** 从已知局面学习棋子模板（用于歧义消解 + 兵种校验） */
  learnTemplates(stats, boardPieceAt) {
    const tpl = [];
    for (let sq = 0; sq < 90; sq++) {
      const t = boardPieceAt[sq];
      if (!t) continue;
      const s = stats[sq];
      if (!s || !s.patch) continue;
      tpl.push({ key: t, sq, gray: s.patch, w: 1, redR: s.redR, darkR: s.darkR });
    }
    this.templates = tpl;
    return tpl;
  }

  /**
   * 三分类：返回 Int8Array(90)，0=空 1=红 2=黑
   * 依赖 this.bgModel；若无模型则用绝对阈值兜底
   */
  classify(stats, opts) {
    const o = Object.assign({
      occBrightR: 0.16,  // 亮色占比达到此值 → 有子
      occDeltaL: 16,     // 或与背景亮度差超过此值
      redTh: 0.030,      // 红色字占比 → 红子
      darkTh: 0.045,     // 深色字占比 → 黑子
      confTh: 0.02
    }, opts || {});

    const bg = this.bgModel;
    const grid = new Int8Array(90);
    const conf = new Float32Array(90);

    for (let sq = 0; sq < 90; sq++) {
      const s = stats[sq];
      if (!s || s.n === 0) { grid[sq] = EMPTY; continue; }

      let occupied;
      if (bg) {
        const dL = Math.abs(s.meanL - bg.meanL);
        const dBr = s.brightR - bg.meanBright;
        const scoreOcc = (dBr / o.occBrightR) * 0.6 + (dL / o.occDeltaL) * 0.4;
        occupied = scoreOcc > 1.0;
        conf[sq] = scoreOcc;
      } else {
        occupied = s.brightR > o.occBrightR || s.meanL > 190;
        conf[sq] = s.brightR / o.occBrightR;
      }

      if (!occupied) { grid[sq] = EMPTY; continue; }

      // 有子 → 判红/黑
      const isRed = s.redR > o.redTh;
      const isBlk = s.darkR > o.darkTh;
      if (isRed && !isBlk) grid[sq] = RED_PC;
      else if (isBlk && !isRed) grid[sq] = BLK_PC;
      else if (isRed && isBlk) grid[sq] = s.redR > s.darkR ? RED_PC : BLK_PC;
      else {
        // 字迹太淡：用背景对比兜底 —— 落在红子模板均值附近就判红
        grid[sq] = s.redR >= s.darkR ? RED_PC : BLK_PC;
      }
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
  bilinear, homography, applyH
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
  }

  get fen() { return this.pos.getFen(); }

  reset(fen) {
    this.pos = new Position(fen || C.START_FEN);
    this.lastGrid = boardToGrid(this.pos.board);
    this.lastMove = null;
    this.moveList = [];
    this.stableFrames = 0;
  }

  /** 当前局面三分类（引擎视角，用于显示） */
  currentGrid() { return boardToGrid(this.pos.board); }

  /**
   * 用识别到的三分类画面推断是否发生了走法
   * @param {Int8Array} grid 90 格 0/1/2
   * @param {number} maxDiff 允许的差异格数（识别噪声容忍）
   * @returns {{move:number, ucci:string, chinese:string, diff:number, candidates:number}|null}
   *          返回 null 表示局面没变（还在等对方出招）
   */
  tryAdvance(grid, maxDiff) {
    const tol = (maxDiff === undefined) ? 1 : maxDiff;
    const cur = boardToGrid(this.pos.board);

    // 先看画面跟当前局面是否已经一致 → 没变化
    const sameDiff = diffCount(cur, grid);
    if (sameDiff <= tol) {
      this.stableFrames++;
      return null;
    }

    // 枚举全部合法走法，找差异最小的
    const moves = this.pos.genLegalMoves();
    let best = null, bestDiff = 999, secondDiff = 999, bestCount = 0;

    const capBuf = [];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const cap = this.pos.makeMove(m);
      const g2 = boardToGrid(this.pos.board);
      this.pos.unmakeMove(m, cap);
      const d = diffCount(g2, grid);
      if (d < bestDiff) {
        secondDiff = bestDiff;
        bestDiff = d;
        best = m;
        bestCount = 1;
      } else if (d === bestDiff) {
        bestCount++;
      } else if (d < secondDiff) {
        secondDiff = d;
      }
    }

    if (!best || bestDiff > tol) {
      return { move: 0, diff: bestDiff, candidates: bestCount, fail: true };
    }
    // 有并列最优（理论上极少）→ 交给上层用模板/人工裁决
    if (bestCount > 1 && secondDiff <= bestDiff) {
      // 仍取第一个，但标记
    }

    // 落子
    const from = C.mvFrom(best), to = C.mvTo(best);
    const captured = this.pos.board[to];
    const chinese = this._chinese(best, this.pos.side);

    const applied = best;
    this.pos.makeMove(best);
    this.lastGrid = grid;
    this.stableFrames = 0;

    const info = {
      move: applied,
      ucci: C.mvToUcci(applied),
      chinese,
      captured,
      from, to,
      diff: bestDiff,
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

/**
 * 全局会话状态（单例）
 */
var session = {
  recognizer: null,
  tracker: null,
  corners: null,
  lastFen: '',
  lastResult: null,
  pending: false
};

var JJEngine = {
  version: '1.0.0',
  C: C,

  /** 初始化 / 更新四点标定  corners = [[x,y],[x,y],[x,y],[x,y]] */
  setCorners: function (corners) {
    session.corners = corners;
    if (!session.recognizer) {
      session.recognizer = new REC.BoardRecognizer({ corners: corners });
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
    return session.tracker.fen;
  },

  /** 在开局局面状态下学习棋盘背景（必须画面正好是开局） */
  learnBoard: function (pixels, w, h) {
    if (!session.recognizer) throw new Error('未标定');

    // 先备份：验证不通过要回滚，绝不能让错误的背景模型留下来污染识别
    var backupBg = session.recognizer.bgModel;
    var backupTpl = session.recognizer.templates;

    var stats = session.recognizer.sampleAll(pixels, w, h, true);
    var empty = TRK.startEmptySquares();
    session.recognizer.learnBackground(stats, empty);
    session.recognizer.learnTemplates(stats, TRK.startPieceMap());

    // ---- 学完立刻用学到的模型识别同一帧，验证画面到底是不是开局 ----
    var verifyDiff = -1;
    var ok = false;
    try {
      var cls = session.recognizer.classify(stats);
      var expectedPos = new POS.Position(C.START_FEN);
      var expected = TRK.boardToGrid(expectedPos.board);
      var d = 0;
      for (var i = 0; i < 90; i++) {
        if (cls.grid[i] !== expected[i]) d++;
      }
      verifyDiff = d;
      ok = (d <= 3);
    } catch (e) {
      verifyDiff = -2;
      ok = false;
    }

    if (!ok) {
      // 回滚，保持干净状态
      session.recognizer.bgModel = backupBg;
      session.recognizer.templates = backupTpl;
    }

    return {
      bgMeanL: session.recognizer.bgModel ? session.recognizer.bgModel.meanL : -1,
      templateCount: session.recognizer.templates ? session.recognizer.templates.length : 0,
      verifyDiff: verifyDiff,
      ok: ok
    };
  },

  /** 清空学习结果，退回默认阈值模式（画面不是开局时的兜底） */
  skipLearning: function () {
    if (session.recognizer) {
      session.recognizer.bgModel = null;
      session.recognizer.templates = null;
    }
    return { skipped: true };
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

    var stats = session.recognizer.sampleAll(pixels, w, h, false);
    var cls = session.recognizer.classify(stats);
    var grid = cls.grid;

    // 1) 尝试推进一步棋
    var moved = session.tracker.tryAdvance(grid, opts.maxDiff === undefined ? 1 : opts.maxDiff);

    var out = {
      grid: Array.prototype.slice.call(grid),
      fen: session.tracker.fen,
      moveDetected: false
    };

    if (moved && !moved.fail) {
      out.moveDetected = true;
      out.move = moved.ucci;
      out.moveChinese = moved.chinese;
      out.moveSide = moved.side === C.RED ? 'red' : 'black';
      out.diff = moved.diff;
      // 重新同步上一帧网格
      session.tracker.lastGrid = grid;
    } else if (moved && moved.fail) {
      out.detectFail = true;
      out.detectDiff = moved.diff;
    }

    // 2) 到了我方走 → 算棋
    if (out.moveDetected || !session.lastResult || session.lastFen !== session.tracker.fen) {
      var t0 = Date.now();
      var res = ENG.analyze(session.tracker.fen, { timeMs: opts.timeMs || 800 });
      session.lastFen = session.tracker.fen;
      session.lastResult = res;

      var pos = new POS.Position(session.tracker.fen);
      var mv = C.ucciToMv(res.bestmove);
      out.suggest = res.bestmove;
      out.suggestChinese = res.bestmove ? NOTE.mvToChinese(pos.board, mv, pos.side) : '';
      out.from = res.bestmove ? C.mvFrom(mv) : -1;
      out.to = res.bestmove ? C.mvTo(mv) : -1;
      out.score = res.score;
      out.scoreText = (res.score >= 0 ? '+' : '') + (res.score / 100).toFixed(2);
      out.winrate = Math.round(res.winrate * 1000) / 10;
      out.depth = res.depth;
      out.pv = res.pv;
      out.nodes = res.nodes;
      out.elapsed = Date.now() - t0;
      out.sideToMove = pos.side === C.RED ? 'red' : 'black';
      out.mate = res.mate;
    } else {
      out.suggest = session.lastResult ? session.lastResult.bestmove : '';
      out.suggestChinese = '';
      out.score = session.lastResult ? session.lastResult.score : 0;
      out.scoreText = ((out.score >= 0 ? '+' : '') + (out.score / 100).toFixed(2));
      out.winrate = session.lastResult ? Math.round(session.lastResult.winrate * 1000) / 10 : 50;
      out.depth = session.lastResult ? session.lastResult.depth : 0;
    }

    return out;
  },

  /** 直接分析一个 FEN（不走视觉） */
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
