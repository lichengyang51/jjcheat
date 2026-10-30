//
//  SampleHandler.swift
//  JJCheatBroadcast —— ReplayKit 屏幕采集扩展
//
//  【为什么这里完全不用 CoreImage】
//  Broadcast Upload Extension 的进程内存上限约 50MB。
//  CIContext(useSoftwareRenderer: false) 会初始化 Metal 上下文，
//  首次创建就吃掉二三十 MB，第一次处理帧时就超限被系统杀掉。
//
//  所以这里改用纯整数运算的 YUV -> RGB 最近邻转换：
//    · 零 GPU 上下文
//    · 输出目标尺寸直接生成，不需要全分辨率中间 buffer
//    · 内存占用 = 一个 dw*dh*4 的 Data（440x956 ≈ 1.7MB）
//
//  同时支持 packed BGRA 兜底，格式自适应。
//

import ReplayKit
import CoreVideo
import CoreMedia
import Foundation
import Darwin

@objc(SampleHandler)
final class SampleHandler: RPBroadcastSampleHandler {

    private var client: FrameClient?

    // 统计
    private var sampleBufferCount: UInt64 = 0
    private var convertedCount: UInt64 = 0
    private var failedCount: UInt64 = 0

    /// 抽帧步长：每 N 帧发一次（录屏 60fps → 发 5fps）
    ///   原生分辨率下每帧 6.8MB，帧率放低一点控制带宽和 CPU
    private let stride: UInt64 = 12
    /// 心跳间隔
    private let heartbeatEvery: UInt64 = 5
    /// 降采样倍数。
    ///   【这是「兵种认错」的病根】
    ///   以前是 2（441×958）。YUV 420 的色度本来就是半分辨率，
    ///   再降 2 倍后「红字/黑字」的色度细节只剩 1/4，字形被糊掉，
    ///   于是位置对、颜色对，但子认错（实测：黑将被认成炮）。
    ///   离线量化：不模糊 0 格错 / 轻微模糊 3 格错 / 中等模糊 20 格错。
    ///   改成 1 = 原生 882×1917，色度的相对模糊度直接减半；
    ///   引擎在 442/589/736 格距下都是 0 格错、884 只差 1 格，扛得住这个尺寸。
    private let downscale = 1

    private var heartbeatTimer: DispatchSourceTimer?
    private let heartbeatQueue = DispatchQueue(label: "jjcheat.broadcast.heartbeat")

    // MARK: - 生命周期

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        client = FrameClient(host: "127.0.0.1", port: JJProto.port)
        client?.connect()
        sampleBufferCount = 0
        convertedCount = 0
        failedCount = 0

        // 立刻发「启动心跳」
        client?.send(JJFrameHeader.startHeartbeat().encoded())

        // 每秒一个定时心跳，完全不依赖 processSampleBuffer
        let t = DispatchSource.makeTimerSource(queue: heartbeatQueue)
        t.schedule(deadline: .now() + 1.0, repeating: 1.0)
        t.setEventHandler { [weak self] in
            self?.client?.send(JJFrameHeader.timerHeartbeat().encoded())
        }
        t.resume()
        heartbeatTimer = t

