//
//  JJCheatApp.swift
//  JJCheatApp —— 入口
//

import SwiftUI
import AVFoundation

@main
struct JJCheatApp: App {

    init() {
        // 先把回环监听起起来，这样一开录屏 Extension 就能连上
        FrameServer.shared.start()
        JJEngine.shared.loadIfNeeded()
        // 提前激活音频会话，画中画才稳
        let s = AVAudioSession.sharedInstance()
        try? s.setCategory(.playback, mode: .moviePlayback, options: [.mixWithOthers])
        try? s.setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear { FrameServer.shared.start() }
        }
    }
}
