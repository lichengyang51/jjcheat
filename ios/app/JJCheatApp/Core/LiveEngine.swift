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
            // ★ 先把帧缩到 700 宽再喂引擎
            //
            //   真机录屏是原生 1320×2868，格距约 143 像素；而内置棋子模板是在
            //   格距 48~80 像素的截图上生成的。差 2 倍以上，模板比对会整盘乱套
            //   （表现就是「对方走了，浮窗里没变」——因为识别结果根本没法用，
            //   合法性闸门一直把它拦在外面）。
            //   照片路径本来就是把图缩到 700 宽再识别，这里保持同一尺度，模板才对得上。
            let shrunk = Self.scale(f.data, width: f.width, height: f.height, targetW: 700)
            let data = shrunk.0, fw = shrunk.1, fh = shrunk.2
            if let corners = JJEngine.shared.autoDetectBoard(pixels: data, width: fw, height: fh) {
                JJEngine.shared.setCorners(corners)
                let res = JJEngine.shared.process(pixels: data,
                                                  width: fw,
                                                  height: fh,
                                                  timeMs: 250,
                                                  live: true)
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

extension LiveEngine {

    /// 把 BGRA 帧等比缩到目标宽度（BGRA 进、BGRA 出）
    ///
    /// 为什么要缩：录屏帧是原生分辨率，格距 ~143px，而模板是 48~80px 生成的。
    /// 缩到 700 宽后格距回到 ~76px，跟照片路径完全一致，模板才对得上。
    static func scale(_ data: Data, width: Int, height: Int, targetW: Int) -> (Data, Int, Int) {
        guard width > targetW, height > 0, data.count >= width * height * 4 else {
            return (data, width, height)
        }
        let tw = targetW
        let th = max(1, Int((Double(height) * Double(tw) / Double(width)).rounded()))
        let cs = CGColorSpaceCreateDeviceRGB()
        let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipFirst.rawValue)

        var srcImg: CGImage?
        data.withUnsafeBytes { raw in
            guard let base = raw.baseAddress,
                  let provider = CGDataProvider(dataInfo: nil,
                                                data: base,
                                                size: data.count,
                                                releaseData: { _, _, _ in }) else { return }
            srcImg = CGImage(width: width, height: height,
                             bitsPerComponent: 8, bitsPerPixel: 32,
                             bytesPerRow: width * 4, space: cs, bitmapInfo: info,
                             provider: provider, decode: nil, shouldInterpolate: true,
                             intent: .defaultIntent)
        }
        guard let src = srcImg,
              let ctx = CGContext(data: nil, width: tw, height: th,
                                  bitsPerComponent: 8, bitsPerPixel: 32,
                                  bytesPerRow: tw * 4, space: cs,
                                  bitmapInfo: info.rawValue) else {
            return (data, width, height)
        }
        ctx.interpolationQuality = .high
        ctx.draw(src, in: CGRect(x: 0, y: 0, width: tw, height: th))
        guard let outBase = ctx.data else { return (data, width, height) }
        return (Data(bytes: outBase, count: tw * th * 4), tw, th)
    }
}
