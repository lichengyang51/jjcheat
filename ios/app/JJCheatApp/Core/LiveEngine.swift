import Foundation
import UIKit

/// 实时模式：收录屏扩展发来的帧 → 识别 → 更新浮窗
///
/// 这就是鹏飞 iOS 的那条链路：屏幕录制（ReplayKit 广播）+ 画中画浮窗。
/// 帧从扩展通过 127.0.0.1:9527 回环 TCP 送进来（免费签名没有 App Group，只能用回环）。
///
/// 节流：每 200ms 最多处理一帧。识别 + 浅搜一帧要 100~250ms，
/// 不节流的话帧会越积越多，浮窗反而更慢。
final class LiveEngine {

    static let shared = LiveEngine()

    private let work = DispatchQueue(label: "com.fujiang.jjcheat.live", qos: .userInitiated)
    private var lastAt = Date.distantPast
    private var inFlight = false

    private(set) var isRunning = false
    private(set) var framesSeen = 0
    private(set) var results = 0
    private(set) var lastMS = 0

    var onResult: (([String: Any]) -> Void)?
    var onStats: ((Int, Int, CGSize) -> Void)?

    func start() {
        guard !isRunning else { return }
        isRunning = true
        framesSeen = 0
        results = 0
        lastAt = .distantPast
        JJEngine.shared.reset(fen: nil)
        FrameServer.shared.onFrame = { [weak self] f in self?.handle(f) }
        FrameServer.shared.onHeartbeat = { NSLog("[JJCheat] 录屏扩展心跳") }
        FrameServer.shared.onStateChange = { ok in
            NSLog("[JJCheat] FrameServer %@", ok ? "监听中" : "已停")
        }
        FrameServer.shared.start()
    }

    func stop() {
        isRunning = false
        FrameServer.shared.onFrame = nil
        FrameServer.shared.stop()
    }

    private func handle(_ f: FrameServer.Frame) {
        guard isRunning else { return }
        framesSeen += 1
        let now = Date()
        if now.timeIntervalSince(lastAt) < 0.20 { return }
        if inFlight { return }
        lastAt = now
        inFlight = true

        work.async { [weak self] in
            guard let self else { return }
            let t0 = Date()
            if let corners = JJEngine.shared.autoDetectBoard(pixels: f.data,
                                                            width: f.width,
                                                            height: f.height) {
                JJEngine.shared.setCorners(corners)
                let res = JJEngine.shared.process(pixels: f.data,
                                                  width: f.width,
                                                  height: f.height,
                                                  timeMs: 250)
                let ms = Int(Date().timeIntervalSince(t0) * 1000)
                self.lastMS = ms
                self.results += 1
                DispatchQueue.main.async {
                    if let res { self.onResult?(res) }
                    self.onStats?(self.framesSeen, ms, CGSize(width: f.width, height: f.height))
                }
            }
            self.inFlight = false
        }
    }
}
