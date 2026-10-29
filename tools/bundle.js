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
  'vision/templates',
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
    // 允许省略 .js —— 生成器与 recognizer 里的写法都是 './templates.js'
    if (sources.has(dep) || fs.existsSync(path.join(SRC, dep + '.js'))) { readModule(dep); continue; }
    const stripped = dep.replace(/\.js$/, '');
    readModule(stripped);
  }
}

for (const f of ENTRY_FILES) {
  const id = f.replace(/\.js$/, '');
  readModule(id);
}

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
function codesUsable(codes) {
  var n = 0;
  for (var i = 0; i < 90; i++) if (codes[i]) n++;
  return n >= 4;
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
    if ((firstLatch || codesSettled) && cls.codes && codesUsable(cls.codes)) {
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
      out.engineFen = directFen;
      out.sideToMove = mySideDetected;
      try { session.tracker.pos.setFen(directFen); } catch (e) {}
    } else {
      // 还在等识别稳定，沿用上一次的结论
      out.fen = session.lastRawFen || session.lastBoardFen || session.tracker.fen;
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
