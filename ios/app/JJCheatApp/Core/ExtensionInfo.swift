//
//  ExtensionInfo.swift
//  JJCheatApp —— 运行时找出录屏扩展的真实 bundle id
//
//  Sideloadly 签名时可以改写 bundle id，
//  硬编码的 "com.fujiang.jjcheat.broadcast" 就会失效，
//  RPSystemBroadcastPickerView 选中后起不来。
//  这里从 App 自己的 PlugIns 目录里把 appex 的真实 id 读出来。
//

import Foundation

enum ExtensionInfo {

    /// 录屏扩展的真实 bundle id
    static let broadcastBundleID: String = {
        // 1) 从 PlugIns/*.appex 里找
        if let pluginsURL = Bundle.main.builtInPlugInsURL,
           let items = try? FileManager.default.contentsOfDirectory(
                at: pluginsURL,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]) {
            for item in items where item.pathExtension == "appex" {
                if let b = Bundle(url: item), let id = b.bundleIdentifier, !id.isEmpty {
                    NSLog("[JJCheat] 找到录屏扩展: %@", id)
                    return id
                }
            }
        }
        // 2) 兜底：原始 id
        NSLog("[JJCheat] PlugIns 里没找到 appex，回退默认 id")
        return "com.fujiang.jjcheat.broadcast"
    }()

    /// 当前已安装的所有 broadcast 扩展（诊断用）
    static var allAppExIDs: [String] {
        guard let pluginsURL = Bundle.main.builtInPlugInsURL,
              let items = try? FileManager.default.contentsOfDirectory(
                at: pluginsURL, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])
        else { return [] }
        return items.compactMap { item -> String? in
            guard item.pathExtension == "appex" else { return nil }
            return Bundle(url: item)?.bundleIdentifier
        }
    }
}
