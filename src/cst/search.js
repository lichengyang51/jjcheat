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
