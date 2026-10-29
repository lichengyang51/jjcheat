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

    // 流程状态
    @Published var calibrated = false
    @Published var learned = false
    @Published var pipActive = false
    @Published var status = "① 先点「开始录屏」，再切到 JJ象棋"
    @Published var detail = ""

    private var busy = false
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

    private func loadCalibration() {
        if let saved = UserDefaults.standard.array(forKey: cornersKey) as? [[Double]], saved.count == 4 {
            JJEngine.shared.setCorners(saved)
            calibrated = true
            learned = UserDefaults.standard.bool(forKey: learnedKey)
            status = learned ? "已就绪，点「③ 打开画中画」" : "标定已存，请进一局新棋后点「重新学习棋盘」"
        }
    }

    func applyCalibration(_ pts: [[Double]]) {
        guard pts.count == 4 else { return }
        UserDefaults.standard.set(pts, forKey: cornersKey)
        JJEngine.shared.setCorners(pts)
        JJEngine.shared.reset(fen: nil)
        calibrated = true
        learned = false
        UserDefaults.standard.set(false, forKey: learnedKey)
        status = "标定完成，请让画面停在标准开局"
        refreshHUD()
    }

    func forceRelearn() {
        JJEngine.shared.reset(fen: nil)
        learned = false
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

        guard calibrated else {
            // 还没校准也要让浮窗显示状态，但别每帧都重绘
            if receivedFrames % 15 == 0 { refreshHUD() }
            return
        }
        guard !busy else { return }
        busy = true

        // 学习阶段
        if !learned {
            if let info = JJEngine.shared.learnBoard(pixels: frame.data,
                                                     width: frame.width,
                                                     height: frame.height),
               JJEngine.int(info, "templateCount") > 0 {
                learned = true
                UserDefaults.standard.set(true, forKey: learnedKey)
                status = "棋盘学习完成，点「③ 打开画中画」"
                refreshHUD()
            }
            busy = false
            return
        }

        processQueue.async { [weak self] in
            guard let self else { return }
            let t0 = Date()
            let res = JJEngine.shared.process(pixels: frame.data,
                                             width: frame.width,
                                             height: frame.height,
                                             timeMs: 900)
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
            status = "识别偏差 \(JJEngine.int(res, "detectDiff")) 格，建议重新标定"
            refreshHUD()
            return
        }
        fen = JJEngine.str(res, "fen", fen)
        moveText = JJEngine.str(res, "suggestChinese")
        scoreText = JJEngine.str(res, "scoreText")
        winrate = JJEngine.double(res, "winrate", 50)
        depth = JJEngine.int(res, "depth")
        fromSq = JJEngine.int(res, "from", -1)
        toSq = JJEngine.int(res, "to", -1)
        sideText = JJEngine.str(res, "sideToMove") == "red" ? "红方" : "黑方"

        detail = "\(sideText)走 · 深度 \(depth) · \(cost)ms · 帧 \(receivedFrames)"

        if JJEngine.bool(res, "moveDetected") {
            let mv = JJEngine.str(res, "moveChinese", JJEngine.str(res, "move"))
            status = "对方走了 \(mv)"
        }

        refreshHUD()
    }

    // MARK: - 画中画内容

    /// 浮窗主文字：没校准时显示状态，有招时显示着法
    private var hudMainText: String {
        if !calibrated { return "未校准" }
        if !learned { return "等开局" }
        if moveText.isEmpty { return "识别中…" }
        return moveText
    }

    private var hudHint: String {
        if !calibrated { return "回 App 点「点我校准」" }
        if !learned { return "开一局新棋让它学棋盘" }
        return ""
    }

    /// 把当前状态推到浮窗
    func refreshHUD() {
        guard PiPController.shared.isActive else { return }
        PiPController.shared.update(PiPController.Content(
            moveText: hudMainText,
            scoreText: scoreText,
            winrate: winrate,
            depth: depth,
            sideText: sideText,
            hintText: hudHint,
            hasMove: calibrated && learned && !moveText.isEmpty
        ))
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
                self.status = "浮窗已开 · 现在切回 JJ象棋"
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
