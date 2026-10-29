# JJ象棋 iPhone 实时辅助

在 JJ象棋 APP 的棋盘上直接画出「这一步该走哪」的红色箭头，顶部显示中文着法、分值、胜率、搜索深度。

**全机内运行**：识别、推演、标注都在 iPhone 里完成，不联外网、不需要电脑、不需要第二台设备。

---

## 两条实现路线，按你的机器选

| 你的机器 | 走哪条 | 效果 | 文档 |
|---|---|---|---|
| iPhone 8 / X / SE1 / 7 / 6s（iOS 15–18）<br>iPhone XS~14（iOS 15.0–16.6.1） | **越狱 Tweak**：`ios/tweak/` | 箭头**直接画在 JJ象棋 棋盘上** | 本文件 |
| **iPhone 15 / 16 / 17 任何版本**<br>iPhone XS~14（iOS 17.0.1 以上） | **录屏 + 画中画**：`ios/app/` | 浮窗里画棋盘+箭头，可放大拖到棋盘位置盖上去 | [`ios/app/使用说明.md`](ios/app/使用说明.md) |

两条路线共用同一个引擎内核 `dist/engine.js`，棋力完全一致。

> **iPhone 16 Pro Max / iOS 26.7 走 `ios/app/` 那条。** 这台机器的芯片和系统都没有越狱手段，`ios/tweak/` 装不上。

---

## 一、先看清前提（仅越狱路线）

iOS 系统的沙箱**不允许**任何 APP 读取别的 APP 的屏幕内容，也不允许在别的 APP 上叠画东西。
`设置 → 辅助功能` 里没有这类开关——那里只有辅助触控、切换控制、引导式访问，都读不了屏。

所以要在 JJ象棋 的棋盘上画箭头，只有一条路：**越狱 + Tweak 注入**。

| 设备 | iOS 版本 | 越狱工具 | 本项目 |
|---|---|---|---|
| iPhone XS ~ 14 系列 | 15.0 – 16.6.1 | Dopamine 2（无根） | ✅ 直接可用 |
| iPhone 8 / X / SE1 / 7 / 6s（A11 及以下） | 15.0 – 18.x | palera1n（checkm8，永不失效） | ✅ 直接可用 |
| iPhone XS ~ 14 | 17.0.1 及以上 | 暂无 | ⚠️ 只能走悬浮窗形态 |
| iPhone 15 / 16 / 17 | 任何版本 | 暂无 | ⚠️ 只能走悬浮窗形态 |

判断方法：`设置 → 通用 → 关于本机` 看型号和系统版本，对号入座。

---

## 二、它怎么知道棋走到了哪一步

这是整个东西最关键的巧思，也是识别率能拉到接近 100% 的原因。

**它不认字。** 不识别「車馬炮」三个字，不识别人脸一样识别棋子。

1. 中国象棋**开局是固定的**，32 个子在哪儿是死数。
2. 之后每一步，程序拿「上一局面」枚举出**全部合法走法**（通常 40 步左右）。
3. 对每一个候选走法，模拟走完，压成一张「哪格是空 / 哪格是红子 / 哪格是黑子」的三分类图。
4. 跟摄像头（这里是屏幕像素）看到的三分类图逐格比对，**差异格数为 0 的那一步就是真实走法**。

所以程序只需要判断每个交叉点是「空、有红子、有黑子」三种情况之一，不需要知道是什么兵种。
兵种身份全部由规则反推出来——马走日、象走田、炮要隔子，规则本身就把身份锁死了。

两个同兵种都能走到同一格时（比如两个兵都能并到中路），起点格「变空」的差异会自动把另一个排除掉。

---

## 三、目录

```
jjchess/
├── src/cst/                引擎（纯 JS，iOS 和电脑通用）
│   ├── constants.js        棋子编码、UCCI 坐标、走法编码
│   ├── position.js         棋盘表示、走法生成、合法性、Zobrist
│   ├── notation.js         中文记谱（炮二平五 / 车８进３）
│   ├── eval.js             评估函数（子力 + 位置表 + 王安全）
│   └── search.js           迭代加深 + PVS + 置换表 + 空着裁剪 + LMR
├── src/vision/             视觉识别（纯 JS）
│   ├── recognizer.js       四点标定、90 交叉点采样、三分类、模板
│   └── tracker.js          合法走法比对、走法追踪
├── dist/engine.js          打包产物（65 KB，iOS 上被 JSC 直接加载）
├── ios/tweak/              越狱 Tweak
│   ├── Tweak.xm            注入入口、GL 抓帧 hook
│   ├── JJScreenGrabber.m   CARenderServer / GL / CALayer 三路抓帧
│   ├── JJEngineBridge.m    JavaScriptCore 桥
│   ├── JJHUDWindow.m       HUD 窗口、棋盘箭头、顶部面板、四点标定
│   ├── JJController.m      主循环、悬浮球、状态机
│   └── layout/             安装到设备的资源
├── tools/
│   ├── perft.js            走法生成严格自检
│   ├── bench.js            引擎基准测试
│   ├── bundle.js           打包器
│   └── test-bundle.js      沙箱端到端测试
└── .github/workflows/      云编译
```

---

## 四、编译（没有 Mac 也能做）

用 GitHub Actions 云端编译，你需要一个 GitHub 账号，不需要 Mac、不需要 Xcode。

1. 把整个 `jjchess` 目录传到一个 GitHub 仓库（私有仓库也行，Actions 私有仓库每月 2000 分钟免费）。
2. 进仓库 → **Actions** → 左侧选 `build-jjcheat` → 右侧 **Run workflow** → 绿色按钮。
3. 等 3–6 分钟。
4. 点进这次运行记录，页面底部 **Artifacts** 下载 `JJCheat-deb`，解压得到 `.deb`。

