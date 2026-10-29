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
