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
