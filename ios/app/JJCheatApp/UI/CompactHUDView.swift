//
//  CompactHUDView.swift
//  JJCheatApp —— 画中画浮窗内容（极简文字版）
//
//  设计取向：不画棋盘，只给定论。
//  用户瞟一眼就知道「走哪一步 + 现在什么局势」，浮窗尽量小、尽量不挡视线。
//

import UIKit

final class CompactHUDView: UIView {

    /// 主展示：着法（如 炮二平五），没有时显示状态（未校准 / 等开局 / 抢占中）
    var moveText: String = "" { didSet { setNeedsDisplay() } }
    /// 副信息第一段：引擎分值（如 +1.35）
    var scoreText: String = "" { didSet { setNeedsDisplay() } }
    /// 红方胜率 0...100
    var winrate: Double = 50 { didSet { setNeedsDisplay() } }
    /// 搜索深度
    var depth: Int = 0 { didSet { setNeedsDisplay() } }
    /// 当前是谁走（红方/黑方）
    var sideText: String = "" { didSet { setNeedsDisplay() } }
    /// 底部小字提示
    var hintText: String = "" { didSet { setNeedsDisplay() } }
    /// 是否为「有效着法」状态（决定主文字颜色）
    var hasMove: Bool = false { didSet { setNeedsDisplay() } }

    /// 构建标记（从 Info.plist 的 CFBundleVersion 读，每次编译都不一样）
    static let buildTag: String = {
        (Bundle.main.infoDictionary?["CFBundleVersion"] as? String) ?? "?"
    }()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = true
        contentMode = .redraw
    }

    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let w = bounds.width, h = bounds.height

        // 背景：深色圆角
        let bg = UIBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), cornerRadius: 12)
        UIColor(red: 0.05, green: 0.06, blue: 0.10, alpha: 0.95).setFill()
        bg.fill()

        // 左边一条高亮色带
        let stripe = UIBezierPath(roundedRect: CGRect(x: 0, y: 8, width: 4, height: h - 16), cornerRadius: 2)
        (hasMove ? UIColor(red: 1.0, green: 0.28, blue: 0.22, alpha: 1)
                 : UIColor(red: 0.45, green: 0.45, blue: 0.50, alpha: 1)).setFill()
        stripe.fill()

        // ---- 主文字：着法 ----
        let main = moveText.isEmpty ? "—" : moveText
        let mainSize = min(h * 0.42, w * 0.20)
        let mainAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: mainSize, weight: .heavy),
            .foregroundColor: hasMove
                ? UIColor(red: 1.0, green: 0.93, blue: 0.42, alpha: 1)
                : UIColor(red: 0.72, green: 0.74, blue: 0.80, alpha: 1)
        ]
        let mainStr = main as NSString
        let mainSz = mainStr.size(withAttributes: mainAttrs)
        mainStr.draw(at: CGPoint(x: 14, y: mainSize * 0.28), withAttributes: mainAttrs)

        // ---- 副信息：分值 / 胜率 / 深度 ----
        var parts: [String] = []
        if !scoreText.isEmpty { parts.append(scoreText) }
        if !sideText.isEmpty { parts.append("\(sideText)胜 \(String(format: "%.0f%%", winrate))") }
        if depth > 0 { parts.append("深\(depth)") }
        if !parts.isEmpty {
            let subAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedDigitSystemFont(ofSize: max(10, h * 0.14), weight: .medium),
                .foregroundColor: UIColor(red: 0.62, green: 0.82, blue: 1.0, alpha: 1)
            ]
            let sub = parts.joined(separator: "   ") as NSString
            let subSz = sub.size(withAttributes: subAttrs)
            sub.draw(at: CGPoint(x: w - subSz.width - 12, y: h * 0.30), withAttributes: subAttrs)
        }

        // ---- 胜率条 ----
        let barY = h - 14
        let barH: CGFloat = 5
        let barX: CGFloat = 14
        let barW = w - barX * 2

        let track = UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: barW, height: barH),
                                 cornerRadius: barH / 2)
        UIColor(white: 0.25, alpha: 0.8).setFill()
        track.fill()

        let pct = CGFloat(max(0, min(100, winrate)) / 100)
        if pct > 0.02 {
            let fill = UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: barW * pct, height: barH),
                                    cornerRadius: barH / 2)
            UIColor(red: 1.0, green: 0.30, blue: 0.24, alpha: 0.95).setFill()
            fill.fill()
        }

        // ---- 底部提示（仅在需要引导时出现）----
        if !hintText.isEmpty {
            let hintAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: max(9, h * 0.11), weight: .regular),
                .foregroundColor: UIColor(red: 0.55, green: 0.57, blue: 0.62, alpha: 1)
            ]
            (hintText as NSString).draw(at: CGPoint(x: 14, y: mainSize * 0.28 + mainSz.height - 2),
                                        withAttributes: hintAttrs)
        }

        // ---- 构建标记（右上角小字，用来确认装的是哪一版）----
        let tagAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedDigitSystemFont(ofSize: max(8, h * 0.095), weight: .regular),
            .foregroundColor: UIColor(red: 0.42, green: 0.44, blue: 0.50, alpha: 1)
        ]
        let tag = Self.buildTag as NSString
        let tagSz = tag.size(withAttributes: tagAttrs)
        tag.draw(at: CGPoint(x: w - tagSz.width - 10, y: 5), withAttributes: tagAttrs)
    }
}
