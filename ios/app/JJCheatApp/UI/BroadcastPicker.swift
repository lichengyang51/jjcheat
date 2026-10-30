import SwiftUI
import ReplayKit

/// 系统录屏选择器的「隐形按钮」持有者
///
/// iOS 不允许用代码直接开始屏幕录制，必须由用户点系统的面板确认。
/// RPSystemBroadcastPickerView 就是这个面板的载体，把它放进视图层级里，
/// 再对我们的按钮模拟一次点击，就能弹出「开始直播/录屏」那张卡。
final class BroadcastPickerHolder {
    static let shared = BroadcastPickerHolder()
    weak var picker: RPSystemBroadcastPickerView?

    func trigger() {
        guard let picker else {
            NSLog("[JJCheat] 录屏选择器还没就位")
            return
        }
        for v in picker.subviews {
            if let b = v as? UIButton {
                // 递归找一遍：不同 iOS 版本按钮层级不一样
                b.sendActions(for: .touchUpInside)
                b.sendActions(for: .touchUpOutside)
                b.sendActions(for: .primaryActionTriggered)
            }
        }
    }
}

struct BroadcastPickerAnchor: UIViewRepresentable {

    func makeUIView(context: Context) -> RPSystemBroadcastPickerView {
        let v = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 44, height: 44))
        v.preferredExtension = ExtensionInfo.broadcastBundleID
        v.showsMicrophoneButton = false
        // 我们只用它弹面板，按钮本身藏起来（缩到几乎透明）
        for sub in v.subviews {
            if let b = sub as? UIButton { b.alpha = 0.02 }
        }
        BroadcastPickerHolder.shared.picker = v
        return v
    }

    func updateUIView(_ uiView: RPSystemBroadcastPickerView, context: Context) {}
}
