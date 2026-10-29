//
//  JJCheatApp.swift
//  JJCheatApp —— 入口
//

import SwiftUI
import AVFoundation
import UIKit

@main
struct JJCheatApp: App {

    @Environment(\.scenePhase) private var scenePhase

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
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                AudioKeepAlive.shared.start()
                FrameServer.shared.restart()
            case .background:
                AudioKeepAlive.shared.start()
            default:
                break
            }
        }
    }
}
