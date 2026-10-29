//
//  CompactHUDView.swift
//  JJCheatApp —— 画中画浮窗内容
//
//  【重要】这个浮窗只负责「显示」，不承担任何点击。
//  iOS 的 PiP 窗口点击任意位置都会唤回宿主 App（系统写死的行为），
//  所以「在浮窗上放校准按钮」这条路从原理上走不通。
//
//  校准全部在后台自动完成：用户在 JJ象棋 里的时候，帧一直传回来，
//  App 自己找棋盘、判朝向、学模板、算棋，用户只管看字。
//

import UIKit

final class CompactHUDView: UIView {

    var moveText: String = "" { didSet { setNeedsDisplay() } }
    var scoreText: String = "" { didSet { setNeedsDisplay() } }
    var winrate: Double = 50 { didSet { setNeedsDisplay() } }
    var depth: Int = 0 { didSet { setNeedsDisplay() } }
    var sideText: String = "" { didSet { setNeedsDisplay() } }
    var hintText: String = "" { didSet { setNeedsDisplay() } }
    var hasMove: Bool = false { didSet { setNeedsDisplay() } }
    /// 状态色：0 灰（未就绪）1 蓝（校准中）2 绿（就绪）3 红（失败）
    var statusKind: Int = 0 { didSet { setNeedsDisplay() } }

    static let buildTag: String = {
        (Bundle.main.infoDictionary?["CFBundleVersion"] as? String) ?? "?"
    }()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = true
        contentMode = .redraw
        isUserInteractionEnabled = false      // 明确不吃触摸
    }

    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ rect: CGRect) {
        let w = bounds.width, h = bounds.height

        let bg = UIBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), cornerRadius: 12)
        UIColor(red: 0.05, green: 0.06, blue: 0.10, alpha: 0.95).setFill()
        bg.fill()

        // 左侧状态色带
        let stripeColor: UIColor = {
            switch statusKind {
            case 1: return UIColor(red: 0.20, green: 0.60, blue: 1.0, alpha: 1)
            case 2: return UIColor(red: 0.15, green: 0.80, blue: 0.35, alpha: 1)
            case 3: return UIColor(red: 1.0, green: 0.30, blue: 0.25, alpha: 1)
            default: return UIColor(red: 0.45, green: 0.45, blue: 0.50, alpha: 1)
            }
        }()
        let stripe = UIBezierPath(roundedRect: CGRect(x: 0, y: 8, width: 4, height: h - 16), cornerRadius: 2)
        stripeColor.setFill()
        stripe.fill()

        // 主文字
        let main = moveText.isEmpty ? "—" : moveText
        let mainSize = min(h * 0.40, w * 0.17)
        let mainAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: mainSize, weight: .heavy),
            .foregroundColor: hasMove
                ? UIColor(red: 1.0, green: 0.93, blue: 0.42, alpha: 1)
                : UIColor(red: 0.80, green: 0.82, blue: 0.88, alpha: 1)
        ]
        let mainStr = main as NSString
        let mainSz = mainStr.size(withAttributes: mainAttrs)
        mainStr.draw(at: CGPoint(x: 14, y: mainSize * 0.20), withAttributes: mainAttrs)

        // 副信息
        var parts: [String] = []
        if !scoreText.isEmpty && hasMove { parts.append(scoreText) }
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
            sub.draw(at: CGPoint(x: w - subSz.width - 12, y: h * 0.22), withAttributes: subAttrs)
        }

        // 提示行
        if !hintText.isEmpty {
            let hintAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: max(9, h * 0.105), weight: .regular),
                .foregroundColor: UIColor(red: 0.58, green: 0.60, blue: 0.66, alpha: 1)
            ]
            (hintText as NSString).draw(at: CGPoint(x: 14, y: mainSize * 0.20 + mainSz.height - 2),
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

        // 构建标记
        let tagAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedDigitSystemFont(ofSize: max(8, h * 0.085), weight: .regular),
            .foregroundColor: UIColor(red: 0.40, green: 0.42, blue: 0.48, alpha: 1)
        ]
        let tag = Self.buildTag as NSString
        let tagSz = tag.size(withAttributes: tagAttrs)
        tag.draw(at: CGPoint(x: w - tagSz.width - 10, y: h - tagSz.height - 15), withAttributes: tagAttrs)
    }
}
