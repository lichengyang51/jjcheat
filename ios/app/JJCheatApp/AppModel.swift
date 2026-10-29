//
//  AppModel.swift
//  JJCheatApp —— 全局状态与主循环
//
//  关键设计：
//   · 静音音频保活，防止退到后台后进程被挂起、TCP 监听断掉
//   · 回到前台时重建监听（旧监听可能已死）
//   · 所有诊断信息都暴露到 UI，出问题一眼能看出卡在哪一环
//

import Foundation
import UIKit
import Combine
import ReplayKit

/// 一帧画面快照（校准用）
struct FrameSnapshot: Identifiable {
    let id = UUID()
    let image: UIImage
    let time: Date
}

final class AppModel: ObservableObject {

    // 通道状态
    @Published var connected = false
    @Published var serverRunning = false
    @Published var receivedFrames: UInt64 = 0
    @Published var heartbeats: UInt64 = 0
    @Published var startHB: UInt64 = 0
    @Published var timerHB: UInt64 = 0
    @Published var badPackets: UInt64 = 0
    @Published var lastFrameAt: Date?
    @Published var lastImage: UIImage?
    @Published var frameSize: CGSize = .zero
    @Published var extID: String = ExtensionInfo.broadcastBundleID

    /// 最近若干帧的历史（校准用：切回 App 后最新帧是「JJCheat 自己」，
    /// 需要往回翻到刚才在 JJ象棋 里的那一帧）
    @Published var frameHistory: [FrameSnapshot] = []
    private let historyLimit = 24

    // 引擎输出
    @Published var fen = BoardRenderView.startFen
    @Published var moveText = ""
    @Published var scoreText = ""
    @Published var winrate: Double = 50
    @Published var depth = 0
    @Published var fromSq = -1
    @Published var toSq = -1
    @Published var sideText = "红方"
    @Published var opponentMove = ""

    /// 我执红还是执黑（自动识别，不需要用户选）
    @Published var mySide: String = "red"
    /// 当前是不是轮到我走
    @Published var isMyTurn: Bool = false
    /// 浮窗状态：0 灰未就绪 / 1 蓝校准中 / 2 绿就绪 / 3 红失败
    @Published var statusKind: Int = 0

    /// 自己的画中画是否压住了棋盘（引擎 findPipRect 反向检测）
    ///  压住了那几格在抓屏里就是浮窗自己的米黄棋盘，识别必然错，必须先提醒拖开。
    @Published var pipOverlap: Bool = false

    private var autoCalibAttempts = 0
    private let autoCalibGiveUp = 40      // 约 5 秒还找不到就报失败

    // 流程状态
    @Published var calibrated = false
    @Published var learned = false
    @Published var pipActive = false
    @Published var status = "① 先点「开始录屏」，再切到 JJ象棋"
    @Published var detail = ""

    private var busy = false
    private var learnAttempts = 0          // 学习尝试次数（每 5 帧一次）
    private let learnGiveUpAfter = 12      // 约 8 秒还学不到就降级启动
    private let processQueue = DispatchQueue(label: "com.fujiang.jjcheat.process", qos: .userInitiated)
    private var observers: [NSObjectProtocol] = []

    init() {
        JJEngine.shared.loadIfNeeded()

        FrameServer.shared.onFrame = { [weak self] frame in
            self?.handle(frame)
        }
        FrameServer.shared.onHeartbeat = { [weak self] in
            guard let self else { return }
            self.heartbeats = FrameServer.shared.heartbeatCount
            self.startHB = FrameServer.shared.startHeartbeats
            self.timerHB = FrameServer.shared.timerHeartbeats
            self.badPackets = FrameServer.shared.badPacketCount
        }
        FrameServer.shared.onStateChange = { [weak self] up in
            guard let self else { return }
            self.connected = up
            self.serverRunning = FrameServer.shared.isRunning
        }

        loadCalibration()

        // 回到前台：只在监听真的挂了时才重建。
        // 原来无条件 restart() 会 stop→等 0.4s→start，每次都把帧流打断，
        // 而且 serverRunning 在这窗口里是 false，会让校准按钮误报「通道没起来」。
        let o1 = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil, queue: .main) { [weak self] _ in
                guard let self else { return }
                if !FrameServer.shared.isRunning {
                    FrameServer.shared.start()
                }
                self.serverRunning = FrameServer.shared.isRunning
            }
        observers = [o1]

