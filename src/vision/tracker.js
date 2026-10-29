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
    this.confirmFrames = 2;
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
