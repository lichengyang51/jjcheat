//
//  SampleHandler.swift
//  JJCheatBroadcast —— ReplayKit 屏幕采集扩展
//
//  【关键修复】
//  ReplayKit 给的 CVPixelBuffer 是 YUV 420（NV12/nv12、420v/420f），
//  不是 32 位 BGRA。直接按 BGRA 步进读取会越界，扩展进程当场崩溃，
//  socket 残留导致主 App 一直显示「已接入」但永远收不到帧。
//
//  这里改成用 CoreImage 渲染成 BGRA 并顺带降采样，
//  格式自适应，NV12 / BGRA / 420f 全都能处理。
//
//  内存约束：扩展进程上限约 50MB，所以输出尽量小、复用 CIContext。
//

import ReplayKit
import CoreVideo
import CoreMedia
import CoreImage
import Foundation
import Darwin

@objc(SampleHandler)
final class SampleHandler: RPBroadcastSampleHandler {

    private var client: FrameClient?

    // 统计
    private var sampleBufferCount: UInt64 = 0     // 收到多少个视频帧
    private var convertedCount: UInt64 = 0        // 成功转换多少个
    private var failedCount: UInt64 = 0           // 转换失败多少个

    /// 抽帧步长：每 N 帧发一次（录屏 60fps → 发 6fps，够识别且省电）
    private let stride: UInt64 = 10
    /// 心跳间隔：每 N 个视频帧发一次心跳，证明扩展还活着
    private let heartbeatEvery: UInt64 = 5
    /// 降采样倍数
    private let downscale = 3

    private lazy var ciContext = CIContext(options: [
        .useSoftwareRenderer: false,
        .cacheIntermediates: false
    ])
    private let colorSpace = CGColorSpaceCreateDeviceRGB()

    /// 独立心跳定时器：完全不依赖 processSampleBuffer，
    /// 用来区分「扩展没跑起来」和「跑起来了但系统不喂画面」
    private var heartbeatTimer: DispatchSourceTimer?
    private let heartbeatQueue = DispatchQueue(label: "jjcheat.broadcast.heartbeat")

    // MARK: - 生命周期

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        client = FrameClient(host: "127.0.0.1", port: JJProto.port)
        client?.connect()
        sampleBufferCount = 0
        convertedCount = 0
        failedCount = 0

        // 立刻发一个「启动心跳」
        client?.send(JJFrameHeader.startHeartbeat().encoded())

        // 每秒一个定时心跳，证明扩展进程活着
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
        NSLog("[JJCheat/bc] broadcastFinished  sb=%llu conv=%llu fail=%llu",
              sampleBufferCount, convertedCount, failedCount)
        stopTimer()
        client?.send(JJFrameHeader.startHeartbeat().encoded())   // 结束前再补一个
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

        // 先发心跳：无论后面转换成功与否，都证明扩展活着且收到了 sample buffer
        if sampleBufferCount % heartbeatEvery == 0 {
            sendHeartbeat()
        }

        // 抽帧
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

    private func sendHeartbeat() {
        client?.send(JJFrameHeader.heartbeat().encoded())
    }

    // MARK: - 像素转换（格式自适应）

    private struct Frame {
        var width: Int
        var height: Int
        var data: Data
    }

    private func makeRGBA(from px: CVPixelBuffer, downscale: Int) -> Frame? {
        let sw = CVPixelBufferGetWidth(px)
        let sh = CVPixelBufferGetHeight(px)
        guard sw > 0, sh > 0 else { return nil }

        let dw = max(1, sw / downscale)
        let dh = max(1, sh / downscale)
        let bytes = dw * dh * 4

        // 用 CoreImage 统一转：不管输入是 NV12 / 420f / BGRA，输出都是 RGBA8
        let src = CIImage(cvPixelBuffer: px)
        let sx = CGFloat(dw) / CGFloat(sw)
        let sy = CGFloat(dh) / CGFloat(sh)
        let scaled = src.transformed(by: CGAffineTransform(scaleX: sx, y: sy))
        let rect = CGRect(x: 0, y: 0, width: CGFloat(dw), height: CGFloat(dh))

        var out = Data(count: bytes)
        var ok = false
        out.withUnsafeMutableBytes { raw in
            guard let base = raw.baseAddress else { return }
            ciContext.render(scaled,
                             toBitmap: base,
                             rowBytes: dw * 4,
                             bounds: rect,
                             format: .RGBA8,
                             colorSpace: colorSpace)
            ok = true
        }
        guard ok else { return nil }

        // CI 的 RGBA8 在内存里就是 R,G,B,A 顺序，正好是我们的协议格式
        return Frame(width: dw, height: dh, data: out)
    }
}

// MARK: - 极简 TCP 客户端

final class FrameClient {
    private let host: String
    private let port: UInt16
    private var fd: Int32 = -1
    private let queue = DispatchQueue(label: "jjcheat.broadcast.tcp")
    private var connected = false

    init(host: String, port: UInt16) {
        self.host = host
        self.port = port
    }

    func connect(retry: Int = 0) {
        queue.async { [weak self] in
            guard let self else { return }
            if self.fd >= 0 { return }   // 已连上就别重复连

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
                // 本类有同名实例方法 close()/connect()，
                // 不加 Darwin 前缀会被 Swift 优先解析到实例方法上
                Darwin.close(s)
                self.scheduleRetry(retry)
                return
            }
            var on: Int32 = 1
            setsockopt(s, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
            self.fd = s
            self.connected = true
            NSLog("[JJCheat/bc] TCP 已连接 %@:%u", self.host, self.port)
        }
    }

    private func scheduleRetry(_ retry: Int) {
        if retry % 20 == 0 {
            NSLog("[JJCheat/bc] TCP 连接中… 第 %d 次重试", retry)
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
                        // 对端关了，重置状态等重连
                        Darwin.close(self.fd)
                        self.fd = -1
                        self.connected = false
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
            self.connected = false
        }
    }
}
