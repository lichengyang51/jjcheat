//
//  Protocol.swift
//  JJCheat —— App 与 Broadcast Extension 共用的帧协议
//
//  设计要点：免费 Apple ID 签名拿不到 App Group 能力，
//  所以用 127.0.0.1 回环 TCP 代替共享容器。
//  Extension 当 client，主 App 当 server。
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

    public func encoded() -> Data {
        var d = Data(capacity: JJProto.headerSize)
        var m = JJProto.magic.bigEndian
        var v = JJProto.version
        var w = width.bigEndian
        var h = height.bigEndian
        var b = bytesPerRow.bigEndian
        var l = payloadLen.bigEndian
        withUnsafeBytes(of: &m) { d.append(contentsOf: $0) }
        withUnsafeBytes(of: &v) { d.append(contentsOf: $0) }
        withUnsafeBytes(of: &w) { d.append(contentsOf: $0) }
        withUnsafeBytes(of: &h) { d.append(contentsOf: $0) }
        withUnsafeBytes(of: &b) { d.append(contentsOf: $0) }
        withUnsafeBytes(of: &l) { d.append(contentsOf: $0) }
        return d
    }

    /// 返回 nil 表示魔数校验失败（说明收到的是垃圾数据）
    public static func decode(_ data: Data) -> JJFrameHeader? {
        guard data.count >= JJProto.headerSize else { return nil }
        let m = data.withUnsafeBytes { $0.load(fromByteOffset: 0, as: UInt32.self).bigEndian }
        guard m == JJProto.magic else { return nil }
        let v = data.withUnsafeBytes { $0.load(fromByteOffset: 4, as: UInt8.self) }
        guard v == JJProto.version else { return nil }
        let w = data.withUnsafeBytes { $0.load(fromByteOffset: 5, as: UInt16.self).bigEndian }
        let h = data.withUnsafeBytes { $0.load(fromByteOffset: 7, as: UInt16.self).bigEndian }
        let b = data.withUnsafeBytes { $0.load(fromByteOffset: 9, as: UInt32.self).bigEndian }
        let l = data.withUnsafeBytes { $0.load(fromByteOffset: 13, as: UInt32.self).bigEndian }
        guard w > 0, h > 0, l > 0, l < 64 * 1024 * 1024 else { return nil }
        return JJFrameHeader(width: w, height: h, bytesPerRow: b, payloadLen: l)
    }
}
