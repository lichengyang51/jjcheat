//
//  Engine.swift
//  JJCheatApp —— JavaScriptCore 引擎封装
//
//  dist/engine.js 被当作资源打进 App，这里加载并驱动。
//  所有 JS 调用都在专用串行队列上，避免跨线程用同一个 JSContext。
//
//  注意：JSContext 不支持 `ctx["x"]` 下标语法，必须走 objectForKeyedSubscript。
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
            NSLog("[JJCheat] %@", lastError!)
            return false
        }
        guard let src = try? String(contentsOfFile: path, encoding: .utf8) else {
            lastError = "engine.js 读取失败"
            NSLog("[JJCheat] %@", lastError!)
            return false
        }

        queue.sync { () -> Void in
            guard let c = JSContext() else { return }
            c.exceptionHandler = { _, ex in
                NSLog("[JJCheat] JS 异常: %@", ex?.toString() ?? "nil")
            }
            c.evaluateScript(src)
            let engine = c.objectForKeyedSubscript("JJEngine")
            if let engine, !engine.isUndefined, !engine.isNull {
                self.ctx = c
                self.loaded = true
            } else {
                self.lastError = "engine.js 未导出 JJEngine"
            }
        }
        NSLog("[JJCheat] engine.js 加载%@", loaded ? "成功" : "失败")
        return loaded
    }

    /// 取 JJEngine 上的一个函数
    private func engineFunction(_ name: String) -> JSValue? {
        guard let ctx else { return nil }
        guard let engine = ctx.objectForKeyedSubscript("JJEngine"),
              !engine.isUndefined, !engine.isNull else { return nil }
        guard let fn = engine.objectForKeyedSubscript(name),
              !fn.isUndefined, !fn.isNull else { return nil }
        return fn
    }

    private func callEngine(_ name: String, args: [Any]) -> JSValue? {
        guard let fn = engineFunction(name) else { return nil }
        return fn.call(withArguments: args)
    }

    // MARK: - 标定

    func setCorners(_ corners: [[Double]]) {
        guard loadIfNeeded() else { return }
        queue.sync { () -> Void in
            _ = self.callEngine("setCorners", args: [corners])
        }
    }

    func reset(fen: String? = nil) {
        guard loadIfNeeded() else { return }
        queue.sync { () -> Void in
            _ = self.callEngine("reset", args: [fen ?? NSNull()])
        }
    }

    /// 清空学习结果，退回默认阈值（画面不是开局时的兜底）
    func skipLearning() {
        guard loadIfNeeded() else { return }
        queue.sync { () -> Void in
            _ = self.callEngine("skipLearning", args: [])
        }
    }

    /// 自动检测棋盘四角（9 竖 10 横等距网格投影法）
    /// 返回 [[左上],[右上],[右下],[左下]]，失败返回 nil
    func autoDetectBoard(pixels: Data, width: Int, height: Int) -> [[Double]]? {
        guard loadIfNeeded() else { return nil }
        var out: [[Double]]?
        queue.sync { () -> Void in
            guard let arr = self.makeTypedArray(pixels, width: width, height: height) else { return }
            guard let res = self.callEngine("autoDetectBoard", args: [arr, width, height]),
                  !res.isNull, !res.isUndefined,
                  let a = res.toArray() as? [[NSNumber]], a.count == 4 else { return }
            out = a.map { [$0[0].doubleValue, $0[1].doubleValue] }
        }
        return out
    }

    // MARK: - 学习棋盘

    func learnBoard(pixels: Data, width: Int, height: Int) -> [String: Any]? {
        guard loadIfNeeded() else { return nil }
        var out: [String: Any]?
        queue.sync { () -> Void in
            guard let arr = self.makeTypedArray(pixels, width: width, height: height) else { return }
            let res = self.callEngine("learnBoard", args: [arr, width, height])
            out = Self.dict(res)
        }
        return out
    }

    // MARK: - 主处理

    /// 直接分析一个 FEN（不经过画面识别）。
    /// 手动改完棋子之后重新算棋就走这里。
    /// 注意：JS 端签名是 analyzeFen(fen, timeMs)，第二个参数是数字，不是 options 对象。
    func analyzeFen(fen: String, timeMs: Int) -> [String: Any]? {
        guard loadIfNeeded() else { return nil }
        var out: [String: Any]?
        queue.sync { () -> Void in
            let res = self.callEngine("analyzeFen", args: [fen, timeMs])
            out = Self.dict(res)
        }
        return out
    }

    /// 多候选着法（界面上的「思考列表」）
    func analyzeTop(fen: String, timeMs: Int, count: Int) -> [String: Any]? {
        guard loadIfNeeded() else { return nil }
        var out: [String: Any]?
        queue.sync { () -> Void in
            let opts: [String: Any] = ["timeMs": timeMs, "count": count]
            let res = self.callEngine("analyzeTop", args: [fen, opts])
            out = Self.dict(res)
        }
        return out
    }
    /// - Parameter live: 实时模式。实时帧不走「连续 3 帧一致才认」那一套 ——
