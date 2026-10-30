//
//  JJCheatApp.swift
//  JJCheatApp —— 入口
//
//  架构（和鹏飞象棋移动版 iOS 一致）：
//    照片（拍照 / 相册）→ 识别棋盘 → 引擎给着法 → 用户自己走子
//  没有录屏、没有广播扩展、没有画中画。
//

import SwiftUI
import UIKit

@main
struct JJCheatApp: App {

    init() {
        // 只加载本地引擎；识别在后台队列里跑，不阻塞启动
        _ = JJEngine.shared.loadIfNeeded()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
