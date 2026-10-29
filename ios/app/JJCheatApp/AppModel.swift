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

    // 引擎输出
    @Published var fen = BoardRenderView.startFen
    @Published var moveText = ""
    @Published var scoreText = ""
    @Published var winrate: Double = 50
    @Published var depth = 0
    @Published var fromSq = -1
    @Published var toSq = -1

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

        // 回前台 → 彻底重建监听（旧 socket 可能已死但标志位还说在跑）
        let o1 = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil, queue: .main) { [weak self] _ in
                guard let self else { return }
                FrameServer.shared.restart()
                self.serverRunning = true
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
    }

    func forceRelearn() {
        JJEngine.shared.reset(fen: nil)
        learned = false
        UserDefaults.standard.set(false, forKey: learnedKey)
        status = "请让画面停在标准开局，正在重新学习…"
    }

    /// 校准按钮点击前的自检，返回 nil 表示可以进校准
    func calibrationBlocker() -> String? {
        if !serverRunning {
            return "后台接收通道没起来。回主界面等一下，或重开录屏。"
        }
        if receivedFrames == 0 {
            return "还没收到任何录屏画面。请确认：\n① 控制中心/灵动岛有红点（录屏在跑）\n② 录屏里选的是「JJCheat 录屏」\n③ 切到 JJ象棋再切回来，等 2 秒"
        }
        if lastImage == nil {
            return "收到帧了但画面解析失败，重开录屏试试。"
        }
        return nil
    }

    // MARK: - 帧处理

    private func handle(_ frame: FrameServer.Frame) {
        receivedFrames = FrameServer.shared.frameCount
        frameSize = CGSize(width: frame.width, height: frame.height)
        lastFrameAt = Date()

        // 校准界面需要看到画面，每 2 帧刷新一次省内存
        if lastImage == nil || receivedFrames % 2 == 0 {
            lastImage = Self.image(from: frame)
        }

        guard calibrated else { return }
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
            return
        }
        fen = JJEngine.str(res, "fen", fen)
        moveText = JJEngine.str(res, "suggestChinese")
        scoreText = JJEngine.str(res, "scoreText")
        winrate = JJEngine.double(res, "winrate", 50)
        depth = JJEngine.int(res, "depth")
        fromSq = JJEngine.int(res, "from", -1)
        toSq = JJEngine.int(res, "to", -1)

        let side = JJEngine.str(res, "sideToMove") == "red" ? "红方" : "黑方"
        detail = "\(side)走 · 深度 \(depth) · \(cost)ms · 帧 \(receivedFrames)"

        if JJEngine.bool(res, "moveDetected") {
            status = "对方走了 \(JJEngine.str(res, "moveChinese", JJEngine.str(res, "move")))"
        }

        if pipActive {
            PiPController.shared.update(fen: fen, moveText: moveText, scoreText: scoreText,
                                        winrate: winrate, depth: depth, from: fromSq, to: toSq)
        }
    }

    // MARK: - 画中画

    func startPiP(sourceView: UIView) {
        PiPController.shared.update(fen: fen, moveText: moveText, scoreText: scoreText,
                                    winrate: winrate, depth: depth, from: fromSq, to: toSq)
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
