//
//  Engine.swift
//  JJCheatApp —— JavaScriptCore 引擎封装
//
//  dist/engine.js 被当作资源打进 App，这里加载并驱动。
//  所有 JS 调用都在专用串行队列上，避免跨线程用同一个 JSContext。
//

import Foundation
import JavaScriptCore

final class JJEngine {

    static let shared = JJEngine()

    private var ctx: JSContext?
    private let queue = DispatchQueue(label: "com.fujiang.jjcheat.engine", qos: .userInitiated)
    private(set) var loaded = false
    private(set) var lastError: String?

    // MARK: - 加载

    @discardableResult
    func loadIfNeeded() -> Bool {
        if loaded { return true }
        guard let path = Bundle.main.path(forResource: "engine", ofType: "js") else {
            lastError = "找不到 engine.js"
            return false
        }
        guard let src = try? String(contentsOfFile: path, encoding: .utf8) else {
            lastError = "engine.js 读取失败"
            return false
        }
        queue.sync {
            let c = JSContext()!
            c.exceptionHandler = { _, ex in
                NSLog("[JJCheat] JS 异常: \(ex?.toString() ?? "nil")")
            }
            c.evaluateScript(src)
            if let e = c["JJEngine"], !e.isUndefined, !e.isNull {
                self.ctx = c
                self.loaded = true
            } else {
                self.lastError = "engine.js 未导出 JJEngine"
            }
        }
        return loaded
    }

    // MARK: - 标定

    func setCorners(_ corners: [[Double]]) {
        guard loadIfNeeded() else { return }
        queue.sync {
            ctx?["JJEngine"]["setCorners"].call(withArguments: [corners])
        }
    }

    func reset(fen: String? = nil) {
        guard loadIfNeeded() else { return }
        queue.sync {
            ctx?["JJEngine"]["reset"].call(withArguments: [fen ?? NSNull()])
        }
    }

    // MARK: - 学习棋盘

    func learnBoard(pixels: Data, width: Int, height: Int) -> [String: Any]? {
        guard loadIfNeeded() else { return nil }
        var out: [String: Any]?
        queue.sync {
            guard let ctx, let arr = makeTypedArray(pixels, width: width, height: height) else { return }
            let res = ctx["JJEngine"]["learnBoard"].call(withArguments: [arr, width, height])
            out = Self.dict(res)
        }
        return out
    }

    // MARK: - 主处理

    func process(pixels: Data, width: Int, height: Int, timeMs: Int) -> [String: Any]? {
        guard loadIfNeeded() else { return nil }
        var out: [String: Any]?
        queue.sync {
            guard let ctx, let arr = makeTypedArray(pixels, width: width, height: height) else { return }
            let opts: [String: Any] = ["timeMs": timeMs, "maxDiff": 1]
            let res = ctx["JJEngine"]["process"].call(withArguments: [arr, width, height, opts])
            out = Self.dict(res)
        }
        return out
    }

    /// JSObject -> [String: Any]，逐键做类型归一，避免 as? 桥接失败
    static func dict(_ value: JSValue?) -> [String: Any]? {
        guard let value, !value.isUndefined, !value.isNull else { return nil }
        guard let raw = value.toDictionary() else { return nil }
        var out: [String: Any] = [:]
        for (k, v) in raw {
            guard let key = k as? String else { continue }
            out[key] = v
        }
        return out.isEmpty ? nil : out
    }

    /// 安全的数值读取
    static func int(_ d: [String: Any]?, _ key: String, _ def: Int = 0) -> Int {
        guard let v = d?[key] else { return def }
        if let n = v as? NSNumber { return n.intValue }
        if let s = v as? String { return Int(s) ?? def }
        return def
    }

    static func double(_ d: [String: Any]?, _ key: String, _ def: Double = 0) -> Double {
        guard let v = d?[key] else { return def }
        if let n = v as? NSNumber { return n.doubleValue }
        if let s = v as? String { return Double(s) ?? def }
        return def
    }

    static func str(_ d: [String: Any]?, _ key: String, _ def: String = "") -> String {
        guard let v = d?[key] else { return def }
        if let s = v as? String { return s }
        if let n = v as? NSNumber { return n.stringValue }
        return def
    }

    static func bool(_ d: [String: Any]?, _ key: String, _ def: Bool = false) -> Bool {
        guard let v = d?[key] else { return def }
        if let n = v as? NSNumber { return n.boolValue }
        if let b = v as? Bool { return b }
        return def
    }

    func currentFen() -> String {
        guard loadIfNeeded() else { return "" }
        var s = ""
        queue.sync { s = ctx?["JJEngine"]["currentFen"].call(withArguments: [])?.toString() ?? "" }
        return s
    }

    func gridPoints() -> [[Double]] {
        guard loadIfNeeded() else { return [] }
        var out: [[Double]] = []
        queue.sync {
            guard let res = ctx?["JJEngine"]["gridPoints"].call(withArguments: []),
                  let arr = res.toArray() as? [[NSNumber]] else { return }
            out = arr.map { [$0[0].doubleValue, $0[1].doubleValue] }
        }
        return out
    }

    // MARK: - 工具

    /// Data(RGBA) -> JS Uint8ClampedArray
    private func makeTypedArray(_ data: Data, width: Int, height: Int) -> JSValue? {
        guard let ctx else { return nil }
        let need = width * height * 4
        guard data.count >= need else { return nil }
        let gc = ctx.jsGlobalContextRef
        var exc: JSValueRef?
        guard let obj = JSObjectMakeTypedArray(gc, kJSTypedArrayTypeUint8ClampedArray, need, &exc) else {
            return nil
        }
        guard let ptr = JSObjectGetTypedArrayBytesPtr(gc, obj, nil) else { return nil }
        data.withUnsafeBytes { raw in
            if let base = raw.baseAddress { memcpy(ptr, base, need) }
        }
        return JSValue(jsValueRef: obj, in: ctx)
    }
}