        FrameServer.shared.start()
        serverRunning = FrameServer.shared.isRunning
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    // MARK: - 标定持久化

    private let cornersKey = "JJCheat.corners"
    private let learnedKey = "JJCheat.learned"
    static let mySideKey = "JJCheat.mySide"

    private func loadCalibration() {
        // 不恢复旧的四点：棋盘位置可能已经变了，而且旧数据可能是错的。
        // 每次启动都重新自动检测一遍（几秒内完成），比带着错误数据跑强。
        calibrated = false
        learned = false
        statusKind = 0
        status = "正在自动找棋盘…切到 JJ象棋 并让整个棋盘完整显示"
    }

    func resetCalibration() {
        calibrated = false
        learned = false
        statusKind = 0
        autoCalibAttempts = 0
        UserDefaults.standard.set(false, forKey: learnedKey)
        UserDefaults.standard.removeObject(forKey: cornersKey)
        refreshHUD()
    }

    func applyCalibration(_ pts: [[Double]]) {
        guard pts.count == 4 else { return }
        UserDefaults.standard.set(pts, forKey: cornersKey)
        JJEngine.shared.setCorners(pts)
        JJEngine.shared.reset(fen: nil)
        calibrated = true
        learned = false
        learnAttempts = 0
        UserDefaults.standard.set(false, forKey: learnedKey)
        status = "标定完成 · 请让画面停在标准开局，等 3 秒自动学棋盘"
        refreshHUD()
    }

    func forceRelearn() {
        JJEngine.shared.reset(fen: nil)
        learned = false
        learnAttempts = 0
        UserDefaults.standard.set(false, forKey: learnedKey)
        status = "请让画面停在标准开局，正在重新学习…"
        refreshHUD()
    }

    /// 校准按钮点击前的自检。
    /// 注意：只看「有没有收到过帧」，不看 serverRunning ——
    /// serverRunning 在监听重建的短暂窗口里会是 false，拿它做门槛会误报。
    func calibrationBlocker() -> String? {
        if receivedFrames == 0 {
            if !FrameServer.shared.isRunning { FrameServer.shared.start() }
            return "还没收到任何录屏画面。请确认：\n① 控制中心/灵动岛有红点（录屏在跑）\n② 录屏里选的是「JJCheat 录屏」\n③ 切到 JJ象棋再切回来，等 2 秒"
        }
        if lastImage == nil && frameHistory.isEmpty {
            return "收到帧了但画面解析失败，重开录屏试试。"
        }
        return nil
    }

    /// 最近一帧的原始数据（自动校准要用）
    private var lastRawFrame: (data: Data, width: Int, height: Int)?

    /// 自动校准：从历史帧里找一张能检测出棋盘的帧来标定
    func autoCalibrate() -> (ok: Bool, message: String) {
        // 先试当前最新帧
        if let f = lastRawFrame,
           let c = JJEngine.shared.autoDetectBoard(pixels: f.data, width: f.width, height: f.height),
           Self.cornersSane(c, w: f.width, h: f.height) {
            applyCalibration(c)
            let cw = (c[1][0] - c[0][0]) / 8
            return (true, String(format: "自动校准成功：格宽 %.1f px", cw))
        }
        // 再往回翻历史帧（切回 App 后最新帧是自拍，棋盘在历史里）
        for snap in frameHistory.reversed() {
            guard let cg = snap.image.cgImage else { continue }
            if let px = Self.rgbaData(from: cg),
               let c = JJEngine.shared.autoDetectBoard(pixels: px, width: cg.width, height: cg.height),
               Self.cornersSane(c, w: cg.width, h: cg.height) {
                applyCalibration(c)
                let cw = (c[1][0] - c[0][0]) / 8
                return (true, String(format: "从历史画面自动校准成功：格宽 %.1f px", cw))
            }
        }
        return (false, "没找到棋盘。让整个棋盘完整出现在画面里，等 2 秒它会自动识别，不用点按钮")
    }