        NSLog("[JJCheat/bc] broadcastStarted ok")
    }

    private func stopTimer() {
        heartbeatTimer?.cancel()
        heartbeatTimer = nil
    }

    override func broadcastFinished() {
        NSLog("[JJCheat/bc] broadcastFinished sb=%llu conv=%llu fail=%llu",
              sampleBufferCount, convertedCount, failedCount)
        stopTimer()
        client?.send(JJFrameHeader.startHeartbeat().encoded())
        client?.close()
        client = nil
    }

    override func finishBroadcastWithError(_ error: Error) {
        NSLog("[JJCheat/bc] finishBroadcastWithError %@", "\(error)")
        stopTimer()
        client?.close()
        client = nil
        super.finishBroadcastWithError(error)
    }

    // MARK: - 帧处理

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer,
                                      with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video else { return }
        sampleBufferCount &+= 1

        // 前 3 帧也发心跳：确认 processSampleBuffer 真的被调用了
        if sampleBufferCount <= 3 || sampleBufferCount % heartbeatEvery == 0 {
            client?.send(JJFrameHeader.heartbeat().encoded())
        }
        if sampleBufferCount <= 3 {
            if let pb = CMSampleBufferGetImageBuffer(sampleBuffer) {
                let f = CVPixelBufferGetPixelFormatType(pb)
                let b0 = UInt8((f >> 24) & 0xff), b1 = UInt8((f >> 16) & 0xff)
                let b2 = UInt8((f >> 8) & 0xff), b3 = UInt8(f & 0xff)
                let tag = String(bytes: [b0, b1, b2, b3], encoding: .ascii) ?? "?"
                NSLog("[JJCheat/bc] 帧格式 %@ 尺寸 %dx%d 平面 %d", tag,
                      CVPixelBufferGetWidth(pb), CVPixelBufferGetHeight(pb),
                      CVPixelBufferGetPlaneCount(pb))
            }
        }

        if sampleBufferCount % stride != 0 { return }

        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            failedCount &+= 1
            return
        }
        // 目标宽度 ~700：模板是 48~80px 格距生成的，700 宽时格距约 76，
        // 正好对上。原生 1320 宽直接发过去，一帧 15MB、每秒几百 MB，
        // 回环也会拥塞，而且引擎还得自己再缩一次，纯浪费。
        let srcW = CVPixelBufferGetWidth(pixelBuffer)
        let ds = max(1, Int((Double(srcW) / 700.0).rounded()))
        guard let frame = makeRGBA(from: pixelBuffer, downscale: ds) else {
            failedCount &+= 1
            return
        }
        convertedCount &+= 1

        let header = JJFrameHeader(width: UInt16(frame.width),
                                   height: UInt16(frame.height),
                                   bytesPerRow: UInt32(frame.width * 4),
                                   payloadLen: UInt32(frame.data.count))
        var packet = Data(capacity: JJProto.headerSize + frame.data.count)
        packet.append(header.encoded())
        packet.append(frame.data)
        client?.send(packet)
    }

    // MARK: - 像素转换（纯 CPU，无 GPU）

    private struct Frame {
        var width: Int
        var height: Int
        var data: Data
    }

    /// 像素格式的 4 字符码（'xf20' 之类）
    static func fourCC(_ s: String) -> OSType {
        var r: OSType = 0
        for u in s.utf8 { r = (r << 8) | OSType(u) }
        return r
    }

    @inline(__always)
    private func clamp255(_ v: Int) -> UInt8 {
        if v < 0 { return 0 }
        if v > 255 { return 255 }
        return UInt8(v)
    }

    private func makeRGBA(from px: CVPixelBuffer, downscale: Int) -> Frame? {
        let sw = CVPixelBufferGetWidth(px)
        let sh = CVPixelBufferGetHeight(px)
        guard sw > 0, sh > 0 else { return nil }

        let dw = max(1, sw / downscale)
        let dh = max(1, sh / downscale)
        let rowBytes = dw * 4

        CVPixelBufferLockBaseAddress(px, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(px, .readOnly) }

        let fmt = CVPixelBufferGetPixelFormatType(px)
        let planes = CVPixelBufferGetPlaneCount(px)
        // iOS 26 的 ReplayKit 在 A18 上会直接给 10bit 双平面：
        //   'xf20' = 420YpCbCr10BiPlanarFullRange，'x420' = 视频范围
        // 每个采样 16 位，Y 只有 10 位有效值。当成 8 位读会得到满屏噪点，
        // 引擎一辈子认不出棋盘 —— 表现就是浮窗一直「正在识别」。
        let is10bit = (fmt == Self.fourCC("xf20") || fmt == Self.fourCC("x420")
                       || fmt == Self.fourCC("l10r") || fmt == Self.fourCC("420p"))
        var out = Data(count: dh * rowBytes)
        var filled = false

        if is10bit && planes >= 2 {
            guard let yBase = CVPixelBufferGetBaseAddressOfPlane(px, 0),
                  let uvBase = CVPixelBufferGetBaseAddressOfPlane(px, 1) else { return nil }
            let yBpr = CVPixelBufferGetBytesPerRowOfPlane(px, 0)
            let uvBpr = CVPixelBufferGetBytesPerRowOfPlane(px, 1)
            let y16 = yBase.assumingMemoryBound(to: UInt16.self)
            let uv16 = uvBase.assumingMemoryBound(to: UInt16.self)
            let yStride = yBpr / 2
            let uvStride = uvBpr / 2
            out.withUnsafeMutableBytes { raw in
                guard let dst = raw.baseAddress?.assumingMemoryBound(to: UInt8.self) else { return }
                for y in 0..<dh {
                    let sy = y * downscale
                    let dRow = dst + y * rowBytes
                    for x in 0..<dw {
                        let sx = x * downscale
                        let Y10 = Int(y16[sy * yStride + sx]) >> 2
                        let ux = (sx >> 1) << 1
                        let cb = (Int(uv16[(sy >> 1) * uvStride + ux]) - 512) / 4
                        let cr = (Int(uv16[(sy >> 1) * uvStride + ux + 1]) - 512) / 4
                        let r = Y10 + ((91881 * cr) >> 16)
                        let g = Y10 - ((22554 * cb + 46802 * cr) >> 16)
                        let b = Y10 + ((116130 * cb) >> 16)
                        dRow[x * 4 + 0] = clamp255(r)
                        dRow[x * 4 + 1] = clamp255(g)
                        dRow[x * 4 + 2] = clamp255(b)
                        dRow[x * 4 + 3] = 255
                    }
                }
            }
            filled = true
        } else if CVPixelBufferIsPlanar(px) && planes >= 2 {
            guard let yBase = CVPixelBufferGetBaseAddressOfPlane(px, 0),
                  let uvBase = CVPixelBufferGetBaseAddressOfPlane(px, 1) else { return nil }
            let yBpr = CVPixelBufferGetBytesPerRowOfPlane(px, 0)
            let uvBpr = CVPixelBufferGetBytesPerRowOfPlane(px, 1)
            let ySrc = yBase.assumingMemoryBound(to: UInt8.self)
            let uvSrc = uvBase.assumingMemoryBound(to: UInt8.self)

            // ---- 亮度范围 ----
            // 先按格式标签定：420f=全范围、420v=视频范围。
            // 但 iOS 抓屏常常是全范围内容却标成 420v，那样按视频范围解出来的图会
            // 更亮更饱和（黑被抬到 16、白被压到 235 再拉开），
            // 于是「空棋盘」看起来像米黄、「红字」不再是红色 ——
            // 表现就是「棋子位置对，但兵种和红黑全错」。
            // 所以再用实际数据兜一层：稀疏采样 Y，出现 <12 或 >242 就当全范围处理。
            var useFullRange = (fmt == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange)
            if !useFullRange {
                var yMin = 255, yMax = 0, cnt = 0
                var sy0 = 0
                while sy0 < sh {
                    let row = ySrc + sy0 * yBpr
                    var sx0 = 0
                    while sx0 < sw {
                        let v = Int(row[sx0])
                        if v < yMin { yMin = v }
                        if v > yMax { yMax = v }
                        cnt += 1
                        sx0 += 13
                    }
                    sy0 += 19
                }
                if cnt > 0 && (yMin < 12 || yMax > 242) { useFullRange = true }
            }

            // 三个平面（420p）时 Cb、Cr 各自独立；两个平面（NV12）时 CbCr 交错
            let threePlane = (planes >= 3)
            var crSrc = uvSrc
            var crBpr = uvBpr
            if threePlane {
                guard let crBase = CVPixelBufferGetBaseAddressOfPlane(px, 2) else { return nil }
                crSrc = crBase.assumingMemoryBound(to: UInt8.self)
                crBpr = CVPixelBufferGetBytesPerRowOfPlane(px, 2)
            }

            out.withUnsafeMutableBytes { raw in
                guard let dst = raw.baseAddress?.assumingMemoryBound(to: UInt8.self) else { return }
                for y in 0..<dh {
                    let sy = y * downscale
                    let yRow = ySrc + sy * yBpr
                    let cbRow = uvSrc + (sy >> 1) * uvBpr
                    let crRow = threePlane ? (crSrc + (sy >> 1) * crBpr) : cbRow
                    let dRow = dst + y * rowBytes
                    for x in 0..<dw {
                        let sx = x * downscale
                        let Y = Int(yRow[sx])
                        var cb: Int, cr: Int
                        if threePlane {
                            cb = Int(cbRow[sx >> 1]) - 128
                            cr = Int(crRow[sx >> 1]) - 128
                        } else {
                            let ux = (sx >> 1) << 1
                            cb = Int(cbRow[ux]) - 128
                            cr = Int(crRow[ux + 1]) - 128
                        }

                        var r: Int, g: Int, b: Int
                        if useFullRange {
                            r = Y + ((91881 * cr) >> 16)
                            g = Y - ((22554 * cb + 46802 * cr) >> 16)
                            b = Y + ((116130 * cb) >> 16)
                        } else {
                            let c = Y - 16
                            r = (298 * c + 409 * cr + 128) >> 8
                            g = (298 * c - 100 * cb - 208 * cr + 128) >> 8
                            b = (298 * c + 516 * cb + 128) >> 8
                        }
                        dRow[x * 4 + 0] = clamp255(r)
                        dRow[x * 4 + 1] = clamp255(g)
                        dRow[x * 4 + 2] = clamp255(b)
                        dRow[x * 4 + 3] = 255
                    }
                }
            }
            filled = true
        } else if let base = CVPixelBufferGetBaseAddress(px) {
            // ---- packed 格式兜底：按像素格式取正确通道 ----
            // 之前一律当 BGRA，遇到 ARGB/RGBA 时 R 和 B 会取错，
            // 同样表现为「位置对、兵种和红黑全错」。
            let bpr = CVPixelBufferGetBytesPerRow(px)
            let src = base.assumingMemoryBound(to: UInt8.self)
            var iR = 2, iG = 1, iB = 0          // 默认 BGRA / BGRX
            if fmt == kCVPixelFormatType_32ARGB {
                iR = 1; iG = 2; iB = 3
            } else if fmt == kCVPixelFormatType_32RGBA {
                iR = 0; iG = 1; iB = 2
            }
            out.withUnsafeMutableBytes { raw in
                guard let dst = raw.baseAddress?.assumingMemoryBound(to: UInt8.self) else { return }
                for y in 0..<dh {
                    let sRow = src + (y * downscale) * bpr
                    let dRow = dst + y * rowBytes
                    for x in 0..<dw {
                        let p = sRow + (x * downscale) * 4
                        dRow[x * 4 + 0] = p[iR]
                        dRow[x * 4 + 1] = p[iG]
                        dRow[x * 4 + 2] = p[iB]
                        dRow[x * 4 + 3] = 255
                    }
                }
            }
            filled = true
        }

        guard filled else { return nil }
        return Frame(width: dw, height: dh, data: out)
    }
}

