//
//  CompactHUDView.swift
//  JJCheatApp —— 画中画浮窗内容
//
//  这个浮窗有两个作用：
//    1. 显示「该走哪一步」和「局势如何」
//    2. ★ 提供一个可点击的「校准」按钮 —— 用户人在 JJ象棋 里，
//       回不到 App，所以校准入口必须长在浮窗上
//
//  浮窗布局（300×118）：
//    ┌──────────────────────────────┐
//    │ 炮二平五          [校准]     │  ← 着法 + 可点按钮
//    │ +1.35  红方胜 68%  深11       │
//    │ 对方刚走 马八进七             │
//    │ ████████████░░░░░░░          │
//    └──────────────────────────────┘
//

import UIKit

enum HUDCalibState {
    case idle          // 未校准，显示「校准」按钮
    case detecting     // 正在校准（限时）
    case success       // 校准成功
    case failed        // 校准失败
}

final class CompactHUDView: UIView {

    var moveText: String = "" { didSet { setNeedsDisplay() } }
    var scoreText: String = "" { didSet { setNeedsDisplay() } }
    var winrate: Double = 50 { didSet { setNeedsDisplay() } }
    var depth: Int = 0 { didSet { setNeedsDisplay() } }
    var sideText: String = "" { didSet { setNeedsDisplay() } }
    var hintText: String = "" { didSet { setNeedsDisplay() } }
    var hasMove: Bool = false { didSet { setNeedsDisplay() } }
    var calibState: HUDCalibState = .idle { didSet { setNeedsDisplay() } }

    /// 点击「校准」按钮的回调
    var onCalibrateTap: (() -> Void)?

    static let buildTag: String = {
        (Bundle.main.infoDictionary?["CFBundleVersion"] as? String) ?? "?"
    }()

    private var calibButtonRect: CGRect {
        let bw: CGFloat = 52, bh: CGFloat = 26
        return CGRect(x: bounds.width - bw - 8, y: 8, width: bw, height: bh)
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = true
        contentMode = .redraw
        isUserInteractionEnabled = true
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        addGestureRecognizer(tap)
    }

    required init?(coder: NSCoder) { fatalError() }

    @objc private func handleTap(_ g: UITapGestureRecognizer) {
        let p = g.location(in: self)
        // 按钮区域够大，手指点得准
        if calibButtonRect.insetBy(dx: -10, dy: -8).contains(p) {
            if calibState == .idle || calibState == .failed {
                onCalibrateTap?()
            }
        }
    }

    override func draw(_ rect: CGRect) {
        let w = bounds.width, h = bounds.height

        // 背景
        let bg = UIBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), cornerRadius: 12)
        UIColor(red: 0.05, green: 0.06, blue: 0.10, alpha: 0.95).setFill()
        bg.fill()

        // 左侧色带
        let stripe = UIBezierPath(roundedRect: CGRect(x: 0, y: 8, width: 4, height: h - 16), cornerRadius: 2)
        (hasMove ? UIColor(red: 1.0, green: 0.28, blue: 0.22, alpha: 1)
                 : UIColor(red: 0.45, green: 0.45, blue: 0.50, alpha: 1)).setFill()
        stripe.fill()

        // 主文字
        let main = moveText.isEmpty ? "—" : moveText
        let mainSize = min(h * 0.40, w * 0.17)
        let mainAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: mainSize, weight: .heavy),
            .foregroundColor: hasMove
                ? UIColor(red: 1.0, green: 0.93, blue: 0.42, alpha: 1)
                : UIColor(red: 0.72, green: 0.74, blue: 0.80, alpha: 1)
        ]
        let mainStr = main as NSString
        let mainSz = mainStr.size(withAttributes: mainAttrs)
        mainStr.draw(at: CGPoint(x: 14, y: mainSize * 0.24), withAttributes: mainAttrs)

        // 副信息（分值 / 胜率 / 深度），靠右但给按钮留位置
        var parts: [String] = []
        if !scoreText.isEmpty { parts.append(scoreText) }
        if !sideText.isEmpty && hasMove {
            parts.append("\(sideText)胜 \(String(format: "%.0f%%", winrate))")
        }
        if depth > 0 && hasMove { parts.append("深\(depth)") }
        if !parts.isEmpty {
            let subAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedDigitSystemFont(ofSize: max(10, h * 0.13), weight: .medium),
                .foregroundColor: UIColor(red: 0.62, green: 0.82, blue: 1.0, alpha: 1)
            ]
            let sub = parts.joined(separator: "  ") as NSString
            let subSz = sub.size(withAttributes: subAttrs)
            sub.draw(at: CGPoint(x: w - subSz.width - 12, y: h * 0.46), withAttributes: subAttrs)
        }

        // 提示行
        if !hintText.isEmpty {
            let hintAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: max(9, h * 0.105), weight: .regular),
                .foregroundColor: UIColor(red: 0.55, green: 0.57, blue: 0.62, alpha: 1)
            ]
            (hintText as NSString).draw(at: CGPoint(x: 14, y: mainSize * 0.24 + mainSz.height - 1),
                                        withAttributes: hintAttrs)
        }

        // 胜率条
        let barY = h - 13
        let barH: CGFloat = 5
        let barX: CGFloat = 14
        let barW = w - barX * 2
        let track = UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: barW, height: barH),
                                 cornerRadius: barH / 2)
        UIColor(white: 0.25, alpha: 0.8).setFill()
        track.fill()
        let pct = CGFloat(max(0, min(100, winrate)) / 100)
        if pct > 0.02 && hasMove {
            let fill = UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: barW * pct, height: barH),
                                    cornerRadius: barH / 2)
            UIColor(red: 1.0, green: 0.30, blue: 0.24, alpha: 0.95).setFill()
            fill.fill()
        }

        // ★ 校准按钮
        drawCalibButton()

        // 构建标记
        let tagAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedDigitSystemFont(ofSize: max(8, h * 0.085), weight: .regular),
            .foregroundColor: UIColor(red: 0.40, green: 0.42, blue: 0.48, alpha: 1)
        ]
        let tag = Self.buildTag as NSString
        let tagSz = tag.size(withAttributes: tagAttrs)
        tag.draw(at: CGPoint(x: w - tagSz.width - 10, y: h - tagSz.height - 15), withAttributes: tagAttrs)
    }

    private func drawCalibButton() {
        let r = calibButtonRect
        let path = UIBezierPath(roundedRect: r, cornerRadius: 13)

        let (bgColor, title, textColor): (UIColor, String, UIColor) = {
            switch calibState {
            case .idle:
                return (UIColor(red: 0.15, green: 0.55, blue: 0.95, alpha: 0.95), "校准", .white)
            case .detecting:
                return (UIColor(red: 0.90, green: 0.60, blue: 0.10, alpha: 0.95), "校准中", .white)
            case .success:
                return (UIColor(red: 0.12, green: 0.66, blue: 0.28, alpha: 0.95), "✓成功", .white)
            case .failed:
                return (UIColor(red: 0.80, green: 0.22, blue: 0.20, alpha: 0.95), "重试", .white)
            }
        }()

        bgColor.setFill()
        path.fill()

        let font = UIFont.systemFont(ofSize: max(11, bounds.height * 0.135), weight: .semibold)
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: textColor]
        let s = title as NSString
        let sz = s.size(withAttributes: attrs)
        s.draw(at: CGPoint(x: r.midX - sz.width / 2, y: r.midY - sz.height / 2), withAttributes: attrs)
    }
}
