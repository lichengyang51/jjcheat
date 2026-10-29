//
//  PiPController.swift
//  JJCheatApp —— 画中画浮窗
//
//  用 AVPictureInPictureVideoCallViewController 承载一个极简文字视图。
//  浮窗体积小，飘在 JJ象棋 上方，只告诉你「走哪一步」和「局势如何」。
//

import UIKit
import AVKit
import AVFoundation

final class PiPController: NSObject {

    static let shared = PiPController()

    private var pip: AVPictureInPictureController?
    private var host: AVPictureInPictureVideoCallViewController?
    private var container: UIViewController?

    /// 极简文字浮窗
    let hudView = CompactHUDView(frame: CGRect(x: 0, y: 0, width: 300, height: 118))

    /// 浮窗尺寸（point）。宽扁形，占屏幕一小块
    var preferredSize = CGSize(width: 300, height: 118)

    private(set) var isActive = false
    var onStateChange: ((Bool, String?) -> Void)?

    // MARK: - 启动

    func start(sourceView: UIView) {
        guard AVPictureInPictureController.isPictureInPictureSupported() else {
            onStateChange?(false, "这台设备不支持画中画")
            return
        }
        if isActive { return }

        configureAudioSession()

        let vc = AVPictureInPictureVideoCallViewController()
        vc.preferredContentSize = preferredSize
        vc.view.backgroundColor = UIColor(red: 0.05, green: 0.06, blue: 0.10, alpha: 1)

        let child = UIViewController()
        child.view.backgroundColor = .clear
        hudView.frame = CGRect(origin: .zero, size: preferredSize)
        hudView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        child.view.addSubview(hudView)

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

    /// statusKind: 0 灰未就绪 / 1 蓝校准中 / 2 绿就绪 / 3 红失败
    func update(moveText: String,
                scoreText: String,
                winrate: Double,
                depth: Int,
                sideText: String,
                hintText: String,
                hasMove: Bool,
                statusKind: Int) {
        hudView.moveText = moveText
        hudView.scoreText = scoreText
        hudView.winrate = winrate
        hudView.depth = depth
        hudView.sideText = sideText
        hudView.hintText = hintText
        hudView.hasMove = hasMove
        hudView.statusKind = statusKind
    }

    // MARK: - 音频会话

    /// 画中画要持续存在，需要活跃的 audio session
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