    /// 四角合理性校验：都在画面内、格宽够大、长宽比正常
    static func cornersSane(_ c: [[Double]], w: Int, h: Int) -> Bool {
        guard c.count == 4 else { return false }
        for p in c {
            if p.count < 2 { return false }
            if p[0] < 2 || p[1] < 2 || p[0] > Double(w) - 2 || p[1] > Double(h) - 2 { return false }
        }
        let cw = (c[1][0] - c[0][0]) / 8
        let ch = (c[3][1] - c[0][1]) / 9
        if cw < 12 || ch < 12 { return false }
        let ratio = ch / cw
        if ratio < 0.6 || ratio > 1.7 { return false }
        return true
    }

    /// CGImage -> RGBA Data
    static func rgbaData(from cg: CGImage) -> Data? {
        let w = cg.width, h = cg.height
        guard w > 0, h > 0 else { return nil }
        var out = Data(count: w * h * 4)
        out.withUnsafeMutableBytes { raw in
            guard let base = raw.baseAddress else { return }
            let cs = CGColorSpaceCreateDeviceRGB()
            guard let ctx = CGContext(data: base, width: w, height: h,
                                      bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: cs,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return }
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        }
        return out
    }

    /// 清空历史帧（每次开始校准时调用，避免拿到上一次的旧画面）
    func clearHistory() {
        frameHistory.removeAll()
    }

    /// 当前校准可选的所有画面（历史 + 最新）
    func calibrationFrames() -> [FrameSnapshot] {
        var list = frameHistory
        if let last = lastImage {
            list.append(FrameSnapshot(image: last, time: lastFrameAt ?? Date()))
        }
        return list
    }

    // MARK: - 帧处理

