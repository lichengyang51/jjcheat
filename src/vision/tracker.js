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
