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
    /// 每收到一帧就回调（在节流之前），用来诊断「扩展到底有没有连上」
    var onTick: ((Int) -> Void)?

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
        let n = framesSeen
        DispatchQueue.main.async { [weak self] in self?.onTick?(n) }
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
            let corners2 = JJEngine.shared.autoDetectBoard(pixels: data, width: fw, height: fh)
            if corners2 == nil {
                let ms2 = Int(Date().timeIntervalSince(t0) * 1000)
                self.lastMS = ms2
                DispatchQueue.main.async {
                    self.onStats?(self.framesSeen, ms2, CGSize(width: fw, height: fh))
                }
            }
            if let corners = corners2 {
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

    /// 把帧等比缩到目标宽度（逐通道块平均，纯 Swift）
    ///
    /// 为什么不走 CoreGraphics：BGRA/RGBA 的字节序和 CGImage 的 bitmapInfo 一旦对不上，
    /// 出来的图 R/B 会互换，引擎的「暖色/红字」判据全部失效，表现就是一直「正在识别」。
    /// 这里只做通道内平均、通道顺序原样保留，怎么进来的怎么出去，不会有颜色问题。
    static func scale(_ data: Data, width: Int, height: Int, targetW: Int) -> (Data, Int, Int) {
        guard targetW > 0, width > targetW, height > 1, data.count >= width * height * 4 else {
            return (data, width, height)
        }
        let tw = targetW
        let th = max(1, Int((Double(height) * Double(tw) / Double(width)).rounded()))
        var out = Data(count: tw * th * 4)

        data.withUnsafeBytes { srcRaw in
            out.withUnsafeMutableBytes { dstRaw in
                guard let s = srcRaw.bindMemory(to: UInt8.self).baseAddress,
                      let d = dstRaw.bindMemory(to: UInt8.self).baseAddress else { return }
                for oy in 0..<th {
                    let y0 = oy * height / th
                    let y1 = max(y0 + 1, (oy + 1) * height / th)
                    for ox in 0..<tw {
                        let x0 = ox * width / tw
                        let x1 = max(x0 + 1, (ox + 1) * width / tw)
                        var r = 0, g = 0, b = 0, n = 0
                        for yy in y0..<y1 {
                            let rowBase = yy * width * 4
                            var i = rowBase + x0 * 4
                            for _ in x0..<x1 {
                                r += Int(s[i]); g += Int(s[i + 1]); b += Int(s[i + 2])
                                n += 1
                                i += 4
                            }
                        }
                        if n == 0 { n = 1 }
                        let o = (oy * tw + ox) * 4
                        d[o] = UInt8(r / n)
                        d[o + 1] = UInt8(g / n)
                        d[o + 2] = UInt8(b / n)
                        d[o + 3] = 255
                    }
                }
            }
        }
        return (out, tw, th)
    }
}
