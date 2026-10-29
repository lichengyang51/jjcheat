//
//  PiPController.swift
//  JJCheatApp —— 画中画浮窗
//
//  用 AVPictureInPictureVideoCallViewController 承载自定义棋盘视图。
//  浮窗悬浮在 JJ象棋 之上，可拖动、可双指缩放。
//

import UIKit
import AVKit
import AVFoundation

final class PiPController: NSObject {

    static let shared = PiPController()

    private var pip: AVPictureInPictureController?
    private var host: AVPictureInPictureVideoCallViewController?
    private var container: UIViewController?
    let boardView = BoardRenderView(frame: CGRect(x: 0, y: 0, width: 320, height: 360))

    /// 浮窗尺寸（point）。9:10 棋盘 + 顶部信息条
    var preferredSize = CGSize(width: 300, height: 372)

    private(set) var isActive = false

    var onStateChange: ((Bool, String?) -> Void)?

    // MARK: - 启动

    /// @param sourceView 必须是在窗口层级里的可见 view（用作 PiP 的锚点）
    func start(sourceView: UIView) {
        guard AVPictureInPictureController.isPictureInPictureSupported() else {
            onStateChange?(false, "这台设备不支持画中画")
            return
        }
        if isActive { return }

        configureAudioSession()

        let vc = AVPictureInPictureVideoCallViewController()
        vc.preferredContentSize = preferredSize
        vc.view.backgroundColor = UIColor(red: 0.93, green: 0.84, blue: 0.66, alpha: 1)

        let child = UIViewController()
        child.view.backgroundColor = .clear
        boardView.frame = CGRect(origin: .zero, size: preferredSize)
        boardView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        child.view.addSubview(boardView)

        vc.addChild(child)
        child.view.frame = CGRect(origin: .zero, size: preferredSize)
        vc.view.addSubview(child.view)
        child.didMove(toParent: vc)
        host = vc
        container = child

        let source = AVPictureInPictureController.ContentSource(
            activeVideoCallSourceView: sourceView,
            contentViewController: vc
        )
        let controller = AVPictureInPictureController(contentSource: source)
        controller.delegate = self
        if #available(iOS 14.2, *) {
            controller.canStartPictureInPictureAutomaticallyFromInline = true
        }
        pip = controller
        controller.startPictureInPicture()
        isActive = true
        onStateChange?(true, nil)
        NSLog("[JJCheat] PiP 启动中")
    }

    func stop() {
        pip?.stopPictureInPicture()
        pip = nil
        host = nil
        container = nil
        isActive = false
        onStateChange?(false, nil)
    }

    // MARK: - 更新内容

    func update(fen: String, moveText: String, scoreText: String,
                winrate: Double, depth: Int, from: Int, to: Int) {
        boardView.fen = fen
        boardView.moveText = moveText
        boardView.scoreText = scoreText
        boardView.winrate = winrate
        boardView.depth = depth
        boardView.suggestFrom = from
        boardView.suggestTo = to
    }

    // MARK: - 音频会话

    /// 画中画要持续存在，必须有活跃的 audio session；
    /// 配置成 mixWithOthers + 播放静音，保证退到后台仍在跑。
    private func configureAudioSession() {
        let s = AVAudioSession.sharedInstance()
        do {
            try s.setCategory(.playback, mode: .moviePlayback, options: [.mixWithOthers])
            try s.setActive(true)
        } catch {
            NSLog("[JJCheat] AVAudioSession 配置失败: \(error)")
        }
    }
}

extension PiPController: AVPictureInPictureControllerDelegate {

    func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
        NSLog("[JJCheat] PiP 已开始")
        isActive = true
        onStateChange?(true, nil)
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
        NSLog("[JJCheat] PiP 已结束")
        isActive = false
        onStateChange?(false, nil)
    }

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                    failedToStartPictureInPictureWithError error: Error) {
        NSLog("[JJCheat] PiP 启动失败: \(error)")
        isActive = false
        onStateChange?(false, error.localizedDescription)
    }

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                    restoreUserInterfaceForPictureInPictureStopWithCompletionHandler
                                    completionHandler: @escaping (Bool) -> Void) {
        completionHandler(true)
    }
}