///   对方落子后棋盘会一直保持新状态，但稳定值机制会因为某几格置信度偏低
///   而继续沿用旧值，表现就是「对方走了，浮窗里没变」。实时模式直接采信本帧。
func process(pixels: Data, width: Int, height: Int, timeMs: Int, live: Bool = false) -> [String: Any]? {
        guard loadIfNeeded() else { return nil }
        var out: [String: Any]?
        queue.sync { () -> Void in
            guard let arr = self.makeTypedArray(pixels, width: width, height: height) else { return }
            let opts: [String: Any] = ["timeMs": timeMs, "maxDiff": 1, "live": live ? 1 : 0]
            let res = self.callEngine("process", args: [arr, width, height, opts])
            out = Self.dict(res)
        }
        return out
    }

    /// UCCI 着法 → 中文着法 + 起止格（云库返回的 move:xxxx 用它翻译）
    func moveInfo(fen: String, ucci: String) -> [String: Any] {
        guard loadIfNeeded() else { return [:] }
        var out: [String: Any] = [:]
        queue.sync { () -> Void in
            let res = self.callEngine("moveInfo", args: [fen, ucci])
            out = Self.dict(res) ?? [:]
        }
        return out
    }

    /// 这一步在这个局面里合不合法（云库给的着法必须先过这一关）
    func isLegalMove(fen: String, ucci: String) -> Bool {
        guard loadIfNeeded() else { return false }
        var ok = false
        queue.sync { () -> Void in
            let res = self.callEngine("isLegalMove", args: [fen, ucci])
            ok = (res?.toInt32() ?? 0) != 0
        }
        return ok
    }

    func currentFen() -> String {
        guard loadIfNeeded() else { return "" }
        var s = ""
        queue.sync { () -> Void in
            s = self.callEngine("currentFen", args: [])?.toString() ?? ""
        }
        return s
    }

    func gridPoints() -> [[Double]] {
        guard loadIfNeeded() else { return [] }
        var out: [[Double]] = []
        queue.sync { () -> Void in
            guard let res = self.callEngine("gridPoints", args: []),
                  let arr = res.toArray() as? [[NSNumber]] else { return }
            out = arr.map { [$0[0].doubleValue, $0[1].doubleValue] }
        }
        return out
    }

    // MARK: - 数据转换

    /// Data(RGBA) -> JS Uint8ClampedArray
    private func makeTypedArray(_ data: Data, width: Int, height: Int) -> JSValue? {
        guard let ctx else { return nil }
        let need = width * height * 4
        guard need > 0, data.count >= need else { return nil }

        let gc = ctx.jsGlobalContextRef
        var exc: JSValueRef?
        guard let obj = JSObjectMakeTypedArray(gc, kJSTypedArrayTypeUint8ClampedArray, need, &exc) else {
            return nil
        }
        guard let ptr = JSObjectGetTypedArrayBytesPtr(gc, obj, nil) else { return nil }
        data.withUnsafeBytes { raw in
            if let base = raw.baseAddress {
                memcpy(ptr, base, need)
            }
        }
        return JSValue(jsValueRef: obj, in: ctx)
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

    // MARK: - 安全数值读取

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
}
