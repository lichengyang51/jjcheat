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
    var stats = session.recognizer.sampleAll(pixels, w, h, true);
    var empty = TRK.startEmptySquares();
    session.recognizer.learnBackground(stats, empty);
    session.recognizer.learnTemplates(stats, TRK.startPieceMap());
    return {
      bgMeanL: session.recognizer.bgModel.meanL,
      templateCount: session.recognizer.templates.length
    };
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
