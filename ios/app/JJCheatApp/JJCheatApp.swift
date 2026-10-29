//
//  JJCheatApp.swift
//  JJCheatApp —— 入口
//
//  注意：部署目标是 iOS 16，
//  不能用 iOS 17 才有的 onChange(of:initial:_:)，
//  生命周期统一交给 AppModel 里的 NotificationCenter 处理。
//

import SwiftUI
import AVFoundation
import UIKit

@main
struct JJCheatApp: App {

    init() {
        // 先把回环监听起起来，这样一开录屏 Extension 就能连上
        FrameServer.shared.start()
        JJEngine.shared.loadIfNeeded()
        // 静音音频保活：没有这一步，退到后台几秒后进程被挂起，
        // TCP 监听就断了，录屏扩展连不上，画面永远到不了
        AudioKeepAlive.shared.start()

        NSLog("[JJCheat] 启动完成 | 扩展 id = %@ | 扩展列表 = %@",
              ExtensionInfo.broadcastBundleID,
              ExtensionInfo.allAppExIDs.joined(separator: ", "))
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear {
                    AudioKeepAlive.shared.start()
                    FrameServer.shared.restart()
                }
        }
    }
}
