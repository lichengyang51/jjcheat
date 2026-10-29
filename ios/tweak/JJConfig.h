#ifndef JJConfig_h
#define JJConfig_h

/* ============================================================
 *  JJCheat 运行配置
 * ============================================================ */

/* 每步搜索思考时长（毫秒）。越大越强，越费电 */
#define JJ_TIME_MS              900

/* 抓帧频率（每秒）。8 帧足够跟上 JJ象棋 的落子节奏 */
#define JJ_SCAN_FPS             8

/* 连续多少帧识别一致才认为局面稳定（防手抖/动画中间帧） */
#define JJ_STABLE_FRAMES        2

/* 顶部信息条高度（point） */
#define JJ_HUD_TOP_HEIGHT       54.0

/* 箭头线宽（point） */
#define JJ_ARROW_WIDTH          7.0

/* 建议走法箭头颜色 */
#define JJ_COLOR_ARROW          [UIColor colorWithRed:1.00 green:0.20 blue:0.20 alpha:0.92]
#define JJ_COLOR_ARROW_HEAD     [UIColor colorWithRed:1.00 green:0.15 blue:0.15 alpha:0.98]
#define JJ_COLOR_BOARD_LINE     [UIColor colorWithRed:1.00 green:0.35 blue:0.35 alpha:0.55]
#define JJ_COLOR_PANEL_BG       [UIColor colorWithRed:0.04 green:0.05 blue:0.08 alpha:0.86]
#define JJ_COLOR_TEXT_MAIN      [UIColor colorWithRed:1.00 green:0.95 blue:0.55 alpha:1.0]
#define JJ_COLOR_TEXT_SUB       [UIColor colorWithRed:0.72 green:0.86 blue:1.00 alpha:1.0]

/* 引擎脚本安装路径（Theos layout 会放到这里） */
#define JJ_ENGINE_PATH          @"/Library/Application Support/JJCheat/engine.js"
#define JJ_ENGINE_PATH_ROOTLESS @"/var/jb/Library/Application Support/JJCheat/engine.js"

/* 配置持久化 key */
#define JJ_KEY_CORNERS          @"JJCheat.corners"
#define JJ_KEY_ENABLED          @"JJCheat.enabled"
#define JJ_KEY_CALIBRATED       @"JJCheat.calibrated"

#endif /* JJConfig_h */