// MARK: - 极简 TCP 客户端

final class FrameClient {
    private let host: String
    private let port: UInt16
    private var fd: Int32 = -1
    private let queue = DispatchQueue(label: "jjcheat.broadcast.tcp")

    init(host: String, port: UInt16) {
        self.host = host
        self.port = port
    }

    func connect(retry: Int = 0) {
        queue.async { [weak self] in
            guard let self else { return }
            if self.fd >= 0 { return }

            var hints = addrinfo(ai_flags: 0, ai_family: AF_INET, ai_socktype: SOCK_STREAM,
                                 ai_protocol: 0, ai_addrlen: 0, ai_canonname: nil,
                                 ai_addr: nil, ai_next: nil)
            var res: UnsafeMutablePointer<addrinfo>?
            let err = getaddrinfo(self.host, String(self.port), &hints, &res)
            guard err == 0, let info = res else {
                self.scheduleRetry(retry)
                return
            }
            defer { freeaddrinfo(res) }

            let s = socket(info.pointee.ai_family, info.pointee.ai_socktype, info.pointee.ai_protocol)
            guard s >= 0 else {
                self.scheduleRetry(retry)
                return
            }
            let ok = Darwin.connect(s, info.pointee.ai_addr, info.pointee.ai_addrlen)
            if ok != 0 {
                // 本类有同名实例方法 close()/connect()，必须加 Darwin 前缀
                Darwin.close(s)
                self.scheduleRetry(retry)
                return
            }
            var on: Int32 = 1
            setsockopt(s, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
            self.fd = s
            NSLog("[JJCheat/bc] TCP 已连接 %@:%u", self.host, self.port)
        }
    }

    private func scheduleRetry(_ retry: Int) {
        if retry % 20 == 0 {
            NSLog("[JJCheat/bc] TCP 连接中… 第 %d 次", retry)
        }
        queue.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.connect(retry: retry &+ 1)
        }
    }

    func send(_ data: Data) {
        queue.async { [weak self] in
            guard let self, self.fd >= 0 else { return }
            data.withUnsafeBytes { raw in
                guard let base = raw.baseAddress else { return }
                var sent = 0
                let total = raw.count
                while sent < total {
                    let n = Darwin.send(self.fd, base + sent, total - sent, 0)
                    if n <= 0 {
                        Darwin.close(self.fd)
                        self.fd = -1
                        self.scheduleRetry(0)
                        break
                    }
                    sent += n
                }
            }
        }
    }

    func close() {
        queue.async { [weak self] in
            guard let self, self.fd >= 0 else { return }
            Darwin.close(self.fd)
            self.fd = -1
        }
    }
}
