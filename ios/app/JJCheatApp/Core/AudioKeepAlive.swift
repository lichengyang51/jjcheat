//
//  AudioKeepAlive.swift
//  JJCheatApp —— 静音音频保活
//
//  主 App 一旦退到后台，系统几秒内就会挂起进程，
//  127.0.0.1:9527 的监听随之断掉，录屏扩展就连不上、收不到帧。
//
//  这里循环播放一段全零采样的 WAV（真的在播，只是没声音），
//  配合 Info.plist 的 UIBackgroundModes=audio，让进程常驻。
//

import Foundation
import AVFoundation

final class AudioKeepAlive {

    static let shared = AudioKeepAlive()

    private var player: AVAudioPlayer?
    private(set) var isRunning = false

    private init() {}

    func start() {
        if isRunning { return }

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            NSLog("[JJCheat] 音频会话配置失败: %@", "\(error)")
        }

        guard let wav = Self.makeSilentWav() else {
            NSLog("[JJCheat] 静音 WAV 生成失败")
            return
        }
        do {
            let p = try AVAudioPlayer(data: wav, fileTypeHint: AVFileType.wav.rawValue)
            p.numberOfLoops = -1        // 无限循环
            p.volume = 0                // 完全静音，用户听不到
            p.prepareToPlay()
            let ok = p.play()
            player = p
            isRunning = ok
            NSLog("[JJCheat] 音频保活%@", ok ? "已启动" : "启动失败")
        } catch {
            NSLog("[JJCheat] 静音播放失败: %@", "\(error)")
        }
    }

    func stop() {
        player?.stop()
        player = nil
        isRunning = false
    }

    /// 生成 1 秒 8kHz 单声道 16bit 的全零 WAV
    static func makeSilentWav(seconds: Double = 1.0, sampleRate: Int = 8000) -> Data? {
        let frames = Int(Double(sampleRate) * seconds)
        guard frames > 0 else { return nil }
        let dataSize = frames * 2
        var d = Data(capacity: 44 + dataSize)

        func u32(_ v: UInt32) { var x = v.littleEndian; withUnsafeBytes(of: &x) { d.append(contentsOf: $0) } }
        func u16(_ v: UInt16) { var x = v.littleEndian; withUnsafeBytes(of: &x) { d.append(contentsOf: $0) } }
        func tag(_ s: String) { d.append(contentsOf: Array(s.utf8)) }

        tag("RIFF")
        u32(UInt32(36 + dataSize))
        tag("WAVE")
        tag("fmt ")
        u32(16)                       // fmt 块大小
        u16(1)                        // PCM
        u16(1)                        // 单声道
        u32(UInt32(sampleRate))
        u32(UInt32(sampleRate * 2))   // byte rate
        u16(2)                        // block align
        u16(16)                       // 位深
        tag("data")
        u32(UInt32(dataSize))
        d.append(Data(count: dataSize))   // 全零 = 静音
        return d
    }
}
