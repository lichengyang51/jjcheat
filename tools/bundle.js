'use strict';
/*
 * 打包器：把 src/ 下的 CommonJS 模块打成单个 IIFE，
 * 让 iOS 的 JavaScriptCore 一句 evaluateScript 就能用，无需 require。
 *
 * 输出：dist/engine.js   暴露全局 JJEngine
 * 用法：node tools/bundle.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const OUT_DIR = path.join(__dirname, '..', 'dist');

const ENTRY_FILES = [
  'cst/constants',
  'cst/position',
  'cst/notation',
  'cst/eval',
  'cst/search',
  'vision/recognizer',
  'vision/tracker'
];

// 模块 id -> 源码
const sources = new Map();

function normId(fromId, reqPath) {
  // 归一化相对路径
  const fromDir = path.posix.dirname(fromId);
  let p = path.posix.normalize(path.posix.join(fromDir, reqPath));
  // 去掉前导 './'
  p = p.replace(/^\.\//, '');
  return p;
}

function readModule(id) {
  if (sources.has(id)) return;
  const file = path.join(SRC, id + '.js');
  if (!fs.existsSync(file)) throw new Error('模块不存在: ' + file);
  const code = fs.readFileSync(file, 'utf8');
  sources.set(id, code);
  // 递归解析依赖
  const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const dep = normId(id, m[1]);
    readModule(dep);
  }
}

for (const f of ENTRY_FILES) readModule(f);

// 生成模块表
let out = '';
out += '/* ============================================================\n';
out += ' *  JJ象棋 辅助引擎内核 —— 单文件打包\n';
out += ' *  目标运行环境: iOS JavaScriptCore / Node / 浏览器\n';
out += ' *  生成时间: ' + new Date().toISOString() + '\n';
out += ' *  模块数: ' + sources.size + '\n';
out += ' * ============================================================ */\n';
out += '(function (global) {\n';
out += "'use strict';\n";
out += 'var __modules = {};\n';
out += 'var __cache = {};\n';

for (const [id, code] of sources) {
  out += '\n/* ---- ' + id + ' ---- */\n';
  out += '__modules[' + JSON.stringify(id) + '] = function (module, exports, require) {\n';
  out += code;
  out += '\n};\n';
}

out += `
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

/** 局面合法性校验：识别错了宁可不用，也不要拿错局面算棋 */
function validateCodes(codes) {
  var redK = 0, blkK = 0, redN = 0, blkN = 0;
  var redA = 0, blkA = 0, redE = 0, blkE = 0;
  for (var i = 0; i < 90; i++) {
    var v = codes[i];
    if (!v) continue;
    if (v === 1) redK++;
    else if (v === 8) blkK++;
    else if (v === 2) redA++;
    else if (v === 9) blkA++;
    else if (v === 3) redE++;
    else if (v === 10) blkE++;
    if (v >= 1 && v <= 7) redN++;
    else if (v >= 8 && v <= 14) blkN++;
  }
  if (redK !== 1 || blkK !== 1) return false;
  if (redN > 16 || blkN > 16) return false;
  if (redA > 2 || blkA > 2) return false;
  if (redE > 2 || blkE > 2) return false;
  // 士和象必须在自己的九宫/半场
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
    return session.tracker.fen;
  },

  /** 在开局局面状态下学习棋盘背景 */
  learnBoard: function (pixels, w, h) {
    if (!session.recognizer) throw new Error('未标定');

    var stats = session.recognizer.sampleAll(pixels, w, h, true);
    session.recognizer.learnBackground(stats, []);

    var startMap = TRK.startPieceMap();
    var expectedBoard = startMap;   // 标准开局的兵种编码表

    function compare(a, b) {
      var d = 0;
      for (var i = 0; i < 90; i++) if (a[i] !== b[i]) d++;
      return d;
    }

    // ★ 朝向判定（关键：不能「学的时候翻一次、验的时候再翻回来」，那样自己抵消）
    //   做法：用两套标签各学一次模板，各自直接和标准开局的兵种表比对。
    //     标签 = 标准布局（红在下）  → 若画面确实是红在下，误差小
    //     标签 = 翻转布局（黑在下）  → 若画面其实是黑在下，误差小
    //   标签和画面匹配的那一套，误差必然更小。

    // A：假定画面是标准朝向（红在下）
    session.flipped = false;
    session.recognizer.learnTemplates(stats, startMap);
    var clsA = session.recognizer.classify(stats);
    var diffNormal = (clsA && clsA.codes) ? compare(clsA.codes, expectedBoard) : 999;

    // B：假定画面是翻转朝向（黑在下）
    session.recognizer.learnTemplates(stats, flipPieceMap(startMap));
    var clsB = session.recognizer.classify(stats);
    var diffFlipped = (clsB && clsB.codes) ? compare(clsB.codes, expectedBoard) : 999;

    var verifyDiff;
    if (diffFlipped < diffNormal) {
      session.flipped = true;
      session.recognizer.learnTemplates(stats, flipPieceMap(startMap));
      verifyDiff = diffFlipped;
    } else {
      session.flipped = false;
      session.recognizer.learnTemplates(stats, startMap);
      verifyDiff = diffNormal;
    }
    var ok = (verifyDiff <= 6);

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
      diffNormal: diffNormal,
      diffFlipped: diffFlipped
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

  /** 自动检测并直接应用（一步到位） */
  autoCalibrate: function (pixels, w, h) {
    var r = JJEngine.autoDetectBoard(pixels, w, h);
    if (!r) return { ok: false };
    JJEngine.setCorners(r);
    return { ok: true, corners: r };
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
    // 画面翻转时（用户执黑）翻回标准坐标，引擎内部一律「红在下」
    var grid = session.flipped ? flipGrid(cls.grid) : cls.grid;

    // ★ 自动判定「我执红还是执黑」
    //   由画面朝向决定：黑在下 = 我执黑，红在下 = 我执红。
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
      stable: isStable ? 1 : 0
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
    var codesSettled = (session.codesStable >= 1);

    if (codesSettled && cls.codes && validateCodes(cls.codes)) {
      codesOk = true;
      var boardFen = codesToBoardFen(cls.codes);
      if (boardFen !== session.lastBoardFen) {
        // 局面变了 → 刚有人走完，现在轮到我这一方
        session.lastBoardFen = boardFen;
        session.sideToMoveNow = mySideDetected;
        out.moveDetected = true;
        session.lastResult = null;    // 强制重算
      }
      directFen = boardFen + ' ' +
        (session.sideToMoveNow === 'red' ? 'w' : 'b') + ' - - 0 1';
      out.fen = directFen;
      try { session.tracker.pos.setFen(directFen); } catch (e) {}
    } else if (cls.codes && !validateCodes(cls.codes)) {
      // 识别出的局面不合法（缺将/多子），明确告知，不要拿错局面算棋
      out.detectFail = true;
      out.detectDiff = -1;
      out.fen = session.lastBoardFen || session.tracker.fen;
    } else {
      // 还在等识别稳定，沿用上一次的结论
      out.fen = session.lastBoardFen || session.tracker.fen;
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
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, 'engine.js');
fs.writeFileSync(outFile, out, 'utf8');

const stat = fs.statSync(outFile);
console.log('打包完成');
console.log('  模块数 :', sources.size);
console.log('  输出   :', outFile);
console.log('  体积   :', (stat.size / 1024).toFixed(1), 'KB');
console.log('  模块列表:');
for (const id of sources.keys()) console.log('    -', id);
