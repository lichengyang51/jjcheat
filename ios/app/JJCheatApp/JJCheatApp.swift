//
//  JJCheatApp.swift
//  JJCheatApp —— 入口
//
//  注意：
//   · 部署目标是 iOS 16，不能用 iOS 17 才有的 onChange(of:initial:_:)
//   · 不做音频保活。ReplayKit 广播启动时会抢音频会话，
//     我们再去 setActive 容易把进程搞崩。
//     后台常驻交给画中画（PiP）本身提供的保活能力。
//

import SwiftUI
import UIKit

@main
struct JJCheatApp: App {

    init() {
        // 先把回环监听起起来，这样一开录屏 Extension 就能连上
        FrameServer.shared.start()
        JJEngine.shared.loadIfNeeded()

        NSLog("[JJCheat] 启动完成 | 扩展 id = %@ | 扩展列表 = %@",
              ExtensionInfo.broadcastBundleID,
              ExtensionInfo.allAppExIDs.joined(separator: ", "))
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
            // 这里不要再调 restart()：它会 stop→等 0.4s→start，
            // 每次界面刷新都把正在工作的帧流打断。
            // 监听的启停统一交给 AppModel 和 FrameServer 自己管。
        }
    }
}
