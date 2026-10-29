//
//  Protocol.swift
//  JJCheat —— App 与 Broadcast Extension 共用的帧协议
//
//  免费 Apple ID 签名拿不到 App Group 能力，
//  所以用 127.0.0.1 回环 TCP 代替共享容器。
//
//  两种包：
//    payloadLen > 0  正常画面帧
//    payloadLen == 0 心跳包（扩展存活 / 转换失败时用来证明它还活着）
//

import Foundation

public enum JJProto {
    public static let port: UInt16 = 9527
    public static let magic: UInt32 = 0x4A4A4346          // 'JJCF'
    public static let version: UInt8 = 1
    public static let headerSize = 17                     // magic4 + ver1 + w2 + h2 + bpr4 + len4
}

public struct JJFrameHeader {
    public var width: UInt16
    public var height: UInt16
    public var bytesPerRow: UInt32
    public var payloadLen: UInt32

    public init(width: UInt16, height: UInt16, bytesPerRow: UInt32, payloadLen: UInt32) {
        self.width = width
        self.height = height
        self.bytesPerRow = bytesPerRow
        self.payloadLen = payloadLen
    }

    /// 心跳包：无负载
    public static func heartbeat() -> JJFrameHeader {
        JJFrameHeader(width: 0, height: 0, bytesPerRow: 0, payloadLen: 0)
    }

    public var isHeartbeat: Bool { payloadLen == 0 }

    public func encoded() -> Data {
        var d = Data(capacity: JJProto.headerSize)
        var m = JJProto.magic
        var v = JJProto.version
        var w = width
        var h = height
        var b = bytesPerRow
        var l = payloadLen
        // 全部用小端写，接收端也按小端读，两端严格对称
        withUnsafeBytes(of: &m) { d.append(contentsOf: $0) }
        withUnsafeBytes(of: &v) { d.append(contentsOf: $0) }
        withUnsafeBytes(of: &w) { d.append(contentsOf: $0) }
        withUnsafeBytes(of: &h) { d.append(contentsOf: $0) }
        withUnsafeBytes(of: &b) { d.append(contentsOf: $0) }
        withUnsafeBytes(of: &l) { d.append(contentsOf: $0) }
        return d
    }

    /// 返回 nil 表示魔数/版本校验失败（收到的是垃圾数据）
    public static func decode(_ data: Data) -> JJFrameHeader? {
        guard data.count >= JJProto.headerSize else { return nil }
        let m = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 0, as: UInt32.self) }
        guard m == JJProto.magic else { return nil }
        let v = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 4, as: UInt8.self) }
        guard v == JJProto.version else { return nil }
        let w = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 5, as: UInt16.self) }
        let h = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 7, as: UInt16.self) }
        let b = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 9, as: UInt32.self) }
        let l = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: 13, as: UInt32.self) }
        guard l < 64 * 1024 * 1024 else { return nil }
        // 心跳包没有宽高，正常帧必须有
        if l > 0 && (w == 0 || h == 0) { return nil }
        return JJFrameHeader(width: w, height: h, bytesPerRow: b, payloadLen: l)
    }
}