    private func handle(_ frame: FrameServer.Frame) {
        receivedFrames = FrameServer.shared.frameCount
        frameSize = CGSize(width: frame.width, height: frame.height)
        lastFrameAt = Date()
        lastRawFrame = (frame.data, frame.width, frame.height)

        // 主界面预览：每 3 帧刷新一次省内存
        if lastImage == nil || receivedFrames % 3 == 0 {
            lastImage = Self.image(from: frame)
        }

        // 历史帧：校准时要往回翻到 JJ象棋 那一帧
        if receivedFrames % 2 == 0, let img = Self.image(from: frame) {
            frameHistory.append(FrameSnapshot(image: img, time: Date()))
            if frameHistory.count > historyLimit {
                frameHistory.removeFirst(frameHistory.count - historyLimit)
            }
        }

        // ============================================================
        // ★ 全自动校准：用户什么都不用点
        //   他在 JJ象棋 里时帧一直传回来，后台每 3 次尝试找一次棋盘。
        //   找到就立刻标定，然后自动进入学模板 / 算棋。
        // ============================================================
        if !calibrated {
            autoCalibAttempts += 1
            if autoCalibAttempts % 3 == 0 {
                if let c = JJEngine.shared.autoDetectBoard(pixels: frame.data,
                                                           width: frame.width,
                                                           height: frame.height),
                   Self.cornersSane(c, w: frame.width, h: frame.height) {
                    applyCalibration(c)
                    let cw = (c[1][0] - c[0][0]) / 8
                    statusKind = 1
                    status = String(format: "✅ 已自动找到棋盘（格宽 %.1f px），正在学棋子…", cw)
                    NSLog("[JJCheat] 自动校准成功 %.1f", cw)
                    autoCalibAttempts = 0
                } else if autoCalibAttempts > autoCalibGiveUp {
                    statusKind = 3
                    status = "没找到棋盘：请让整个棋盘完整出现在画面里（别被裁掉边）"
                    refreshHUD()
                    return
                }
            }
            if !calibrated {
                if receivedFrames % 10 == 0 { refreshHUD() }
                return
            }
        }
        guard !busy else { return }
        busy = true

        // 学习阶段：新算法用暖色度双峰自适应，不再要求画面必须是标准开局。
        // 校验结果只用来提示「当前是不是开局」，不再作为成功/失败的门槛。
        if !learned {
            learnAttempts += 1
            if learnAttempts % 5 == 1 {
                if let info = JJEngine.shared.learnBoard(pixels: frame.data,
                                                         width: frame.width,
                                                         height: frame.height),
                   JJEngine.int(info, "learned") == 1 {
                    learned = true
                    UserDefaults.standard.set(true, forKey: learnedKey)
                    let warmTh = JJEngine.double(info, "warmThreshold", -1)
                    let diff = JJEngine.int(info, "verifyDiff", -1)
                    if JJEngine.bool(info, "isOpening") {
                        status = String(format: "棋盘已学习（暖色阈值 %.2f，开局校验 %.0f 格误差）", warmTh, Double(diff))
                    } else {
                        status = String(format: "棋盘已学习（暖色阈值 %.2f）· 当前画面非标准开局，请开一局新棋才能从开局往后推局面", warmTh)
                    }
                    NSLog("[JJCheat] learnBoard ok warmTh=%f verifyDiff=%d", warmTh, diff)
                    refreshHUD()
                } else {
                    status = "正在学习棋盘…"
                }
            }
            // 兜底：一直学不到就直接跑，绝不让用户卡死
            if !learned && learnAttempts > learnGiveUpAfter {
                learned = true
                UserDefaults.standard.set(true, forKey: learnedKey)
                status = "学习超时，已用默认阈值启动。若识别不准请重新校准（四点必须落在棋格交叉点）"
                NSLog("[JJCheat] learnBoard 超时")
                refreshHUD()
            }
            busy = false
            return
        }

        processQueue.async { [weak self] in
            guard let self else { return }
            let t0 = Date()
            // 思考时长：这是唯一动过的「速度」参数。
            //   局面更新需要「连续 2 帧识别结果一致」，而每帧都要先算完棋才会处理下一帧，
            //   所以这个值直接决定了落子后要等多久：1800ms 时要等 3~4 秒，700ms 时 1.5 秒左右。
            //   深度从 9 降到 7，对象棋着法质量影响很小，换来的响应快一倍多。
            let res = JJEngine.shared.process(pixels: frame.data,
                                             width: frame.width,
                                             height: frame.height,
                                             timeMs: 700)
            let cost = Int(Date().timeIntervalSince(t0) * 1000)
            self.busy = false
            guard let res else { return }
            DispatchQueue.main.async {
                self.consume(res, cost: cost)
            }
        }
    }

    private func consume(_ res: [String: Any], cost: Int) {
        if JJEngine.bool(res, "detectFail") {
            status = "识别偏差 \(JJEngine.int(res, "detectDiff")) 格"
            refreshHUD()
            return
        }
        fen = JJEngine.str(res, "fen", fen)
        scoreText = JJEngine.str(res, "scoreText")
        winrate = JJEngine.double(res, "winrate", 50)
        depth = JJEngine.int(res, "depth")
        fromSq = JJEngine.int(res, "from", -1)
        toSq = JJEngine.int(res, "to", -1)

        let sideToMove = JJEngine.str(res, "sideToMove", mySide)
        sideText = (sideToMove == "red") ? "红方" : "黑方"

        // ★ 自动判定我执红还是执黑（JS 端已按颜色判好，这里同步过来）
        let detected = JJEngine.str(res, "mySide")
        if (detected == "red" || detected == "black") && detected != mySide {
            mySide = detected
            status = "自动识别：你执\(detected == "red" ? "红" : "黑")"
            NSLog("[JJCheat] 自动识别执子方 = %@", detected)
        }

        // 引擎固定站在我方算，所以永远算「我的回合」
        isMyTurn = true
        moveText = JJEngine.str(res, "suggestChinese")

        // 浮窗压住棋盘了吗？（引擎会把自己画的米黄棋盘找出来）
        let overlap = JJEngine.int(res, "pipOverlap", 0) == 1
        if overlap != pipOverlap {
            pipOverlap = overlap
            NSLog("[JJCheat] 浮窗压住棋盘 = %@", overlap ? "是" : "否")
        }

        detail = "\(sideText)走 · 深度 \(depth) · \(cost)ms · 帧 \(receivedFrames)"

        if JJEngine.bool(res, "moveDetected") {
            let mv = JJEngine.str(res, "moveChinese", JJEngine.str(res, "move"))
            opponentMove = mv
            status = isMyTurn ? "对方走了 \(mv) · 建议 \(moveText)" : "对方走了 \(mv)"
        }

        refreshHUD()
    }

