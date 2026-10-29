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

    /// 抽帧步长：每 N 帧发一次（录屏 60fps → 发 10fps）
    ///   原来 10（6fps）：落子后最坏要等 167ms 才有一帧，再叠加稳定判定就是半秒。
    ///   441x958 的转换和回环传输都很便宜，提到 10fps 把「发现落子」压到 100ms 以内。
    private let stride: UInt64 = 6
    /// 心跳间隔
    private let heartbeatEvery: UInt64 = 5
    /// 降采样倍数：ReplayKit 给的是 882×1917，降 2 倍得 441×958。
    ///   441x958 下棋盘每格约 47.9×46.4 像素，跑逐格真值回归 90/90 全对；
    ///   再降一倍只剩 294×639、格距 32 像素，字形开始糊，不要再降。
    private let downscale = 2

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

        if sampleBufferCount % stride != 0 { return }

        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            failedCount &+= 1
            return
        }
        guard let frame = makeRGBA(from: pixelBuffer, downscale: downscale) else {
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
        var out = Data(count: dh * rowBytes)
        var filled = false

        if CVPixelBufferIsPlanar(px) && CVPixelBufferGetPlaneCount(px) >= 2 {
            // ---- 双平面 YUV（420v / 420f / NV12）----
            guard let yBase = CVPixelBufferGetBaseAddressOfPlane(px, 0),
                  let uvBase = CVPixelBufferGetBaseAddressOfPlane(px, 1) else { return nil }
            let yBpr = CVPixelBufferGetBytesPerRowOfPlane(px, 0)
            let uvBpr = CVPixelBufferGetBytesPerRowOfPlane(px, 1)
            let ySrc = yBase.assumingMemoryBound(to: UInt8.self)
            let uvSrc = uvBase.assumingMemoryBound(to: UInt8.self)
            let fullRange = (fmt == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange)

            out.withUnsafeMutableBytes { raw in
                guard let dst = raw.baseAddress?.assumingMemoryBound(to: UInt8.self) else { return }
                for y in 0..<dh {
                    let sy = y * downscale
                    let yRow = ySrc + sy * yBpr
                    let uvRow = uvSrc + (sy >> 1) * uvBpr
                    let dRow = dst + y * rowBytes
                    for x in 0..<dw {
                        let sx = x * downscale
                        let Y = Int(yRow[sx])
                        let ux = (sx >> 1) << 1          // NV12: Cb,Cr 交错
                        let cb = Int(uvRow[ux]) - 128
                        let cr = Int(uvRow[ux + 1]) - 128

                        var r: Int, g: Int, b: Int
                        if fullRange {
                            // full range: Y 0..255
                            r = Y + ((91881 * cr) >> 16)
                            g = Y - ((22554 * cb + 46802 * cr) >> 16)
                            b = Y + ((116130 * cb) >> 16)
                        } else {
                            // video range: Y 16..235, CbCr 16..240
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
            // ---- packed 格式兜底：BGRA / BGRX ----
            let bpr = CVPixelBufferGetBytesPerRow(px)
            let src = base.assumingMemoryBound(to: UInt8.self)
            out.withUnsafeMutableBytes { raw in
                guard let dst = raw.baseAddress?.assumingMemoryBound(to: UInt8.self) else { return }
                for y in 0..<dh {
                    let sRow = src + (y * downscale) * bpr
                    let dRow = dst + y * rowBytes
                    for x in 0..<dw {
                        let p = sRow + (x * downscale) * 4
                        dRow[x * 4 + 0] = p[2]   // R
                        dRow[x * 4 + 1] = p[1]   // G
                        dRow[x * 4 + 2] = p[0]   // B
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
