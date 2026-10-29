//
//  SampleHandler.swift
//  JJCheatBroadcast —— ReplayKit 屏幕采集扩展
//
//  职责：拿到整屏 CMSampleBuffer → 降采样 3 倍 → BGRA 转 RGBA
//        → 通过 127.0.0.1:9527 发回主 App
//
//  内存约束：扩展进程上限约 50MB。所以这里只做最轻的活：
//  一次分配复用 buffer，绝不在每帧新建大对象。
//

import ReplayKit
import CoreVideo
import CoreMedia
import Foundation
import Darwin

@objc(SampleHandler)
final class SampleHandler: RPBroadcastSampleHandler {

    private var client: FrameClient?
    private var frameIndex: UInt64 = 0
    /// 抽帧步长：每 N 帧发一次。3 ≈ 20fps 的画面里发 6~7fps，够用且省电
    private let stride: UInt64 = 3
    /// 降采样倍数（最近邻，够快够准）
    private let downscale = 3

    // MARK: - 生命周期

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        client = FrameClient(host: "127.0.0.1", port: JJProto.port)
        client?.connect()
        frameIndex = 0
    }

    override func broadcastFinished() {
        client?.close()
        client = nil
    }

    override func finishBroadcastWithError(_ error: Error) {
        client?.close()
        client = nil
        super.finishBroadcastWithError(error)
    }

    // MARK: - 帧处理

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer,
                                      with sampleBufferType: RPSampleBufferType) {
        guard sampleBufferType == .video else { return }

        frameIndex &+= 1
        if frameIndex % stride != 0 { return }

        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        guard let frame = makeRGBA(from: pixelBuffer, downscale: downscale) else { return }

        let header = JJFrameHeader(width: UInt16(frame.width),
                                   height: UInt16(frame.height),
                                   bytesPerRow: UInt32(frame.width * 4),
                                   payloadLen: UInt32(frame.data.count))
        var packet = Data(capacity: JJProto.headerSize + frame.data.count)
        packet.append(header.encoded())
        packet.append(frame.data)
        client?.send(packet)
    }

    // MARK: - 像素转换

    private struct Frame {
        var width: Int
        var height: Int
        var data: Data
    }

    /// CVPixelBuffer(全屏 BGRA) → 降采样后的 RGBA Data
    private func makeRGBA(from px: CVPixelBuffer, downscale: Int) -> Frame? {
        CVPixelBufferLockBaseAddress(px, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(px, .readOnly) }

        guard let base = CVPixelBufferGetBaseAddress(px) else { return nil }
        let sw = CVPixelBufferGetWidth(px)
        let sh = CVPixelBufferGetHeight(px)
        let sbpr = CVPixelBufferGetBytesPerRow(px)
        guard sw > 0, sh > 0 else { return nil }

        let dw = sw / downscale
        let dh = sh / downscale
        guard dw > 0, dh > 0 else { return nil }

        let outBytes = dw * dh * 4
        var out = Data(count: outBytes)

        out.withUnsafeMutableBytes { raw in
            guard let dst = raw.baseAddress?.assumingMemoryBound(to: UInt8.self) else { return }
            let src = base.assumingMemoryBound(to: UInt8.self)
            for y in 0..<dh {
                let sy = y * downscale
                let srcRow = src + sy * sbpr
                let dstRow = dst + y * dw * 4
                var x = 0
                while x < dw {
                    let sx = x * downscale
                    let p = srcRow + sx * 4
                    // BGRA -> RGBA
                    dstRow[x * 4 + 0] = p[2]
                    dstRow[x * 4 + 1] = p[1]
                    dstRow[x * 4 + 2] = p[0]
                    dstRow[x * 4 + 3] = 255
                    x += 1
                }
            }
        }
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
            var hints = addrinfo(ai_flags: 0, ai_family: AF_INET, ai_socktype: SOCK_STREAM,
                                 ai_protocol: 0, ai_addrlen: 0, ai_canonname: nil,
                                 ai_addr: nil, ai_next: nil)
            var res: UnsafeMutablePointer<addrinfo>?
            let err = getaddrinfo(self.host, String(self.port), &hints, &res)
            guard err == 0, let info = res else { return }
            defer { freeaddrinfo(res) }

            let s = socket(info.pointee.ai_family, info.pointee.ai_socktype, info.pointee.ai_protocol)
            guard s >= 0 else { return }
            let ok = Darwin.connect(s, info.pointee.ai_addr, info.pointee.ai_addrlen)
            if ok != 0 {
                close(s)
                // 主 App 可能还没起监听，退避重试；上限 120 次（约 60 秒）
                if retry < 120 {
                    self.queue.asyncAfter(deadline: .now() + 0.5) {
                        self.connect(retry: retry + 1)
                    }
                }
                return
            }
            var on: Int32 = 1
            setsockopt(s, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
            self.fd = s
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
                    if n <= 0 { break }
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