`dist/engine.js` 也会单独作为 `JJCheat-engine-js` 附件给你，改引擎参数时方便直接替换，不用重编。

---

## 五、安装

### 方式 A：Sileo / Zebra（推荐）

把 `.deb` 传到手机上，用 Filza 点开选「安装」，或：

```bash
# 电脑上通过 SSH（OpenSSH 已装的情况下）
scp com.fujiang.jjcheat_1.0.0_iphoneos-arm.deb root@<手机IP>:/var/root/
ssh root@<手机IP>          # 默认密码 alpine
dpkg -i /var/root/com.fujiang.jjcheat_1.0.0_iphoneos-arm.deb
killall -9 SpringBoard
```

无根越狱（Dopamine）会自动装到 `/var/jb`，路径 Theos 已经处理好。

### 方式 B：直接丢 dylib

不想装 deb 的话，把 deb 用 7-Zip 解开，取出：

```
/Library/MobileSubstrate/DynamicLibraries/JJCheat.dylib
/Library/MobileSubstrate/DynamicLibraries/JJCheat.plist
/Library/Application Support/JJCheat/engine.js
```

三样按原路径拷进设备（Filza 拖进去），然后 `killall -9 SpringBoard`。

---

## 六、使用

### 第 1 次：四点标定

1. 打开 JJ象棋，进到有棋盘的界面（随便一局，或练习场）。
2. 屏幕右侧出现一个红色「象棋」悬浮球，屏幕上会出现 **深色遮罩 + 打点提示**。
3. 依次点棋盘最外圈的 4 个交叉点：
   - **左上角**（黑方底线最左的交叉点）
   - **右上角**（黑方底线最右的交叉点）
   - **右下角**（红方底线最右的交叉点）
   - **左下角**（红方底线最左的交叉点）
4. 点完第 4 个自动退出标定模式，顶部提示「标定完成」。

标定坐标存进 `NSUserDefaults`，以后不用再标。

### 第 2 次：学习棋盘

退出当前对局，**重新开一局**（让画面停在标准开局布局），程序会自动：

- 采集 58 个空位的木纹背景统计，算出「有子 / 没子」的自适应阈值
- 采集 32 个棋子的图像模板（这时身份已知，因为开局是固定的）
- 顶部提示「正在学习棋盘…」→ 学习完成后自动进入运行状态

这一步只需要做一次，之后一直有效。

### 日常使用

开始对局。对方每走一步：

- 棋盘上弹出**红色粗箭头**，从起点格指到终点格，两端有高亮圈
- 顶部面板显示：`炮二平五  +1.35` ／ `红方胜率 71.2% ███████░░░  深12`

悬浮球操作：

| 操作 | 作用 |
|---|---|
| 单击 | 显示 / 隐藏 HUD（想纯手动下棋时用） |
| 长按 | 重新四点标定（换手机、转屏、APP 改版后） |
| 拖动 | 挪位置 |

---

## 七、参数调整

改 `ios/tweak/JJConfig.h`：

```c
/* 每步搜索思考时长（毫秒）。越大越强，越费电 */
#define JJ_TIME_MS              900

/* 抓帧频率。8 帧足够跟上落子节奏 */
#define JJ_SCAN_FPS             8

/* 箭头线宽 */
#define JJ_ARROW_WIDTH          7.0
```

改 `src/cst/eval.js` 可以调棋风：

- 想更凶：把 `PAWN_PST` 的过河兵加成调高，或 `VALUE[PAWN]` 从 100 提到 120
- 想更稳：把 `kingSafety` 的 `ATTACK_WEIGHT` 调高
- 想更爱攻：把 `ROOK_PST` 的过河加分从 8 提到 15

改完跑 `node tools/bundle.js` 重新打包，把新的 `dist/engine.js` 直接覆盖手机上的
`/Library/Application Support/JJCheat/engine.js` 就行，**不用重编译 dylib**。

---

## 八、自检与调优

```bash
# 走法生成是否正确（必须全 OK，否则后面全错）
node tools/perft.js 4
# → d1: 44  d2: 1920  d3: 79666  d4: 3290240  全 OK

# 引擎强度和速度
node tools/bench.js 1500

# 打包 + 模拟 iOS 沙箱端到端（含合成图像识别）
node tools/bundle.js
node tools/test-bundle.js
```

`test-bundle.js` 会画一张假棋盘、模拟「炮二平五」、验证能否 diff=0 认出来，全流程不用手机。

---

## 九、识别不准怎么办

按这个顺序排查：

| 现象 | 原因 | 处理 |
|---|---|---|
| 顶部一直显示「识别偏差 N 格」 | 四点标定歪了，或游戏内棋盘被拖动/缩放 | 长按悬浮球重新标定 |
| 走子检测漏了（建议一直不变） | 抓帧太慢 / 落子动画没结束就抓 | 把 `JJ_SCAN_FPS` 提到 12，或等动画停稳 |
| 一直「正在学习棋盘」 | 画面不是标准开局（残局、让子、已走过棋） | 退出重开一局 |
| 红黑判反 | 棋盘皮肤色偏导致红色阈值失准 | 调 `recognizer.js` 的 `redTh` / `darkTh` |
| 箭头位置整体偏移 | 标定用了棋盘边线而不是交叉点 | 重新标定，认准最外圈交叉点 |
| HUD 完全看不见 | CARenderServer 私有 API 被系统挡了 | 看 `Console.app` 里 `[JJCheat] CARenderServer:` 日志 |

日志关键词：`[JJCheat]`。用 `Console.app` 连手机过滤即可。