    // MARK: - 画中画内容

    /// 浮窗主文字
    private var hudMainText: String {
        if !calibrated {
            return statusKind == 3 ? "没找到棋盘" : "找棋盘中…"
        }
        if !learned { return "学棋子中…" }
        // 不再因为「轮到对方」就把建议藏起来。
        // 之前 sideToMove 和 mySide 不同步，导致明明是我方走却一直显示「等对方走」。
        // 引擎现在固定站在我方算，有招就直接显示。
        if moveText.isEmpty { return "识别中…" }
        return moveText
    }

    private var hudHint: String {
        // 「浮窗挡住棋盘」这条提示已经删掉。
        //   它靠颜色猜浮窗位置，会误报；而且一旦误报还会连带把正常格子抹空、冻住局面，
        //   结果是明明没挡也报、报了就用不了。浮窗本身已经改成横版小窗，不会碰到棋盘。
        if !calibrated {
            if statusKind == 3 { return "让整个棋盘完整出现在画面里" }
            return "切到 JJ象棋，等几秒自动识别"
        }
        if !learned { return "请停在标准开局画面" }
        if !opponentMove.isEmpty { return "对方刚走 \(opponentMove) · 你执\(mySide == "red" ? "红" : "黑")" }
        return "你执\(mySide == "red" ? "红" : "黑")"
    }

    /// 把当前状态推到浮窗
    func refreshHUD() {
        guard PiPController.shared.isActive else { return }
        // 状态色：就绪 → 绿；找棋盘/学棋子中 → 蓝；失败 → 红；其它 → 灰
        var kind = 0
        if statusKind == 3 {
            kind = 3
        } else if !calibrated || !learned {
            kind = 1
        } else {
            kind = 2
        }
        PiPController.shared.update(
            moveText: hudMainText,
            scoreText: scoreText,
            winrate: winrate,
            depth: depth,
            sideText: sideText,
            hintText: hudHint,
            hasMove: calibrated && learned && isMyTurn && !moveText.isEmpty,
            statusKind: kind,
            fen: fen
        )
    }

    // MARK: - 画中画

    func startPiP(sourceView: UIView) {
        refreshHUD()
        PiPController.shared.onStateChange = { [weak self] active, err in
            guard let self else { return }
            self.pipActive = active
            if let err {
                self.status = "画中画失败：\(err)"
            } else if active {
                self.status = "浮窗已开 · 切到 JJ象棋，程序会自己找棋盘"
            }
        }
        PiPController.shared.start(sourceView: sourceView)
        pipActive = true
    }

    // MARK: - 像素转图

    static func image(from frame: FrameServer.Frame) -> UIImage? {
        let w = frame.width, h = frame.height
        guard w > 0, h > 0, frame.data.count >= w * h * 4 else { return nil }
        guard let provider = CGDataProvider(data: frame.data as CFData) else { return nil }
        let cs = CGColorSpaceCreateDeviceRGB()
        let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
        guard let cg = CGImage(width: w, height: h,
                               bitsPerComponent: 8, bitsPerPixel: 32,
                               bytesPerRow: w * 4, space: cs, bitmapInfo: info,
                               provider: provider, decode: nil,
                               shouldInterpolate: false, intent: .defaultIntent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
