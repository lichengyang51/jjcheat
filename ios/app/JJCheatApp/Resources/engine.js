/* ============================================================
 *  JJ象棋 辅助引擎内核 —— 单文件打包
 *  目标运行环境: iOS JavaScriptCore / Node / 浏览器
 *  生成时间: 2026-10-30T04:57:20.053Z
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
    push(m, r.score, r.depth);
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
  { key: '1', w: [190,255,254,79,255,251,255,255,246,91,125,214,125,122,234,111,191,188,222,223,121,206,255,115,239,255,231,239,251,239,255,255,229,247,255,253,255,255,239,255,255,231,239,255,231,239,219,247,255,255,251,246,255,127,254,255,62,253,255,255,255,255,255,247,255,223,255,255,255,206,127,253], r: [160,225,6,68,128,3,218,192,18,75,65,146,100,2,98,98,131,140,208,147,121,200,255,51,233,243,167,168,243,41,248,243,161,242,243,153,252,251,143,252,191,7,236,223,7,237,211,215,191,195,233,246,195,117,28,208,56,97,128,245,119,128,241,4,248,223,31,248,255,64,127,253], i: [0,0,0,0,0,0,0,128,0,0,1,0,64,2,0,96,0,0,16,131,25,192,211,19,224,243,1,128,243,9,240,179,1,240,179,25,216,147,15,248,159,7,232,159,7,136,147,5,248,131,1,240,131,1,0,128,0,0,128,64,2,128,0,0,128,16,0,128,8,0,0,4] },
  { key: '1', w: [220,127,250,238,185,245,239,159,228,171,84,138,127,244,214,188,177,168,219,215,121,223,255,115,255,247,245,183,247,247,255,255,245,247,247,253,255,255,255,251,255,247,239,255,255,219,243,255,238,255,125,255,255,127,253,255,191,255,127,223,251,255,222,247,191,239,174,255,255,254,127,189], r: [208,99,10,232,0,1,232,128,4,137,64,2,71,128,194,180,129,40,81,199,25,217,223,19,249,247,149,176,247,149,248,247,149,244,243,29,248,255,15,248,255,7,232,219,15,217,211,143,232,199,77,57,193,113,93,192,177,2,64,211,115,192,218,6,176,239,34,243,238,218,64,189], i: [128,0,0,64,0,0,0,128,0,128,64,0,64,128,0,160,128,0,17,131,9,145,135,3,208,247,5,16,243,1,248,182,5,248,177,13,152,179,15,248,215,7,232,151,11,152,211,13,232,195,5,25,192,1,16,192,1,2,64,65,0,192,0,0,128,0,0,0,4,64,0,1] },
  { key: '1', w: [126,127,250,95,254,255,95,222,212,69,84,162,100,48,34,191,177,168,30,131,81,255,255,99,239,247,221,31,247,205,255,183,229,247,243,221,247,191,255,251,255,247,239,255,247,143,211,247,231,255,249,230,255,127,207,255,126,253,255,191,251,255,255,231,255,255,255,255,255,95,127,249], r: [64,97,2,84,128,7,90,192,0,5,64,162,100,0,32,179,128,136,16,131,81,241,255,3,232,247,29,24,243,13,248,183,5,240,179,29,240,183,31,248,191,23,232,255,7,136,211,135,225,195,201,224,195,1,9,192,64,1,192,177,3,192,241,7,240,255,27,224,253,83,124,249], i: [0,0,0,0,0,0,0,128,0,0,0,0,64,0,0,176,128,0,16,128,1,144,151,2,192,247,9,16,243,9,240,179,1,240,179,9,144,179,15,248,151,7,232,151,7,8,147,7,224,131,1,0,128,1,1,128,0,0,128,0,0,128,32,0,128,16,0,128,8,0,0,0] },
  { key: '2', w: [191,255,252,207,127,251,247,255,245,217,61,151,189,62,239,127,255,191,254,255,255,255,255,127,255,253,255,123,247,255,111,252,239,255,255,207,247,255,254,231,253,255,255,255,254,255,251,255,255,255,127,255,251,253,255,255,249,207,255,255,255,255,255,251,255,247,255,255,255,255,255,255], r: [160,195,4,68,0,2,18,0,16,201,32,144,132,32,97,67,227,1,224,227,193,225,227,1,241,225,133,112,224,223,108,252,207,126,254,15,118,255,192,102,252,192,116,224,192,112,240,199,112,252,99,115,251,237,125,254,249,73,12,224,114,0,228,9,192,247,139,255,255,115,255,127], i: [0,0,0,0,0,0,0,0,0,0,32,0,128,32,0,0,227,1,192,227,128,224,225,0,224,224,0,112,224,15,104,240,15,60,252,15,118,254,0,102,252,0,96,224,0,112,224,7,112,248,7,112,254,133,113,28,64,96,4,64,98,0,0,8,0,16,0,0,8,32,0,4] },
  { key: '2', w: [126,239,253,159,255,254,239,255,235,115,255,254,121,125,191,255,255,60,254,255,255,254,255,255,254,255,255,255,236,247,255,254,215,255,255,255,255,255,255,239,254,255,239,255,253,254,255,255,255,255,255,255,247,249,255,255,255,223,255,255,255,255,255,255,255,255,255,255,255,255,255,247], r: [72,131,5,28,0,12,42,0,104,2,225,96,8,97,3,134,195,0,192,195,131,192,195,3,224,195,11,241,224,55,121,248,23,121,255,63,255,254,129,111,252,1,237,224,1,224,224,207,225,252,223,229,246,209,249,248,255,64,28,240,125,0,248,11,0,254,55,255,255,127,252,246], i: [0,0,0,0,0,0,0,0,0,0,192,0,0,65,1,130,195,0,128,195,1,192,195,1,192,193,1,112,192,23,112,240,23,120,252,31,124,252,1,76,248,1,64,224,0,96,224,7,97,240,15,97,252,9,96,60,128,66,0,192,68,0,64,0,0,32,16,0,24,96,0,0] },
  { key: '2', w: [94,255,250,231,128,255,167,255,229,125,173,219,189,173,158,127,255,127,255,255,255,254,253,255,239,255,117,239,252,247,239,232,239,183,255,239,251,255,248,111,244,254,205,246,252,206,255,127,223,255,247,255,255,125,254,123,255,223,239,255,255,255,255,247,255,231,191,255,255,254,251,255], r: [80,255,0,224,0,3,32,0,4,77,160,80,132,161,16,67,225,97,193,227,129,192,225,129,225,224,5,224,224,135,108,232,143,53,255,15,123,255,0,110,244,0,64,240,132,64,240,67,66,254,247,113,252,125,70,51,38,74,14,232,119,0,190,5,66,230,59,231,253,198,129,123], i: [0,128,0,64,0,2,0,0,0,4,32,16,128,160,0,0,225,65,193,225,1,192,225,129,224,224,1,96,224,7,104,240,14,52,255,15,120,246,0,108,248,0,96,224,0,96,224,3,96,248,135,97,238,5,96,14,64,98,4,96,0,0,16,0,0,0,0,0,4,192,0,3] },
  { key: '2', w: [124,252,248,190,9,243,207,63,209,247,250,176,127,50,46,63,223,254,255,223,127,254,219,255,255,207,237,239,216,223,127,251,247,247,255,207,255,254,253,223,251,255,207,231,253,254,235,255,253,237,255,191,251,251,159,255,253,247,255,255,239,255,255,223,255,255,127,255,255,255,251,255], r: [16,236,0,136,0,18,4,0,80,150,192,176,12,34,0,2,199,194,195,199,1,194,195,129,193,195,41,225,192,31,113,240,23,118,255,15,254,252,129,220,249,129,205,224,1,192,224,5,225,236,143,191,249,235,128,63,252,245,8,242,77,0,120,11,191,253,111,183,221,206,3,247], i: [0,0,0,0,0,0,0,0,0,128,192,32,4,0,0,2,195,0,128,195,1,192,194,1,193,193,1,224,192,15,112,240,23,56,255,15,252,252,1,92,248,1,64,224,1,64,224,7,65,248,15,32,252,139,2,24,128,64,8,64,76,0,64,0,0,48,32,0,8,128,0,2] },
  { key: '2', w: [47,127,250,79,24,242,183,127,240,73,12,234,175,140,205,94,239,60,174,239,255,255,247,127,231,234,127,127,228,231,111,248,255,179,255,255,241,255,244,107,252,254,247,247,252,247,247,127,238,247,255,255,253,125,253,254,254,254,207,255,223,255,255,239,255,247,223,255,255,127,255,253], r: [8,67,10,68,0,2,18,0,0,73,0,0,134,128,65,66,227,0,128,227,65,225,225,1,224,224,7,120,224,135,104,248,143,48,255,143,112,255,128,106,252,128,112,240,128,112,240,3,96,246,135,113,253,77,117,254,70,114,14,224,70,0,176,13,0,246,155,128,236,119,120,125], i: [0,0,0,0,0,0,0,0,0,0,0,0,130,128,0,0,225,0,128,193,0,192,193,0,224,224,4,112,224,7,104,240,15,48,254,15,112,254,0,100,232,0,96,160,0,96,224,3,96,252,135,112,254,5,113,254,70,96,4,64,4,0,48,0,0,16,24,0,8,32,0,4] },
  { key: '2', w: [126,238,244,159,8,226,47,63,200,247,248,144,251,115,58,63,223,94,255,223,123,254,219,251,238,221,247,254,203,215,255,240,215,127,255,207,247,255,253,251,248,255,239,230,253,254,238,255,255,254,255,191,251,249,63,254,252,95,190,191,167,255,191,255,255,255,191,255,255,255,255,247], r: [80,198,0,12,0,32,34,0,8,148,192,128,131,67,0,2,195,66,130,199,1,192,195,1,224,193,7,224,192,23,241,240,23,121,254,15,245,255,1,249,248,1,225,224,1,224,224,7,225,252,23,161,250,217,10,252,188,84,28,160,133,0,32,27,0,180,55,0,216,239,120,230], i: [0,0,0,0,0,0,0,0,0,0,192,0,0,65,0,2,195,0,128,195,1,192,194,1,96,193,1,224,192,23,112,224,23,120,252,15,244,252,1,200,112,1,192,224,1,224,224,3,225,248,15,32,254,9,32,252,140,66,8,128,4,0,32,0,0,32,0,0,16,64,0,4] },
  { key: '3', w: [159,127,250,79,126,255,247,255,249,125,251,239,191,248,223,254,255,223,223,255,185,223,255,119,255,127,126,231,253,247,226,255,247,241,255,255,223,255,254,231,253,255,255,255,255,255,127,254,207,255,255,223,255,191,127,255,221,126,255,255,127,255,223,255,255,239,255,255,247,247,255,255], r: [144,65,2,8,0,6,148,0,8,5,3,192,131,0,0,128,7,65,192,231,161,208,239,71,248,127,78,231,253,135,226,255,135,241,255,143,216,255,142,224,253,143,240,253,143,244,125,206,202,125,239,219,252,191,101,248,205,80,152,247,67,1,215,230,224,239,141,253,247,51,255,127], i: [0,0,0,0,0,0,0,0,0,0,3,0,1,0,0,0,3,0,128,195,1,192,103,6,240,23,14,231,249,7,226,253,7,240,255,14,192,121,6,192,249,7,224,249,7,248,120,134,200,24,134,216,248,135,64,184,69,64,0,39,65,0,2,4,0,8,8,0,4,16,0,2] },
  { key: '3', w: [126,255,249,159,253,247,207,255,235,247,225,175,251,250,191,249,254,127,255,191,249,255,255,247,255,255,193,238,247,199,234,255,199,254,255,223,254,255,203,142,247,239,254,247,255,255,255,253,255,255,255,255,255,255,255,255,255,249,159,255,119,253,127,255,255,255,239,255,223,255,255,255], r: [80,131,33,152,0,20,68,6,104,4,0,32,11,26,128,1,30,64,3,159,153,193,223,55,241,255,0,238,231,7,232,255,7,252,255,31,224,255,11,130,247,47,194,243,63,209,243,121,245,243,255,249,243,255,142,227,255,129,3,254,7,1,124,155,255,255,39,254,223,239,252,255], i: [0,0,0,0,0,0,0,0,0,0,0,0,0,24,0,0,12,0,0,14,9,128,159,17,193,255,0,236,231,7,232,243,7,120,251,27,128,231,9,128,227,15,128,227,31,241,227,24,241,35,24,224,227,31,130,227,158,128,3,156,4,1,72,0,0,32,32,0,16,64,0,8] },
  { key: '3', w: [62,190,125,159,200,249,183,255,248,123,254,251,126,241,250,254,255,159,190,231,177,255,255,255,251,127,254,239,251,119,227,253,247,177,255,254,223,255,254,199,255,127,231,255,127,247,255,255,223,222,255,223,255,254,191,255,252,191,31,254,63,255,255,255,255,255,179,255,255,255,79,253], r: [8,166,1,144,0,9,18,0,8,1,2,88,2,1,112,2,131,1,128,199,1,193,239,207,248,127,206,238,251,6,226,253,135,176,255,142,192,247,142,192,255,15,224,245,15,240,252,254,216,220,231,155,244,254,133,232,244,147,16,246,34,8,255,173,224,250,179,243,246,231,0,57], i: [0,128,0,0,0,1,0,0,0,0,2,0,2,1,0,0,3,0,0,195,1,128,199,71,240,22,142,238,241,4,194,93,7,176,255,6,192,122,6,192,249,6,96,248,6,248,120,134,200,24,198,216,248,71,193,48,36,192,0,39,2,0,18,4,0,8,16,0,4,64,0,1] },
  { key: '3', w: [252,252,248,62,123,231,223,127,217,239,226,135,247,251,30,249,239,118,125,255,241,189,159,211,239,255,224,249,247,227,234,255,231,126,255,251,174,255,235,222,247,231,222,251,247,223,253,213,223,255,247,255,255,245,125,255,247,255,62,241,255,252,191,255,255,255,15,254,255,255,179,251], r: [160,204,16,16,1,38,24,2,88,8,2,0,5,10,0,1,14,2,4,142,145,129,159,19,225,255,32,249,231,35,234,247,39,120,255,27,162,255,11,130,247,7,196,243,23,197,241,21,193,243,23,202,243,149,4,227,215,213,34,240,11,96,60,159,234,255,15,102,219,254,3,243], i: [0,0,0,0,0,4,0,0,16,0,2,0,0,8,0,0,12,0,0,14,1,0,159,19,193,111,0,249,103,1,168,247,5,112,254,11,0,243,9,128,247,3,192,241,23,225,243,17,160,51,21,98,243,20,4,227,150,4,35,148,8,1,68,16,0,32,0,0,24,128,1,2] },
  { key: '3', w: [190,127,126,79,16,245,151,255,232,59,255,201,253,112,154,254,191,255,135,215,53,235,255,191,247,63,102,231,251,103,227,253,103,243,255,111,223,255,126,231,255,127,227,253,255,255,255,254,207,222,63,255,254,255,223,255,189,127,127,221,127,255,255,255,255,239,223,255,255,111,255,255], r: [160,99,0,8,0,0,148,1,8,2,3,72,1,0,0,128,3,33,129,195,5,224,231,15,247,63,70,231,251,7,226,253,7,242,255,15,216,255,14,224,255,15,224,253,143,252,252,206,200,220,6,254,252,215,201,248,37,69,56,213,66,0,250,197,0,236,31,192,254,35,60,127], i: [0,0,0,0,0,0,0,0,0,0,3,0,0,0,0,0,3,0,128,195,1,192,199,7,240,19,4,198,249,6,194,253,7,240,253,6,192,122,6,64,249,7,224,248,135,248,120,134,200,24,6,216,248,71,192,248,5,65,16,5,66,0,18,4,0,8,8,0,4,32,0,2] },
  { key: '3', w: [124,252,244,191,249,212,159,110,232,231,240,231,251,26,206,255,238,102,93,142,209,253,223,115,255,255,200,252,231,199,234,247,231,246,255,235,62,255,235,142,247,239,220,251,255,255,243,239,255,251,251,255,255,255,191,255,244,251,191,241,255,253,247,255,255,255,255,255,223,127,255,251], r: [16,132,36,168,0,4,20,6,32,0,0,32,9,26,192,7,14,6,0,14,129,129,223,19,247,127,8,252,231,7,232,247,39,240,255,43,32,255,43,128,247,47,192,243,63,225,243,47,231,243,59,234,243,191,170,195,244,145,35,208,15,1,244,27,3,242,55,0,218,79,217,216], i: [0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,12,0,0,14,1,0,159,17,225,79,8,124,103,3,168,243,7,240,255,11,32,231,9,128,231,15,192,225,31,225,226,9,160,35,24,98,227,31,0,227,20,0,3,148,8,1,64,16,0,32,32,0,16,64,0,8] },
  { key: '4', w: [223,127,255,231,159,253,251,255,251,252,7,239,222,153,255,63,255,223,159,255,191,207,255,191,239,255,63,231,255,127,209,255,127,243,255,127,247,255,127,239,255,119,255,255,119,239,255,55,207,255,59,239,255,251,175,255,253,239,255,221,246,127,252,251,255,242,251,255,251,247,255,254], r: [92,112,1,34,0,1,8,96,10,96,6,72,192,152,48,49,126,0,25,126,32,72,127,160,40,127,0,6,255,64,17,127,96,19,127,64,54,255,79,40,255,87,56,63,86,8,253,54,200,255,43,237,253,251,174,252,253,13,209,217,176,96,252,243,240,242,11,224,251,19,255,126], i: [0,0,0,0,0,0,0,0,0,0,0,0,64,16,0,32,118,0,16,122,0,8,122,0,40,114,0,4,122,0,0,127,0,2,123,0,16,249,7,8,63,6,24,28,4,8,120,6,136,223,2,232,14,66,8,48,33,8,224,1,0,64,16,2,128,0,0,0,0,0,0,2] },
  { key: '4', w: [124,222,249,190,254,222,223,255,235,103,59,184,243,92,124,251,255,126,189,255,255,253,255,255,253,255,255,254,255,255,238,255,255,254,255,251,254,255,223,254,255,143,254,255,151,252,255,159,221,255,199,221,255,199,127,255,239,127,255,239,211,255,243,238,255,213,222,255,207,191,255,231], r: [64,2,9,184,0,28,84,0,35,6,43,0,0,92,4,128,255,2,128,251,3,225,249,3,225,249,1,246,248,7,232,248,7,248,249,1,242,252,95,226,248,15,226,248,17,224,232,23,193,255,199,193,255,198,119,247,175,111,131,239,210,0,243,174,255,213,30,1,206,191,0,102], i: [0,0,0,0,0,0,0,0,0,0,1,0,0,24,0,0,187,0,128,251,3,192,249,1,224,216,1,224,216,3,96,248,3,112,200,1,224,200,31,192,232,1,192,232,16,224,192,23,192,252,6,192,127,0,96,131,9,100,0,143,64,0,130,0,0,68,0,0,0,0,0,0] },
  { key: '4', w: [223,63,126,199,212,121,247,255,120,63,7,229,29,24,199,158,126,223,151,254,255,127,255,191,235,254,191,195,251,191,215,255,255,243,63,127,247,255,255,231,255,247,247,63,182,207,253,246,207,255,187,175,255,221,254,255,255,125,255,254,255,95,254,251,255,242,247,255,253,95,191,255], r: [200,57,4,68,192,9,4,0,0,39,0,32,1,24,64,128,126,144,144,126,160,112,126,160,40,126,0,0,251,0,22,255,224,19,59,64,52,255,207,32,255,199,16,63,182,8,252,230,200,255,163,170,126,213,248,224,255,89,224,242,27,72,254,179,224,242,67,112,125,87,176,61], i: [64,0,0,0,0,0,0,0,0,0,0,0,0,16,0,128,118,0,16,122,0,80,122,0,40,58,0,0,122,0,4,95,0,16,59,0,16,255,7,0,61,7,16,28,6,8,120,70,136,223,2,168,14,5,88,96,35,25,224,2,2,64,16,0,128,0,0,0,0,0,128,128] },
  { key: '4', w: [188,253,244,222,9,235,127,255,237,79,29,200,119,91,156,243,255,63,191,251,255,252,255,255,255,249,255,255,218,255,255,255,255,254,255,253,254,255,223,222,255,199,255,250,213,252,254,223,255,255,195,155,254,237,63,223,126,31,255,229,191,255,243,254,255,241,79,255,239,255,242,253], r: [32,213,0,208,1,42,40,0,0,4,1,64,0,91,128,128,251,1,134,251,131,192,249,3,227,249,1,231,216,3,113,248,3,240,252,1,246,253,31,194,252,7,199,248,80,192,224,83,226,255,195,138,254,137,53,131,30,31,210,165,138,128,243,182,206,240,79,0,108,188,130,253], i: [0,1,0,128,0,0,32,0,0,0,0,0,0,11,0,0,187,1,128,234,1,192,249,0,194,217,1,161,200,3,113,232,3,240,200,0,192,232,31,192,240,1,193,232,16,192,64,19,194,255,2,128,115,8,36,128,28,0,0,135,8,0,66,16,0,32,0,0,0,0,0,4] },
  { key: '4', w: [151,59,125,171,134,251,107,255,234,124,13,245,172,152,243,31,126,215,135,254,223,95,255,191,45,127,191,7,255,127,33,255,127,241,127,124,247,255,127,227,255,119,227,63,119,207,250,182,207,255,187,175,223,185,239,127,252,238,255,221,251,127,254,247,255,242,235,255,249,143,255,254], r: [132,48,5,10,0,3,9,96,2,96,8,96,160,144,16,1,118,0,128,126,64,88,126,32,44,127,128,4,251,64,0,255,64,16,127,64,54,255,79,0,255,71,0,29,86,8,248,134,204,255,35,172,158,33,238,116,244,12,224,209,27,64,254,6,192,242,9,160,249,11,254,122], i: [0,0,0,0,0,0,0,0,0,0,0,0,32,16,0,0,118,0,0,122,0,16,90,0,8,50,0,4,250,0,0,95,0,16,59,0,16,249,7,0,61,6,0,28,6,8,120,2,136,223,2,168,14,0,104,0,32,8,224,1,0,64,16,2,128,0,0,0,0,0,0,0] },
  { key: '4', w: [190,220,245,190,112,212,95,254,187,111,60,108,255,28,76,115,255,62,255,251,251,221,251,255,239,217,251,254,250,255,126,251,255,254,255,225,254,255,207,222,254,199,254,250,153,222,238,223,255,255,195,253,127,238,219,183,243,251,127,231,223,255,187,191,255,155,95,255,207,255,255,247], r: [160,132,5,136,0,68,16,0,51,14,0,100,140,24,0,0,255,2,134,251,3,192,249,3,227,216,1,240,248,7,120,248,7,120,249,1,240,249,15,192,248,71,192,232,16,194,224,95,226,255,3,236,127,172,195,183,177,225,2,135,75,0,155,191,132,154,79,0,140,223,16,246], i: [0,0,0,0,0,0,0,0,0,0,0,0,0,24,0,0,155,0,128,218,3,192,249,2,192,152,1,32,216,3,112,232,3,112,200,1,80,232,15,192,240,0,192,232,16,64,192,19,194,253,2,192,115,8,64,131,16,64,0,135,8,0,10,16,0,0,0,0,0,0,0,0] },
  { key: '5', w: [207,127,127,247,223,124,251,111,255,206,207,231,151,159,239,239,255,255,199,255,223,203,255,191,167,255,255,245,255,127,243,253,127,240,255,127,253,255,255,239,255,127,239,127,63,223,255,255,247,255,235,247,255,133,251,255,223,251,255,239,247,255,255,255,255,247,251,255,249,247,127,255], r: [72,112,5,48,128,8,10,40,6,66,64,68,17,24,136,96,254,176,64,254,64,8,255,35,164,255,99,212,255,67,195,253,67,192,255,67,61,255,193,40,255,96,8,127,0,28,255,255,244,255,235,247,255,133,249,220,223,26,28,236,21,28,252,243,124,247,34,48,248,21,126,63], i: [0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,96,124,0,0,62,0,8,240,1,32,249,67,196,152,3,194,249,3,128,191,1,24,253,128,8,127,0,8,31,0,8,254,79,192,255,75,240,31,4,8,8,0,8,8,0,0,8,16,2,0,4,0,0,0,0,0,3] },
  { key: '5', w: [252,254,233,62,255,191,223,255,214,231,124,254,247,126,122,251,255,252,255,255,255,253,255,247,253,255,247,252,254,199,254,223,239,254,255,207,252,223,255,252,255,255,252,255,255,255,254,255,253,255,19,253,255,95,223,255,255,215,255,127,127,255,255,255,255,255,223,255,175,63,255,255], r: [128,6,9,56,0,24,72,192,208,0,64,194,20,70,10,9,247,132,135,247,15,192,251,23,193,249,55,224,252,1,242,220,47,246,252,15,228,217,15,196,249,15,196,248,3,227,248,255,241,255,19,248,255,95,223,199,161,199,192,113,127,192,243,55,255,241,79,251,175,62,248,127], i: [0,0,0,0,0,0,0,192,0,0,0,0,0,2,2,0,199,4,128,227,1,128,129,7,192,201,23,224,212,1,224,204,9,240,248,9,192,216,15,192,248,7,192,248,1,194,224,127,192,248,19,192,255,65,196,194,0,196,192,0,72,192,128,0,0,64,0,0,32,0,0,16] },
  { key: '5', w: [183,191,62,239,71,61,113,117,117,189,135,225,239,219,235,159,255,255,223,63,222,79,255,223,59,253,255,243,190,255,241,253,191,181,191,191,247,255,190,235,255,191,255,63,255,107,222,245,203,255,243,255,251,255,103,255,223,245,255,255,255,255,239,253,255,247,247,255,253,79,191,127], r: [160,191,0,32,64,13,1,48,1,37,0,32,99,216,72,146,254,240,81,60,128,8,254,129,56,253,227,208,190,67,193,253,3,148,191,1,54,255,32,8,255,32,24,63,64,8,222,229,200,254,243,253,27,252,6,24,222,21,24,252,27,8,238,52,120,119,37,248,125,7,176,63], i: [32,0,0,0,0,0,0,0,0,0,0,0,97,80,0,128,94,0,80,60,0,0,252,0,8,249,65,144,30,67,128,185,0,0,189,1,16,253,0,8,253,0,24,31,64,8,248,71,200,255,3,232,25,32,0,8,0,0,8,16,9,8,8,0,8,4,0,0,0,0,128,128] },
  { key: '5', w: [252,252,236,60,26,238,142,126,163,231,119,45,247,168,122,255,255,52,191,243,105,191,247,251,221,249,247,239,247,233,237,221,211,253,254,221,253,219,255,221,255,255,255,255,201,223,246,191,255,255,155,255,255,255,251,255,254,239,191,255,79,127,63,207,255,159,191,254,255,255,251,241], r: [64,236,4,16,2,14,8,64,33,32,2,33,16,128,66,13,247,4,133,227,1,133,243,11,193,217,23,226,244,9,224,220,19,240,252,29,240,217,15,196,249,15,194,249,9,194,240,159,199,255,155,229,255,224,251,194,192,239,128,160,79,65,48,143,230,152,190,150,191,188,3,49], i: [0,0,0,0,0,0,0,0,0,0,0,1,0,128,2,0,225,4,132,99,1,128,227,3,192,201,23,226,244,8,224,204,17,176,252,5,128,216,15,128,248,7,130,112,1,130,224,63,192,252,27,196,159,0,192,192,0,200,128,128,0,0,0,0,0,0,0,0,16,0,1,0] },
  { key: '5', w: [151,191,62,179,155,122,106,32,245,237,143,228,247,217,203,143,255,231,135,126,220,67,255,221,169,255,255,215,191,191,211,253,191,225,191,127,241,253,127,203,255,191,207,63,191,127,255,191,255,255,179,251,95,243,251,223,223,247,255,255,245,255,247,251,255,247,251,255,255,215,127,255], r: [148,176,4,16,128,10,10,32,4,33,8,100,113,216,192,128,254,160,0,62,128,64,255,65,136,254,99,150,159,131,195,189,131,129,191,65,16,253,64,8,255,128,12,63,128,28,255,175,252,255,51,250,31,242,249,24,152,20,24,252,1,8,246,51,56,247,10,8,119,1,119,59], i: [0,0,0,0,0,0,0,0,0,0,0,0,96,208,0,0,222,0,0,60,0,0,244,0,8,188,67,132,30,3,130,185,3,128,191,1,0,249,0,8,255,0,8,31,0,8,252,7,200,255,3,248,25,32,104,8,0,4,8,16,1,8,0,2,8,4,0,0,2,0,0,1] },
  { key: '5', w: [252,236,233,62,16,220,95,254,81,167,251,170,115,108,56,255,247,124,151,255,243,253,243,243,253,237,247,237,254,225,238,220,239,254,255,223,254,219,255,222,255,255,255,255,233,221,246,255,221,255,19,251,255,191,255,239,255,255,254,255,207,255,255,143,255,255,159,255,239,127,255,231], r: [32,4,41,16,0,24,72,192,17,32,131,160,0,0,0,13,247,4,133,247,3,132,243,3,192,233,55,225,244,33,226,220,43,242,252,31,242,217,15,194,249,15,195,240,1,193,240,255,196,255,19,195,255,161,221,207,0,239,192,192,207,192,240,7,208,224,15,128,96,94,248,103], i: [0,0,0,0,0,0,0,128,0,0,128,0,0,0,0,0,231,4,4,227,1,128,163,1,192,233,17,224,180,1,224,204,11,240,236,9,192,200,15,192,240,7,192,240,1,192,224,127,192,252,19,192,223,0,196,134,0,200,128,0,0,128,128,0,128,64,0,0,32,0,0,0] },
  { key: '6', w: [207,255,247,247,255,227,251,175,239,191,143,246,62,151,223,31,255,189,143,253,125,203,127,122,255,249,255,239,255,255,231,255,251,191,255,255,255,255,255,255,223,255,255,255,127,255,247,255,255,247,191,254,255,219,255,7,254,255,255,255,255,255,239,255,255,247,239,255,255,255,191,255], r: [8,0,4,52,0,96,226,32,0,163,1,32,34,145,0,0,252,133,134,253,77,200,29,74,252,241,135,46,254,131,39,254,131,63,254,195,126,254,129,252,159,129,248,7,96,241,7,240,134,5,191,6,252,219,3,6,252,187,253,255,239,184,239,219,255,247,111,254,255,223,191,127], i: [0,0,0,0,0,0,192,32,0,128,0,0,0,16,0,0,248,1,128,125,4,192,13,10,252,113,2,44,252,3,38,126,3,54,252,3,54,254,1,240,142,0,216,7,0,152,3,128,8,6,152,6,14,94,1,254,63,0,224,31,4,0,8,8,0,4,32,0,2,0,63,0] },
  { key: '6', w: [159,255,247,223,254,169,119,223,174,123,88,255,127,124,126,253,255,246,252,255,243,254,255,252,254,247,255,246,251,255,235,255,239,255,255,255,254,255,255,254,127,255,255,255,255,254,255,255,255,255,191,255,247,255,255,31,236,255,255,223,255,255,175,255,255,255,252,255,255,255,191,254], r: [132,0,4,212,64,160,22,195,32,9,64,65,6,64,0,129,243,150,152,255,19,218,255,60,248,231,29,240,248,15,233,248,15,253,248,143,244,249,7,232,123,3,195,31,224,98,7,224,115,30,176,30,240,255,53,24,232,39,246,223,187,123,174,103,255,255,236,249,255,60,191,126], i: [0,0,0,0,0,0,0,193,0,0,64,1,0,64,0,128,241,6,128,247,17,144,55,24,240,227,13,240,248,13,232,248,15,220,248,7,200,248,3,224,59,2,97,15,0,96,14,32,34,8,32,28,56,248,4,248,239,0,192,95,16,0,32,32,0,16,192,0,8,0,188,0] },
  { key: '6', w: [151,63,119,183,183,231,163,71,240,255,238,231,93,151,190,223,250,252,183,253,57,239,159,251,239,103,127,231,245,247,247,255,255,247,127,255,247,254,255,231,199,255,255,246,127,214,255,191,254,254,255,255,253,219,251,247,249,255,239,239,255,255,239,199,255,255,255,255,255,255,191,255], r: [16,0,6,48,16,36,160,0,112,229,96,128,65,144,160,193,248,64,165,253,9,236,31,202,236,103,6,228,240,135,119,254,131,246,124,129,246,254,129,224,135,128,248,6,64,144,7,174,30,30,249,11,188,219,2,244,249,23,192,229,109,28,238,131,200,255,247,128,123,159,63,62], i: [0,0,0,0,0,0,32,0,0,192,96,0,64,0,32,193,248,64,160,237,1,232,15,10,232,99,6,100,248,135,102,124,131,34,252,129,116,252,128,240,7,128,240,7,0,152,7,0,8,6,72,5,14,30,2,252,57,0,0,16,4,0,8,0,0,4,96,0,1,1,63,128] },
  { key: '6', w: [63,121,230,199,254,201,239,252,151,183,94,190,57,94,248,188,249,118,255,255,213,247,55,240,247,215,213,254,235,239,239,255,239,207,255,255,252,245,251,252,27,255,255,255,255,253,230,239,163,239,223,255,255,235,255,239,239,255,255,143,255,255,255,111,255,255,127,123,253,255,255,255], r: [32,1,6,196,64,128,192,192,16,131,66,0,9,66,192,140,241,6,131,247,213,243,55,16,241,215,148,248,227,15,237,248,15,205,248,135,192,241,3,224,25,1,195,15,32,97,6,96,35,12,144,28,120,234,47,232,239,27,128,143,223,58,184,111,99,250,95,3,236,60,254,125], i: [0,0,4,0,0,0,192,64,0,0,64,0,0,66,0,128,241,6,130,211,21,209,55,16,241,135,20,240,240,13,232,248,15,216,248,7,200,248,3,224,11,1,225,11,0,97,10,32,50,8,32,28,56,184,0,240,111,8,0,0,16,0,32,32,0,16,1,1,4,0,252,0] },
  { key: '6', w: [223,6,245,119,151,234,57,150,195,189,19,178,30,147,201,62,252,56,171,253,125,233,31,122,253,251,63,231,246,119,235,255,243,191,255,255,241,254,127,247,223,127,243,231,255,151,247,127,255,246,255,234,255,157,255,247,251,255,63,254,255,255,239,223,255,255,223,253,255,255,191,255], r: [80,0,4,52,0,40,32,16,0,160,16,160,0,144,0,32,248,0,160,253,76,232,31,10,252,113,6,102,246,3,43,254,131,62,254,129,112,254,1,240,223,0,208,7,208,144,7,88,28,6,252,10,28,28,3,214,187,18,32,254,47,24,238,25,192,239,199,192,251,159,191,126], i: [0,0,0,0,0,0,0,0,0,128,0,0,0,16,0,32,248,0,32,61,4,232,13,2,252,113,6,36,248,2,42,124,3,38,252,1,50,254,1,240,198,0,208,7,128,152,3,0,12,6,72,6,14,28,0,252,59,2,0,16,4,0,8,8,0,4,64,0,1,0,63,0] },
  { key: '6', w: [175,57,228,223,126,169,119,158,175,157,0,215,187,104,118,156,243,110,158,255,119,222,55,244,252,231,197,246,251,239,231,254,255,199,255,247,222,249,255,236,123,251,255,255,255,126,255,239,235,255,223,189,127,167,255,255,111,255,255,253,255,255,251,127,255,255,254,254,255,255,255,254], r: [160,0,4,212,64,136,18,128,32,141,0,65,130,96,0,132,241,14,154,247,23,200,55,52,248,231,5,240,248,15,229,248,15,197,248,7,200,249,7,232,122,3,225,31,32,114,14,32,99,28,208,60,120,164,37,248,111,11,192,125,31,34,240,103,3,254,158,2,239,62,255,250], i: [0,0,0,0,0,0,0,128,0,128,0,1,128,64,0,128,225,6,128,247,16,144,55,16,240,199,1,240,240,13,32,248,6,80,248,7,200,248,7,192,27,3,97,15,0,96,10,32,50,8,32,24,24,176,0,240,111,8,0,68,16,0,32,32,0,16,128,0,4,0,252,0] },
  { key: '7', w: [231,255,250,255,219,245,251,207,239,254,242,223,190,190,191,127,239,63,191,255,127,255,255,127,255,255,255,255,255,255,255,251,255,255,253,255,255,255,255,239,255,231,254,255,103,123,255,127,255,255,63,255,255,223,252,255,222,223,127,239,219,127,231,239,255,251,223,127,60,63,128,191], r: [32,56,8,12,88,20,2,76,136,130,114,64,130,30,160,64,103,32,129,251,65,129,255,97,131,255,225,194,247,128,192,115,128,192,121,192,193,255,207,239,255,199,254,255,103,91,112,112,38,247,57,253,235,211,248,192,222,95,64,239,19,112,103,43,255,251,215,121,60,31,128,175], i: [0,0,0,0,16,0,0,72,0,0,2,0,128,0,0,64,0,0,128,241,0,128,255,1,128,255,0,128,113,0,192,49,0,192,24,0,192,255,7,224,255,7,254,239,7,2,0,0,0,226,0,224,193,65,48,192,0,18,0,0,0,0,0,0,0,2,0,0,0,0,0,128] },
  { key: '7', w: [231,255,251,247,219,247,251,197,235,252,242,159,254,255,191,63,239,63,255,255,127,191,255,255,255,255,255,255,255,255,255,247,255,255,127,255,255,255,255,239,255,255,255,255,231,125,254,127,255,255,63,190,255,255,255,255,252,233,255,239,219,255,231,239,255,249,191,127,61,126,0,63], r: [32,56,8,20,88,148,2,68,128,128,114,0,194,63,160,1,71,0,192,251,1,131,255,129,131,255,129,193,255,128,192,115,128,192,123,128,193,255,159,239,255,223,255,255,199,92,240,80,101,199,25,188,195,243,255,192,252,96,192,239,27,225,231,47,255,249,183,127,61,94,0,63], i: [0,0,0,0,16,0,0,64,0,0,2,0,128,1,0,0,1,0,128,243,0,0,255,1,0,255,0,128,113,0,128,49,0,192,25,0,128,255,7,224,255,31,254,239,7,4,0,0,0,194,0,160,129,65,50,192,32,32,128,0,0,128,0,0,0,0,0,0,1,0,0,0] },
  { key: '7', w: [239,255,255,247,139,251,243,215,223,253,242,191,127,253,191,254,255,255,254,255,255,255,255,255,255,255,255,255,239,255,255,247,254,255,251,255,255,255,255,255,255,223,253,255,199,247,255,127,255,255,255,223,255,63,191,255,252,191,255,254,247,255,222,207,255,253,190,255,125,126,0,63], r: [32,48,12,16,0,88,2,212,144,132,114,0,3,61,128,128,195,192,128,247,129,131,255,195,131,255,131,128,239,0,128,247,128,128,251,128,194,255,159,255,255,159,253,255,135,119,224,112,237,207,241,219,195,51,183,192,252,191,128,254,100,99,94,71,254,253,174,255,125,30,0,63], i: [0,16,0,0,0,16,0,80,0,0,2,0,0,1,0,128,1,128,128,227,1,0,255,1,0,255,1,128,99,0,128,33,0,128,49,0,128,255,7,224,255,31,252,223,7,5,0,0,65,128,129,192,131,3,34,128,0,36,0,32,0,0,16,0,0,4,0,0,1,0,0,0] },
  { key: '7', w: [207,255,247,247,135,251,243,23,223,253,225,191,125,253,63,255,223,255,254,255,255,255,255,255,255,255,255,255,255,255,255,247,255,255,251,254,255,255,255,255,255,223,254,255,199,246,252,253,254,255,255,255,255,255,249,255,252,219,255,223,167,255,207,222,255,243,255,255,120,255,0,62], r: [64,112,4,18,128,56,0,16,144,4,225,128,0,61,0,131,79,192,128,247,131,3,255,195,3,255,3,129,255,1,129,247,0,129,251,128,131,255,159,255,255,223,254,255,199,180,128,225,140,143,243,249,199,227,241,192,252,219,192,223,167,65,79,94,254,243,239,255,120,191,0,62], i: [0,0,0,0,0,16,0,16,0,0,0,0,0,1,0,128,1,128,128,227,1,0,255,1,0,255,1,0,227,0,128,99,0,128,51,0,128,255,15,224,255,31,252,223,7,4,0,0,0,128,129,192,3,131,96,128,64,64,0,1,0,0,1,0,0,0,0,0,0,0,0,0] },
  { key: '7', w: [223,223,255,239,183,227,247,11,159,255,229,255,253,251,127,253,223,127,254,255,255,254,255,255,254,255,255,255,255,255,255,239,255,255,247,255,255,255,255,254,255,247,254,255,135,236,253,253,255,255,255,253,255,255,95,255,185,123,255,222,167,255,239,159,255,251,127,255,121,255,0,126], r: [80,80,28,10,176,128,22,8,1,12,229,192,0,59,0,1,207,0,2,247,3,2,255,3,0,255,3,1,223,1,1,231,1,1,247,129,129,255,191,254,255,247,252,255,135,172,192,193,219,142,195,249,167,199,79,193,185,107,129,222,135,193,239,143,254,251,94,255,121,60,0,110], i: [0,0,0,0,32,0,0,0,0,0,4,0,0,3,0,0,3,0,0,231,1,0,254,3,0,254,1,0,195,0,0,99,0,0,51,0,0,255,15,224,255,55,252,255,7,8,0,0,130,128,1,192,7,131,68,128,1,72,0,64,0,0,32,0,0,8,0,0,0,0,0,0] },
  { key: '7', w: [71,159,124,255,154,240,255,137,235,63,134,252,189,189,223,253,135,255,191,243,191,191,255,127,159,255,255,191,255,255,255,255,255,255,127,255,255,255,255,239,255,119,247,255,247,252,252,186,85,255,190,255,255,255,191,223,222,227,127,239,199,255,247,239,255,251,143,191,190,191,201,255], r: [4,0,16,24,24,0,4,8,64,14,6,48,129,61,0,193,7,64,130,243,128,129,255,65,129,255,128,128,255,128,192,115,128,192,127,192,192,255,199,239,255,87,246,251,231,124,48,168,64,243,144,247,241,241,187,192,220,32,96,207,7,197,230,75,103,251,143,160,190,47,73,111], i: [0,0,0,8,24,0,4,8,0,0,4,0,1,1,0,192,0,64,128,243,0,0,255,0,0,119,128,0,243,128,128,51,128,192,24,128,128,255,131,224,255,23,198,225,6,4,0,0,0,242,0,241,192,33,50,192,0,0,0,0,0,0,4,0,0,2,0,128,0,0,8,192] },
  { key: '7', w: [247,95,245,243,196,244,253,76,253,251,98,215,252,249,127,255,135,255,190,247,254,255,255,127,255,255,255,255,255,254,255,247,255,191,255,255,159,255,255,235,255,255,229,255,119,254,104,250,124,255,63,255,253,253,239,223,254,127,127,255,215,255,247,175,255,255,46,255,63,254,209,191], r: [116,0,21,16,64,64,13,76,208,3,98,208,128,57,96,129,3,192,128,227,192,2,255,1,2,255,128,128,255,128,128,247,0,128,127,192,128,255,135,232,255,223,229,247,87,254,32,240,64,230,25,251,229,241,238,192,250,101,0,255,18,65,247,175,239,254,14,192,63,62,81,191], i: [32,0,0,0,16,0,4,72,16,0,0,0,0,1,0,129,1,64,128,227,128,0,255,0,0,231,0,0,99,0,128,49,0,128,88,0,128,255,3,224,255,31,196,193,4,4,0,128,64,226,0,224,129,1,34,192,34,36,128,16,0,0,0,0,0,4,0,128,1,0,16,0] },
  { key: '7', w: [71,95,245,227,213,252,249,64,181,187,195,215,252,249,63,190,79,126,254,247,255,255,255,255,127,255,255,255,255,255,255,247,254,255,123,255,255,255,255,239,255,247,231,255,127,116,121,126,246,255,127,255,255,255,191,255,188,203,127,254,167,255,255,151,255,247,30,127,125,254,195,191], r: [64,0,20,0,16,24,8,64,176,2,64,208,128,57,32,128,7,64,128,231,161,3,255,193,2,255,129,0,255,129,128,247,0,128,123,0,130,255,143,236,255,151,231,247,95,116,96,48,228,238,113,227,225,251,191,192,184,72,64,254,3,64,253,151,199,246,30,65,121,126,67,190], i: [0,0,0,0,16,8,0,64,0,0,0,0,0,1,0,128,1,0,128,227,128,0,255,1,0,239,0,0,103,1,128,33,0,128,59,0,128,255,3,224,255,23,132,193,9,4,0,0,64,196,1,226,129,67,32,192,32,0,128,16,0,0,8,0,0,4,0,0,1,0,0,0] },
  { key: '7', w: [15,31,225,239,54,217,231,3,183,217,69,207,251,218,191,255,79,255,255,247,127,127,255,255,127,255,255,127,255,255,255,239,255,255,255,254,191,255,255,255,255,215,236,255,239,231,104,117,254,254,255,223,255,191,159,191,253,191,127,255,191,255,247,222,255,243,255,254,253,255,131,255], r: [0,0,0,6,48,24,0,0,160,8,68,192,2,90,0,131,7,128,133,231,1,3,255,131,3,255,1,0,255,1,128,239,1,128,255,0,130,255,15,251,255,151,236,231,207,229,0,81,194,78,163,222,195,163,151,129,121,171,64,191,55,161,213,14,255,243,223,130,253,126,130,255], i: [0,0,0,0,48,8,0,0,32,0,0,0,2,2,0,128,1,128,129,227,1,0,254,1,0,238,0,0,230,1,0,103,0,128,51,0,0,255,3,224,255,23,140,131,9,1,0,0,128,196,129,194,1,3,4,128,65,8,0,33,16,0,16,0,0,0,128,0,1,0,0,0] },
  { key: '7', w: [207,191,232,247,55,201,251,131,237,239,77,251,251,251,255,125,79,255,125,231,255,254,255,255,252,255,255,254,255,255,255,239,255,127,255,254,191,255,255,254,255,231,239,207,231,237,241,245,255,255,127,251,255,127,123,255,252,191,255,254,239,255,255,47,255,255,63,254,250,255,131,63], r: [192,0,40,52,48,72,10,128,32,14,76,96,9,123,192,0,7,128,0,231,193,2,254,3,0,254,1,0,255,1,1,239,1,1,255,128,1,255,207,248,255,231,239,207,39,232,193,224,131,206,35,243,227,111,123,129,244,139,0,254,39,195,250,47,255,255,30,130,242,124,130,46], i: [64,0,0,16,32,0,8,128,32,0,8,0,0,2,0,0,1,128,0,199,1,0,254,1,0,206,0,0,198,1,1,99,0,1,179,0,1,255,7,224,255,39,8,131,1,8,0,0,130,128,1,192,3,7,64,128,68,8,0,33,0,0,16,32,0,8,0,0,2,0,0,0] },
  { key: '8', w: [255,255,255,254,255,255,255,127,255,255,159,222,127,159,247,127,14,224,127,30,248,63,15,248,31,22,254,39,16,254,111,223,252,23,89,192,63,237,196,39,96,252,19,197,252,25,231,252,59,135,253,63,239,125,61,239,252,191,31,254,255,63,254,255,127,222,255,255,255,254,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,64,0,0,64,0,0,0,0,0,0,0,0,0,0,0,8,0,0,24,0,0,24,0,0,4,0,2,4,33,15,128,1,31,240,6,2,240], i: [0,0,0,64,0,0,32,0,0,0,96,0,132,96,32,130,33,7,128,33,69,129,25,135,129,57,3,156,237,1,144,160,0,136,176,63,200,144,63,144,31,3,142,2,3,198,16,3,228,120,3,193,32,131,193,8,131,66,224,67,2,224,3,4,128,32,0,0,8,0,0,4] },
  { key: '8', w: [255,127,254,191,188,253,174,190,247,239,23,238,239,94,243,127,14,208,62,4,252,63,1,252,28,0,124,7,28,254,23,95,248,51,15,232,6,38,252,14,225,224,50,75,249,63,0,249,57,238,125,62,55,125,63,103,254,60,31,190,243,63,252,255,127,255,254,255,255,254,249,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,64,0,0,64,0,0,64,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,33,0,128,1,15,192,2,31,224,14,0,248], i: [0,0,0,0,103,0,64,0,2,16,96,0,0,160,16,128,161,39,130,177,66,128,81,2,129,25,129,184,225,0,184,160,0,72,240,63,100,248,17,176,46,3,204,6,2,204,56,2,197,72,130,193,8,130,194,16,67,194,96,67,4,224,2,8,128,17,0,0,4,0,0,3] },
  { key: '8', w: [255,126,255,127,255,251,127,47,255,95,151,220,239,46,242,118,28,104,63,6,240,62,11,252,29,6,252,6,20,254,63,93,216,27,69,224,47,232,84,39,96,232,18,75,252,10,202,252,43,38,253,61,255,124,63,255,252,63,15,254,215,63,222,255,255,255,255,255,247,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,0,0,0,0,192,0,0,128,0,0,128,0,0,0,0,0,64,0,0,64,0,0,0,0,0,0,0,0,0,0,0,0,0,0,64,0,0,0,0,0,8,0,0,0,1,5,224,3,5,224,7,6,240], i: [0,0,0,128,0,0,32,0,0,0,96,0,8,224,16,130,33,7,128,177,75,129,81,131,128,25,131,152,201,1,152,32,0,136,176,63,96,144,56,144,31,3,220,6,3,196,48,3,204,72,3,193,8,131,193,0,3,194,112,67,68,224,34,8,128,17,16,0,8,0,0,2] },
  { key: '9', w: [254,255,255,254,255,255,255,255,255,255,255,249,255,231,231,255,199,239,253,207,255,255,203,255,255,75,255,255,75,255,255,15,192,255,3,192,63,0,195,7,66,255,143,195,255,255,199,255,254,199,255,255,7,252,255,0,248,127,248,255,123,254,255,255,255,255,255,255,255,254,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,48,12,0,48,14,0,48,0,0,0,1,0,0,1,0,128,3,248,193,6,224,225], i: [0,0,0,0,0,0,32,0,0,16,0,0,8,24,0,0,56,64,2,120,64,0,48,0,1,48,0,1,48,0,0,248,63,0,254,55,232,207,63,136,59,0,112,56,0,0,56,0,1,56,0,0,248,3,0,127,135,130,7,70,132,1,0,8,0,32,16,0,8,0,0,4] },
  { key: '9', w: [255,255,255,255,255,255,255,255,247,255,255,254,255,243,255,255,227,255,255,231,255,255,167,255,255,167,255,255,167,255,255,7,224,255,1,192,31,0,192,3,163,255,199,167,255,251,167,255,255,227,255,255,3,126,126,0,252,63,252,255,127,255,255,251,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,56,0,0,56,8,0,56,0,0,0,0,0,128,0,112,128,1,254,241,3,240,249], i: [0,0,0,64,0,0,16,0,0,0,0,0,0,12,0,2,28,0,0,44,0,1,8,0,0,8,128,0,8,128,0,236,31,0,239,49,244,231,63,204,13,0,56,12,0,0,12,0,0,28,128,0,252,129,129,255,67,64,3,3,130,0,32,4,0,48,0,0,0,0,0,2] },
  { key: '9', w: [255,254,254,190,189,253,191,126,247,191,255,249,255,223,183,255,195,191,255,239,255,252,207,159,253,207,255,254,207,247,255,25,224,223,0,192,7,193,239,7,64,241,143,129,255,143,143,255,252,215,255,255,3,124,57,0,248,255,240,188,251,254,223,215,255,255,247,255,255,222,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,20,0,40,24,0,0,0,0,0,1,0,128,3,240,129,7,242,225,6,0,249], i: [0,0,0,0,103,0,64,0,0,16,0,8,8,0,0,4,56,64,2,0,0,2,16,128,0,16,0,1,48,0,0,112,31,0,79,32,248,44,24,40,47,0,80,32,0,1,56,0,1,40,0,0,236,131,194,243,4,0,156,67,132,1,32,8,0,16,0,0,0,0,0,3] },
  { key: '9', w: [255,127,255,255,252,253,79,255,255,255,255,236,249,255,251,252,227,183,255,195,255,254,163,63,255,227,255,254,227,127,255,193,240,239,192,192,3,195,247,3,0,249,211,224,255,214,231,127,255,231,127,254,1,252,63,0,190,59,120,252,119,251,223,247,255,255,231,255,255,238,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,8,0,0,16,0,0,56,0,0,24,0,0,0,0,0,128,0,248,209,3,251,249,14,0,249], i: [0,0,0,0,103,0,32,0,0,0,0,0,4,0,0,2,28,32,0,40,64,1,40,64,0,40,0,0,8,128,0,168,159,128,47,48,252,36,8,28,15,0,104,24,0,0,24,128,0,88,128,1,254,3,192,251,64,66,142,3,128,0,48,8,0,8,16,0,4,64,0,1] },
  { key: '9', w: [255,126,254,223,255,251,127,126,238,191,127,217,255,207,183,255,199,175,255,227,255,255,199,191,252,199,255,255,71,254,255,17,224,142,3,192,31,0,195,6,194,197,143,193,255,191,195,255,253,211,255,126,7,124,123,0,248,127,240,252,115,102,254,255,255,255,255,255,255,239,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,40,2,0,32,0,0,0,17,0,128,3,16,193,7,192,193,7,240,249], i: [0,0,0,128,0,1,32,0,0,16,0,0,8,0,0,4,56,64,2,104,0,0,8,128,1,24,128,0,56,0,0,104,63,0,206,51,248,199,63,136,43,0,112,40,0,0,40,0,0,40,0,1,236,131,130,127,4,0,12,71,132,1,0,8,0,16,16,0,8,0,0,4] },
  { key: '9', w: [255,126,255,191,255,251,119,127,247,223,255,252,255,255,219,252,163,239,255,135,127,255,167,255,255,167,255,255,55,255,255,197,192,203,1,224,27,66,224,5,2,241,195,164,255,191,167,255,255,245,255,255,3,254,61,0,188,59,248,254,127,122,254,255,255,255,255,255,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,32,0,0,0,0,0,128,33,104,209,129,193,241,7,248,241], i: [0,0,0,64,0,0,0,0,0,8,0,8,4,0,16,2,28,32,0,40,64,1,40,64,0,8,128,0,8,128,0,168,31,0,238,17,252,227,31,140,9,0,56,8,0,0,8,0,0,8,128,1,252,131,192,63,66,64,142,3,130,1,32,0,0,16,16,0,8,0,0,2] },
  { key: '10', w: [255,255,255,252,255,247,255,234,255,191,201,223,207,129,239,191,128,190,255,192,254,191,129,255,127,129,252,191,120,248,63,0,252,63,0,249,63,120,252,127,124,252,63,112,254,7,96,255,15,128,254,22,1,255,223,0,248,31,185,231,55,208,191,15,248,255,191,255,255,254,254,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,1,7,0,192,6,0,224], i: [0,0,0,128,0,0,0,16,0,16,48,0,0,118,32,4,111,64,128,99,128,1,124,0,0,254,3,64,19,7,64,204,3,192,247,0,192,1,0,192,135,3,224,206,3,248,155,0,196,119,0,97,246,0,32,239,7,228,0,92,228,9,64,192,15,32,0,0,8,0,0,4] },
  { key: '10', w: [255,255,255,255,255,59,255,177,127,223,192,238,255,224,255,123,192,215,57,194,239,127,224,254,63,64,255,94,112,252,207,24,255,15,132,248,15,252,255,31,2,255,15,60,255,3,146,255,15,192,255,15,128,255,15,0,252,27,248,243,7,254,223,31,252,239,159,255,255,127,255,191], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,0,192,0,224,193,3,0,240,3,12,184], i: [0,0,0,0,0,0,16,12,0,8,28,0,2,59,16,128,55,32,192,49,0,0,30,64,128,251,1,160,13,131,48,230,128,240,127,0,240,4,0,224,227,0,112,195,0,252,109,128,224,27,0,240,127,64,144,231,71,96,12,14,112,4,32,226,3,16,128,0,4,0,0,2] },
  { key: '10', w: [255,254,254,127,253,251,253,120,239,22,201,219,131,3,183,125,192,111,255,192,255,187,65,254,46,1,252,253,108,248,60,0,249,60,16,248,62,20,248,126,28,248,60,112,253,4,160,253,11,3,255,104,1,252,47,224,118,95,187,169,63,208,251,31,245,239,252,255,255,255,255,253], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,0,7,128,128,4,0,224,31,128,240], i: [0,0,0,0,198,0,64,0,0,48,48,0,8,76,32,4,123,0,0,35,128,2,16,128,0,238,3,0,17,7,65,156,6,193,247,0,65,9,3,1,129,3,225,142,2,121,91,0,132,125,0,162,254,3,176,147,153,160,0,86,192,13,32,128,10,16,0,2,8,128,0,3] },
  { key: '10', w: [255,127,255,223,255,126,223,172,59,27,200,238,59,161,219,119,192,247,48,194,230,13,32,247,62,0,253,14,16,252,79,24,58,31,160,60,15,12,127,31,48,126,15,160,127,11,208,255,12,160,255,143,0,191,156,29,251,59,139,198,54,236,253,175,252,247,159,255,255,238,255,254], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,16,0,0,0,0,0,128,0,0,128,0,0,192,1,192,225,3,0,240,6,0,120], i: [0,0,0,128,107,0,32,4,0,8,28,0,4,18,0,130,125,32,193,41,0,65,28,64,128,251,1,160,136,2,32,102,129,224,123,128,224,133,128,192,193,129,48,87,128,220,45,128,226,27,0,16,255,64,73,192,6,208,4,47,114,6,0,72,1,8,0,1,4,0,0,1] },
  { key: '10', w: [255,124,254,125,223,243,239,168,238,55,65,251,151,66,183,181,192,14,179,192,206,187,65,189,15,1,252,29,40,248,29,64,253,61,0,217,31,124,252,79,196,248,25,112,255,5,160,253,24,193,254,143,1,246,235,0,241,23,179,239,43,214,255,95,255,255,63,255,255,255,252,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,0,0,0,0,0,1,0,0,3,0,129,7,128,193,15,0,233], i: [0,0,0,128,0,0,0,48,0,16,56,0,8,76,32,4,235,64,128,99,0,2,56,128,0,238,3,193,21,7,64,148,2,192,247,0,192,1,0,128,131,3,224,142,1,249,91,0,133,54,0,96,222,3,18,201,142,160,24,94,228,8,0,136,3,48,0,2,8,0,0,4] },
  { key: '10', w: [255,63,255,239,231,57,63,17,119,23,168,236,45,129,219,51,193,199,147,194,230,89,2,212,61,0,255,14,64,120,95,40,187,31,132,185,31,188,189,39,34,254,15,186,253,3,144,252,12,64,255,141,0,255,20,10,248,59,153,244,2,234,223,175,252,255,223,255,255,119,254,253], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,192,0,0,128,1,64,194,3,224,224,7,28,240], i: [0,0,0,64,0,0,0,12,0,8,20,0,4,54,0,194,53,32,193,25,0,0,28,64,0,251,1,224,142,130,32,70,131,224,123,0,224,0,0,192,195,1,48,87,128,252,109,128,194,59,128,48,255,64,137,229,7,192,4,15,114,4,32,68,1,8,0,1,4,0,0,2] },
  { key: '11', w: [255,255,255,252,223,255,254,254,252,255,15,249,223,140,239,255,0,254,255,140,255,187,128,255,187,6,255,191,138,255,127,0,253,127,130,252,127,140,255,127,129,226,127,1,231,255,103,227,239,3,227,59,240,242,199,241,243,251,223,121,239,63,184,255,127,252,255,255,254,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,0,128,64,0,0,193,1,0,129,15,0,7,28,224,15,28,224], i: [0,0,0,0,0,0,0,0,0,32,240,0,0,19,64,0,115,128,4,81,0,0,13,0,1,121,0,129,113,0,128,205,0,128,109,0,128,49,0,128,255,31,128,31,28,0,24,12,1,252,29,200,143,29,58,14,12,4,32,134,0,224,71,8,128,35,0,0,19,0,0,4] },
  { key: '11', w: [255,255,255,255,247,121,191,191,119,159,71,126,190,199,255,63,128,247,63,193,255,63,192,223,63,224,255,63,240,255,143,64,255,159,160,255,15,211,255,159,128,248,191,160,112,255,217,240,255,128,249,15,184,248,97,244,252,255,119,222,251,15,254,255,95,254,255,63,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,128,96,0,128,224,2,192,193,7,240,3,1,112], i: [0,0,0,32,0,0,16,0,0,8,56,0,192,32,16,192,16,0,193,20,32,192,39,0,192,22,0,192,28,0,96,55,128,96,23,128,96,12,128,96,251,135,96,3,142,64,6,138,0,127,6,240,71,6,156,3,67,1,152,33,2,240,17,0,96,17,0,192,4,0,0,2] },
  { key: '11', w: [255,252,254,126,255,251,220,25,239,126,27,250,223,14,239,127,0,78,125,132,255,127,128,63,121,128,255,254,138,255,255,0,254,125,0,253,125,128,239,125,0,240,253,7,228,127,241,241,207,1,227,129,128,243,239,178,224,179,95,252,239,63,240,223,63,252,127,255,252,223,255,253], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,1,0,192,1,0,0,131,0,0,3,26,128,15,36,192,30,0,240], i: [0,0,0,0,198,0,128,0,0,0,224,0,0,149,32,0,115,64,4,91,128,0,143,128,2,93,0,0,113,0,0,141,0,128,93,0,129,57,6,129,253,15,0,13,24,0,24,8,2,252,20,122,11,142,52,4,142,20,32,2,8,192,7,16,128,35,32,0,9,128,0,2] },
  { key: '11', w: [63,127,127,223,223,62,87,195,59,147,71,126,124,242,253,31,161,247,159,129,239,31,129,239,63,224,159,127,208,255,111,97,255,143,161,243,15,242,251,15,0,244,191,16,225,127,240,245,115,1,248,50,68,248,176,206,252,242,51,223,255,15,238,255,111,246,223,191,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,48,0,192,224,4,224,195,7,240,7,0,124], i: [0,0,0,128,49,0,32,0,0,8,60,0,68,5,0,194,20,0,192,54,32,192,50,0,192,22,64,192,60,0,224,98,0,96,30,0,96,12,128,96,254,131,64,3,14,0,12,10,0,123,69,220,69,67,13,1,35,9,136,32,0,240,17,4,96,8,0,64,0,0,128,0] },
  { key: '11', w: [255,253,254,252,223,247,254,230,254,55,8,249,219,15,231,253,0,206,247,132,254,251,64,190,187,196,255,189,12,127,61,0,253,61,128,220,127,12,239,126,131,224,190,3,228,253,117,225,5,6,225,135,192,243,107,121,240,247,255,248,239,15,176,223,127,253,191,255,254,255,255,251], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,0,128,1,0,0,1,0,0,3,1,128,7,0,192,15,28,224], i: [0,0,0,0,1,0,64,0,0,0,240,0,0,148,32,4,83,0,0,89,128,2,197,0,0,29,0,0,241,0,129,237,0,129,125,0,129,17,0,129,237,31,129,15,24,1,24,8,0,248,20,120,15,13,58,6,142,0,32,134,0,224,71,16,128,2,0,0,17,0,0,4] },
  { key: '11', w: [255,191,127,239,245,57,63,187,127,15,70,110,14,187,217,27,129,183,143,129,239,159,192,239,142,161,223,175,64,253,175,64,255,47,160,246,15,130,251,143,128,240,175,0,105,127,24,249,35,65,249,32,224,248,25,254,252,124,51,220,251,15,254,247,47,244,223,159,254,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,128,0,0,128,224,4,192,193,3,240,7,2,120], i: [0,0,0,64,0,0,16,0,0,0,60,0,68,101,8,192,20,0,192,54,0,64,34,64,64,22,0,64,60,0,64,115,128,96,23,128,96,12,128,96,251,135,64,3,138,0,4,10,0,126,2,254,69,69,140,3,67,1,136,35,2,240,1,4,224,8,0,192,4,0,0,2] },
  { key: '12', w: [224,255,255,254,223,239,254,255,223,254,143,179,223,7,255,255,15,222,255,3,191,255,138,247,127,7,248,255,133,241,63,142,241,63,132,249,127,2,229,255,2,248,127,7,254,255,1,252,127,2,192,255,0,128,63,192,207,215,231,255,239,231,255,255,239,255,255,239,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,0,3,0,0,7,0,224,31,0,224], i: [23,0,0,0,0,4,65,0,0,32,112,0,8,240,0,0,176,129,0,156,0,2,124,0,2,242,7,0,121,14,65,112,10,193,113,6,128,77,2,0,241,3,0,201,1,1,78,0,0,240,63,2,254,127,240,63,112,96,48,128,0,48,128,8,16,64,0,16,0,0,16,8] },
  { key: '12', w: [254,255,3,247,255,61,255,175,119,255,209,126,253,224,219,255,193,183,255,192,255,191,192,255,255,0,254,127,0,254,143,17,254,15,32,254,31,0,255,31,128,255,191,196,255,63,4,254,159,0,240,63,0,244,3,248,177,247,250,255,255,251,239,255,251,255,255,251,255,251,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,192,0,0,199,0,192,195,193,193,225,131,192,113], i: [0,0,64,0,0,0,0,0,0,4,14,4,2,60,0,1,60,0,0,55,32,0,13,64,128,252,1,32,223,1,80,204,0,112,222,1,96,207,1,96,110,0,64,59,0,192,11,0,0,254,15,192,255,79,252,7,78,29,4,32,2,4,16,0,4,0,8,4,4,0,4,0] },
  { key: '12', w: [224,255,124,240,127,243,220,167,237,252,15,241,222,128,250,243,10,222,255,3,159,113,0,188,254,4,124,191,133,225,127,68,225,127,196,249,190,3,226,126,130,248,255,0,252,255,1,252,251,0,0,126,0,160,197,132,119,31,153,255,255,223,191,255,255,223,255,239,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,0,3,0,0,7,2,194,15,0,192,30,0,224], i: [0,0,0,0,140,1,130,0,12,32,112,0,17,112,0,8,240,1,0,204,128,4,92,0,0,242,3,2,89,14,131,50,10,193,89,4,1,29,3,1,57,3,1,207,1,2,46,0,2,248,63,128,239,127,244,51,128,224,48,128,8,48,64,16,48,32,0,16,16,0,17,0] },
  { key: '12', w: [254,191,3,255,255,14,247,137,59,207,49,118,127,177,233,127,192,215,63,160,191,175,0,175,94,1,255,95,32,188,7,89,126,15,145,252,15,0,254,31,128,255,191,132,255,95,4,191,175,0,176,31,0,248,0,238,201,103,255,255,250,255,239,255,255,247,251,255,255,191,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,0,194,0,0,198,192,128,193,131,193,97,7,128,124], i: [0,0,0,0,113,0,16,0,1,0,14,4,0,12,8,0,124,0,129,27,32,0,11,32,128,252,0,32,223,65,144,140,1,112,90,1,96,203,0,96,78,0,64,115,0,128,3,64,0,254,79,224,251,15,237,4,32,56,0,0,2,4,16,4,4,8,0,4,0,64,4,192] },
  { key: '12', w: [224,253,252,190,159,231,238,189,220,254,75,177,159,32,106,239,14,222,255,2,157,119,0,57,123,5,252,191,130,225,127,69,225,95,160,249,109,66,228,125,130,242,125,2,255,255,0,232,127,6,160,255,0,32,7,12,248,31,161,255,239,183,255,255,255,255,255,239,255,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,0,7,0,192,15,2,225,15,0,224], i: [0,0,0,0,0,0,0,0,0,32,112,0,16,80,0,8,144,129,4,206,0,0,60,0,2,242,7,0,28,14,129,50,10,129,113,2,129,13,5,1,121,3,1,205,0,1,47,0,0,176,31,130,239,127,240,51,0,228,48,128,8,16,64,16,16,32,32,16,16,0,16,8] },
  { key: '12', w: [126,191,3,255,247,61,187,15,119,205,145,254,30,154,232,63,1,243,61,96,191,190,192,236,95,0,125,191,96,254,7,67,254,15,65,252,31,128,253,47,128,253,191,196,255,31,4,250,175,1,232,31,40,188,3,0,251,101,242,255,251,251,239,255,251,247,255,251,255,247,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,0,0,196,128,128,195,193,192,224,3,193,247], i: [0,0,0,0,0,0,0,0,0,0,14,0,0,4,0,1,116,0,128,19,32,0,15,0,128,252,64,32,135,1,144,140,129,112,158,129,96,199,128,64,238,128,64,51,128,192,11,128,0,254,7,224,251,79,252,12,0,57,12,32,0,12,16,4,4,8,0,4,4,0,4,0] },
  { key: '13', w: [255,231,255,255,223,255,243,191,242,125,61,125,247,47,252,15,6,253,31,43,240,47,157,227,239,159,241,127,15,242,214,133,237,7,12,252,135,0,252,135,114,252,11,228,255,23,241,255,159,227,255,255,243,103,255,7,192,255,15,232,255,255,255,255,255,255,255,255,251,255,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,32,0,0,0,0,0,0,8,0,0,8,0,0,194,0,0,67,39,0,3,255,193,3,255,225,62,0,252], i: [0,0,0,0,0,0,8,96,0,0,192,32,4,193,65,240,178,7,97,144,15,64,80,28,64,128,4,0,240,13,32,120,0,248,123,3,56,169,1,56,153,1,228,13,0,36,12,0,48,12,0,0,12,152,2,248,47,4,240,31,8,0,0,16,0,24,0,0,4,0,112,0] },
  { key: '13', w: [255,243,255,127,223,255,251,215,251,23,151,247,227,95,255,15,10,220,31,1,248,143,246,241,79,191,248,63,15,249,175,2,244,7,6,254,99,7,254,35,51,252,9,235,255,9,251,255,206,243,255,254,251,231,255,7,224,255,31,224,255,255,255,255,255,255,255,255,255,252,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,16,0,0,0,4,0,0,8,0,128,192,0,128,225,4,130,1,255,199,3,255,241,12,0,124], i: [0,0,0,0,0,0,4,32,0,0,96,0,2,224,32,113,113,3,48,216,7,32,8,14,32,64,138,0,248,6,16,188,2,248,121,1,152,208,1,156,148,1,242,4,128,18,4,128,16,4,0,1,12,28,2,252,95,0,248,15,4,0,16,0,0,8,0,0,6,0,112,0] },
  { key: '13', w: [190,254,251,143,127,239,255,103,217,187,62,158,205,48,57,15,87,240,29,11,234,15,141,242,62,158,242,94,10,224,159,150,237,15,0,248,7,0,252,35,242,238,24,249,254,25,217,255,31,235,231,255,203,195,255,23,128,255,119,232,255,255,239,126,255,247,223,255,254,255,239,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,8,0,0,0,9,0,128,1,1,0,131,0,128,67,247,128,2,255,225,31,0,240,124,0,126], i: [0,129,1,96,0,0,16,0,16,0,192,32,132,67,64,242,35,7,98,176,143,0,80,140,193,16,4,33,240,15,0,105,2,176,251,5,48,43,3,121,1,1,229,5,0,36,4,128,34,12,144,0,52,124,0,248,111,0,128,15,0,0,16,0,0,8,129,0,1,0,56,0] },
  { key: '13', w: [95,255,125,55,191,247,83,175,252,1,150,241,101,14,238,14,11,252,13,0,148,14,222,240,79,111,60,63,5,117,3,0,242,3,3,250,3,3,254,103,32,125,6,255,127,130,247,255,172,243,255,238,247,225,249,9,224,251,59,250,231,255,255,247,255,255,238,255,255,126,127,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,128,16,0,0,16,0,0,0,0,1,128,8,0,128,96,0,128,97,4,194,3,255,241,6,0,120,62,0,62], i: [192,64,0,16,0,0,8,48,8,4,96,16,194,177,32,241,208,67,48,153,67,128,32,14,32,0,138,0,248,128,208,53,129,248,189,0,152,132,0,128,156,128,240,4,128,144,4,0,16,4,88,1,28,30,2,252,23,4,224,7,8,0,0,16,0,4,192,0,1,0,12,0] },
  { key: '13', w: [223,195,247,95,95,238,91,207,176,29,52,109,135,162,252,18,68,222,15,9,245,14,9,224,191,156,242,79,18,226,31,150,237,15,1,245,143,2,252,199,112,250,11,248,255,30,233,255,157,234,247,223,147,108,255,7,224,255,247,252,247,255,255,254,255,255,255,255,255,191,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,1,0,128,3,2,128,2,129,225,15,0,240,30,0,248], i: [128,0,0,32,0,0,8,96,0,0,192,32,0,97,65,226,35,0,96,16,15,65,48,20,64,0,4,32,224,13,128,105,2,208,251,0,48,9,3,56,9,1,229,13,0,161,4,0,0,12,0,32,12,144,0,248,103,4,128,7,8,0,0,0,0,8,0,0,2,0,226,0] },
  { key: '13', w: [239,227,251,127,7,247,141,87,217,7,150,178,71,150,238,11,11,235,31,17,249,134,118,178,79,107,248,119,9,241,111,1,244,135,6,254,3,7,242,39,57,253,4,251,255,142,242,255,108,242,255,254,59,199,255,5,224,255,127,254,239,255,235,255,255,255,239,255,255,255,255,253], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,24,0,0,0,0,0,0,0,0,128,0,0,128,1,0,128,1,136,229,7,0,248,31,0,124], i: [0,0,0,16,0,0,0,48,0,4,96,0,130,161,0,241,51,64,176,136,7,64,8,12,32,0,130,32,240,2,144,36,1,248,57,1,152,132,0,136,156,0,242,4,128,16,4,144,16,4,24,33,4,24,2,248,23,4,192,7,0,0,16,8,0,0,0,0,3,0,112,0] },
  { key: '14', w: [255,11,254,255,175,255,223,231,242,255,7,252,191,1,220,255,1,255,61,62,253,223,59,253,63,84,254,191,0,252,127,0,250,127,2,250,127,134,255,63,1,224,15,66,192,133,171,255,231,239,255,251,239,255,255,239,255,255,239,255,255,239,255,255,255,255,255,255,127,255,255,63], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,4,195,0,1,3,130,1,7,198,193,15,0,112,62,0,56], i: [32,112,0,16,112,0,0,48,0,4,248,67,2,238,131,1,126,128,192,129,0,0,132,0,0,134,1,0,239,3,128,191,3,128,157,1,0,56,0,0,254,31,128,223,63,120,16,0,25,16,128,0,16,128,4,16,96,0,16,32,8,16,16,0,0,4,0,0,3,0,64,0] },
  { key: '14', w: [127,7,255,255,47,221,255,99,187,255,7,238,255,1,252,63,128,255,63,112,253,222,84,253,62,20,252,191,0,252,127,0,254,127,1,254,127,134,255,63,0,224,62,66,240,197,171,255,245,239,255,250,239,255,255,239,255,255,239,255,255,255,255,255,255,255,255,255,191,255,255,31], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,65,0,0,195,130,0,7,206,224,15,0,176,31,0,28], i: [32,120,0,8,112,0,0,80,0,2,252,67,0,238,67,1,118,128,192,133,0,0,132,0,0,194,0,0,239,3,128,191,2,192,157,1,0,24,0,0,254,31,128,255,31,120,16,0,24,16,128,1,16,128,0,16,32,4,16,0,0,16,16,0,0,4,0,0,1,0,64,0] },
  { key: '14', w: [255,7,239,255,139,253,255,171,251,255,3,110,191,1,222,127,0,255,63,94,252,255,86,252,63,44,253,255,16,252,127,0,254,127,1,248,255,134,253,63,3,224,127,224,208,133,163,255,245,231,255,251,239,255,255,239,255,255,239,255,255,239,255,255,255,255,254,255,255,255,255,191], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,64,1,15,193,1,240,1,226,224,6,0,240,31,0,184], i: [16,56,0,0,112,0,8,80,0,2,252,1,0,238,67,0,103,0,192,129,0,0,128,0,0,210,0,0,239,3,128,143,2,128,156,0,0,24,0,0,254,63,128,255,63,121,24,128,25,24,128,0,24,64,2,16,0,4,16,32,8,16,16,0,16,4,0,0,1,1,96,0] },
  { key: '14', w: [255,71,239,255,199,221,255,235,251,255,3,238,191,1,254,95,128,255,31,0,254,255,53,254,31,57,255,63,0,252,127,0,254,127,3,253,127,130,255,63,1,224,127,224,192,131,227,255,240,231,255,253,231,191,255,231,255,255,231,255,255,231,255,255,255,255,254,255,255,254,255,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,192,0,31,195,1,254,3,192,224,6,0,240,14,0,252], i: [16,60,0,0,120,0,4,80,16,0,252,1,0,239,1,33,55,64,224,192,128,0,192,0,0,194,0,128,239,3,128,151,1,128,220,0,0,28,0,0,254,31,128,255,63,124,24,128,29,24,128,0,24,64,2,24,0,4,24,32,8,24,16,0,16,4,0,0,1,0,100,0] },
  { key: '14', w: [251,7,254,223,67,253,255,103,251,255,3,254,255,0,254,63,128,255,31,24,255,255,24,255,31,20,255,191,8,252,127,0,254,127,1,252,255,198,255,159,1,224,111,98,224,129,227,127,225,231,255,255,231,255,255,231,255,255,231,255,255,247,255,255,255,255,254,255,255,252,255,191], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,142,192,0,207,195,1,195,3,192,225,6,0,224,28,0,48], i: [0,56,0,8,56,0,4,24,0,2,252,1,0,239,65,1,55,0,224,192,128,0,196,128,0,202,0,0,231,3,128,183,1,192,220,1,0,56,0,0,254,31,128,255,63,124,24,128,29,24,0,1,24,0,0,24,32,4,24,48,0,24,16,0,8,4,0,0,1,0,0,0] },
  { key: '14', w: [60,189,247,191,7,238,223,227,241,255,131,228,190,1,93,88,1,254,62,0,62,29,59,253,63,20,253,126,33,248,254,0,242,126,1,232,126,133,224,62,3,224,45,194,208,2,131,99,35,207,255,217,207,255,247,199,255,255,239,255,223,239,255,255,255,127,255,127,255,127,255,191], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,131,0,1,7,194,193,15,198,97,31,0,248,62,0,60], i: [192,8,0,0,120,0,8,48,16,4,88,1,0,110,67,2,198,1,193,199,128,192,133,0,0,194,0,0,78,3,0,191,0,128,188,1,128,56,0,0,254,31,192,47,63,249,32,128,26,40,0,2,56,64,4,56,0,0,16,32,0,16,16,32,0,6,0,129,0,0,100,0] },
  { key: '14', w: [222,141,247,79,11,236,243,99,210,241,201,167,191,1,173,220,1,191,63,64,254,24,108,252,47,4,252,126,16,252,126,1,248,62,1,250,127,134,232,127,1,224,76,192,240,196,195,195,35,239,255,217,239,191,247,239,255,255,239,255,223,239,255,127,239,123,255,127,127,127,247,190], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,67,0,4,131,128,192,7,206,96,31,0,120,62,0,188], i: [192,0,0,48,112,0,8,112,0,4,56,33,2,110,66,2,238,65,192,149,128,193,129,0,0,210,0,0,111,3,128,175,2,128,157,1,128,40,0,0,246,31,193,30,47,249,16,128,24,16,192,2,16,64,0,16,32,0,16,0,0,16,8,0,16,4,0,128,0,0,44,0] },
  { key: '14', w: [191,141,251,191,65,238,223,163,219,151,64,242,190,1,36,63,0,255,60,192,124,15,31,253,62,52,255,62,0,252,126,1,248,126,0,252,254,0,248,62,1,224,55,192,241,36,235,119,39,239,255,219,239,255,255,207,223,239,207,255,223,223,255,103,255,255,254,123,255,61,223,191], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,128,65,1,132,195,1,241,3,240,241,30,0,248,61,0,188], i: [64,8,0,16,56,0,8,80,16,0,184,1,2,255,67,0,174,1,225,55,128,192,193,0,0,194,0,0,111,3,128,190,2,128,95,1,128,56,0,0,254,31,192,14,31,249,16,128,24,0,0,0,0,64,0,16,32,4,16,16,0,16,8,32,0,4,0,192,0,1,42,0] },
  { key: '14', w: [175,157,123,231,1,238,247,61,217,251,129,161,254,1,127,175,1,61,14,192,254,63,69,126,62,44,255,255,64,252,127,1,254,255,2,252,190,134,240,63,0,224,47,224,209,133,67,195,48,199,255,219,199,255,246,231,255,255,231,255,223,255,247,127,255,255,222,127,255,254,219,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,1,0,156,199,129,241,7,192,224,30,0,248,46,0,126], i: [64,0,0,16,120,0,8,80,16,4,56,33,0,254,1,0,238,64,225,15,0,192,145,128,0,194,0,0,235,3,128,146,0,0,157,1,64,56,0,0,254,31,192,14,175,120,24,128,25,24,0,0,24,64,2,24,32,0,24,0,0,24,8,0,0,2,128,129,0,0,108,0] },
  { key: '14', w: [175,204,123,191,71,238,239,47,217,255,199,243,152,1,236,167,0,127,12,148,254,63,4,255,31,48,126,94,8,250,63,1,248,127,1,252,94,64,240,63,0,96,103,224,112,228,99,247,55,227,191,235,227,191,255,195,223,255,199,255,223,247,255,119,255,123,223,127,255,127,251,255], r: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,132,129,128,236,131,129,225,7,98,96,31,0,112,31,0,120], i: [64,0,0,16,56,0,0,88,0,0,184,32,2,231,1,0,162,64,225,75,0,192,208,0,0,202,128,0,235,129,128,183,1,128,95,0,128,52,0,0,254,159,192,14,159,249,8,0,24,8,64,2,24,64,0,24,32,4,24,16,0,24,8,0,24,6,0,192,0,0,38,128] }
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
      for (let py = 0; py < PW; py++) {
        for (let px = 0; px < PW; px++) {
          const sx = Math.round(cx - radius + (px + 0.5) * stepPx);
          const sy = Math.round(cy - radius + (py + 0.5) * stepPx);
          if (sx < 1 || sy < 1 || sx >= w - 1 || sy >= h - 1) continue;
          const i = (sy * w + sx) * 4;
          var R = pixels[i], G = pixels[i + 1], B = pixels[i + 2];
          if (g !== 1) {
            R = R * g > 255 ? 255 : (R * g) | 0;
            G = G * g > 255 ? 255 : (G * g) | 0;
            B = B * g > 255 ? 255 : (B * g) | 0;
          }

          const idx = py * PW + px;
          const du = (px - halfP) / halfP, dv = (py - halfP) / halfP;
          const rr = Math.sqrt(du * du + dv * dv);
          if (isPureGreen(R, G, B)) { skipped++; continue; }
          // 白色高亮圈：既不是墨也不是暖色，直接跳过，
          // 否则它会把整格的 ink/warm 拉成 0。
          if (R > 200 && G > 200 && B > 200) { skipped++; continue; }
          // 外圈的「红色高亮圈」：亮红、绿通道很低，和棋子盘面/红字都不同。
          // 圈落在 rr≈0.8~0.95，只在这一圈里判，不影响中心字形。
          if (rr > 0.66 && R > 150 && G < 125 && (R - G) > 60) { continue; }

          const L = 0.299 * R + 0.587 * G + 0.114 * B;
          const rb = R - B;
          const isWarm = (rb > 22 && R > 80);
          const isRed = (R > 85 && (R - G) > 45 && rb > 45);

          patchValid[idx] = 1;
          patchW[idx] = isWarm ? 255 : 0;
          patchR[idx] = isRed ? 255 : 0;

          sumL += L; n++;
          if (isRed) red++;
          if (L < 72) dark++;
          if (L > 178) bright++;
          if (isWarm) warm++;

          // ---- 墨迹特征（核心判据）----
          // 棋子上的「字」是深色或红色，而棋子盘面、棋盘、绿点、高亮圈都是亮的。
          // 区分「红字」和「暖色盘面」靠绿通道：
          //   红字 (170, 30, 30)  G 极低（约 30）
          //   盘面 (200,150,100)  G 中等（约 150）
          // 之前只用 R-G>45，盘面 R-G=50 也被算成红字，导致黑子全被判成红子。
          const isRedInk = (R > 95 && G < 115 && (R - G) > 55 && (R - B) > 65);
          const isDarkInk = (L < 85) && !isRedInk;
          patchI[idx] = (isRedInk || isDarkInk) ? 255 : 0;
          if (isRedInk || isDarkInk) ink++;
          if (isRedInk) redInk++;
          if (isDarkInk) darkInk++;
          // 中心 8x8 单独统计墨迹：高亮圈的深色描边只落在极外圈，
          // 全图统计会把它算成「黑墨」，于是刚走过的红仕被判成黑兵。
          if (py >= 6 && py <= 17 && px >= 6 && px <= 17) {
            coreN++;
            if (isRedInk || isDarkInk) coreInk++;
            if (isRedInk) coreRedInk++;
            if (isDarkInk) coreDarkInk++;
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
      this.refineLowConfidence(out, pixels, w, h, pts, cell, radius);
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
  refineLowConfidence(stats, pixels, w, h, pts, cell, radius) {
    let fixed = 0, budget = 14;
    const OFFS = [-1, 0, 1];
    const SCALES = [1.0, 1.16, 1.30];

    for (let sq = 0; sq < 90 && budget > 0; sq++) {
      const s = stats[sq];
      if (!s || !s.patchW) continue;
      // 明显是空格就别浪费预算
      const warm = s.warmR || 0;
      const inkCore = s.inkCoreR || 0;
      if (warm < 0.24 && inkCore < 0.10) continue;

      const m0 = this.matchCell(s);
      if (m0.key !== 'E' && m0.score >= 0.55) continue;   // 已经很确定

      budget--;
      const cx = pts[sq * 2], cy = pts[sq * 2 + 1];
      const off = cell * 0.09;
      let bestStats = s, bestScore = (m0.key === 'E') ? -2 : m0.score;

      for (let si = 0; si < SCALES.length; si++) {
        const r = Math.max(3, Math.round(radius * SCALES[si]));
        for (let dy = 0; dy < 3; dy++) {
          for (let dx = 0; dx < 3; dx++) {
            if (si === 0 && dx === 1 && dy === 1) continue;  // 原位置已经试过
            const nx = cx + OFFS[dx] * off;
            const ny = cy + OFFS[dy] * off;
            const ns = this.sampleCell(pixels, w, h, nx, ny, r, true);
            const nm = this.matchCell(ns);
            if (nm.key !== 'E' && nm.score > bestScore) {
              bestScore = nm.score;
              bestStats = ns;
            }
          }
        }
      }

      if (bestStats !== s && bestScore >= 0.55) {
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
    for (const key in this.templates) {
      const arr = this.templates[key];
      let typeBest = -9;
      for (let t = 0; t < arr.length; t++) {
        const tpl = arr[t];
        let dotW = 0, dotR = 0, dotI = 0;
        for (let i = 0; i < n; i++) {
          const wi = wgt ? wgt[i] : 1;
          dotW += wi * vw[i] * tpl.w[i];
          dotR += wi * vr[i] * tpl.r[i];
          if (vi && tpl.i) dotI += wi * vi[i] * tpl.i[i];
        }
        // 三通道加权：暖色（盘面）+ 红色（红字）+ 墨迹（笔画形状）
        // 只比暖色/红色时，馬 的模板对任何棋子都能拿到 1.1 分以上，
        // 真正的車 反而只有 0.94，于是红俥被认成红傌（实测两格）。
        // 笔画掩码直接比字形，車 和 馬 立刻分开。
        // 【兵种只看笔画】
        //   红子的盘面几乎都是同一块米黄圆片，暖色/红色两个通道对「是哪个子」毫无区分度，
        //   把它们混进打分反而把字形淹掉：实测红俥排序第 4，输给了炮和相。
        //   颜色已经由墨迹颜色单独判过（红/黑），这里只需要比字形。
        const score = tpl.i ? dotI : (dotW + dotR * 0.3);
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
    out[(9 - r) * 9 + c] = grid[sq];
  }
  return out;
}

/** 上下翻转一张兵种编码表 */
function flipCodes(codes) {
  var out = new Int8Array(90);
  for (var sq = 0; sq < 90; sq++) {
    var r = (sq / 9) | 0, c = sq % 9;
    out[(9 - r) * 9 + c] = codes[sq];
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
      details: details
    };
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
    (function detectOrientation(g) {
      var r = 0, b = 0;
      for (var rr = 8; rr <= 9; rr++) {
        for (var cc = 0; cc < 9; cc++) {
          var v = g[rr * 9 + cc];
          if (v === 1) r++; else if (v === 2) b++;
        }
      }
      var vote = null;
      if (b >= r + 3) vote = 'black';
      else if (r >= b + 3) vote = 'red';
      if (!vote) return;
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
    })(cls.grid);

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
