import UIKit
import AVKit
import AVFoundation

final class PiPController: NSObject {

    static let shared = PiPController()

    private var pip: AVPictureInPictureController?
    private var host: AVPictureInPictureVideoCallViewController?
    private var container: UIViewController?

    /// 16:9 横版。不要改成竖版：竖版系统摆在右上角时会压到棋盘上沿，
    /// 盖住的格子多了，识别就会缺子。
    var preferredSize = CGSize(width: 480, height: 270)

    let panel = FloatingPanelView(frame: CGRect(x: 0, y: 0, width: 480, height: 270))

    private(set) var isActive = false
    var onStateChange: ((Bool, String?) -> Void)?

    func start(sourceView: UIView) {
        guard AVPictureInPictureController.isPictureInPictureSupported() else {
            onStateChange?(false, "这台设备不支持画中画")
            return
        }
        if isActive { return }

        configureAudioSession()

        let vc = AVPictureInPictureVideoCallViewController()
        vc.preferredContentSize = preferredSize
        vc.view.backgroundColor = UIColor(red: 0.06, green: 0.07, blue: 0.10, alpha: 1)

        let child = UIViewController()
        child.view.backgroundColor = UIColor(red: 0.06, green: 0.07, blue: 0.10, alpha: 1)
        panel.frame = CGRect(origin: .zero, size: preferredSize)
        panel.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        child.view.addSubview(panel)

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
    }

    func stop() {
        pip?.stopPictureInPicture()
        pip = nil
        host = nil
        container = nil
        isActive = false
        onStateChange?(false, nil)
    }

    /// 推内容进浮窗（版式固定成鹏飞那样：小棋盘 + 一行大字着法）
    func update(fen: String, moveChinese: String, fromSq: Int, toSq: Int, redAtBottom: Bool, hint: String) {
        panel.apply(fen: fen,
                    moveChinese: moveChinese,
                    fromSq: fromSq,
                    toSq: toSq,
                    redAtBottom: redAtBottom,
                    hint: hint)
    }

    /// 还没识别出局面时的「正在识别」状态
    func waiting(_ text: String) {
        panel.showWaiting(text)
    }

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
        isActive = true
        onStateChange?(true, nil)
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
        isActive = false
        onStateChange?(false, nil)
    }

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                    failedToStartPictureInPictureWithError error: Error) {
        isActive = false
        onStateChange?(false, error.localizedDescription)
    }

    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                    restoreUserInterfaceForPictureInPictureStopWithCompletionHandler
                                    completionHandler: @escaping (Bool) -> Void) {
        completionHandler(true)
    }
}
