//
//  CompactHUDView.swift
//  JJCheatApp —— 画中画浮窗内容
//
//  浮窗只负责「显示」，不承担点击（iOS 的 PiP 点任意位置都会唤回宿主 App）。
//
//  布局（300×118，重新排过，解决文字叠字）：
//    ┌──────────────────────────────────┐
//    │ 炮七进六            +0.15  深11  │  主 36pt 左 / 副 11pt 右
//    │ 对方刚走 车9平8 · 你执红          │  提示 10pt
//    │ ████████████░░░░░░░  红胜 94%    │  胜率条 + 百分比
//    └──────────────────────────────────┘
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
    /// 0 灰未就绪 / 1 蓝校准中 / 2 绿就绪 / 3 红失败
    var statusKind: Int = 0 { didSet { setNeedsDisplay() } }

    static let buildTag: String = {
        (Bundle.main.infoDictionary?["CFBundleVersion"] as? String) ?? "?"
    }()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = true
        contentMode = .redraw
        isUserInteractionEnabled = false
    }

    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ rect: CGRect) {
        let w = bounds.width, h = bounds.height

        // 背景
        let bg = UIBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), cornerRadius: 12)
        UIColor(red: 0.05, green: 0.06, blue: 0.10, alpha: 0.95).setFill()
        bg.fill()

        // 左侧状态色带
        let stripeColor: UIColor = {
            switch statusKind {
            case 1: return UIColor(red: 0.20, green: 0.60, blue: 1.0, alpha: 1)
            case 2: return UIColor(red: 0.15, green: 0.85, blue: 0.38, alpha: 1)
            case 3: return UIColor(red: 1.0, green: 0.30, blue: 0.25, alpha: 1)
            default: return UIColor(red: 0.45, green: 0.45, blue: 0.50, alpha: 1)
            }
        }()
        let stripe = UIBezierPath(roundedRect: CGRect(x: 0, y: 8, width: 4, height: h - 16), cornerRadius: 2)
        stripeColor.setFill()
        stripe.fill()

        // ---------- 右侧副信息（先算，才能给主文字留宽度）----------
        var subParts: [String] = []
        if hasMove {
            if !scoreText.isEmpty { subParts.append(scoreText) }
            if depth > 0 { subParts.append("深\(depth)") }
        }
        let subText = subParts.joined(separator: "  ")
        let subAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedDigitSystemFont(ofSize: max(10, h * 0.125), weight: .semibold),
            .foregroundColor: UIColor(red: 0.62, green: 0.82, blue: 1.0, alpha: 1)
        ]
        let subStr = subText as NSString
        let subSz = subStr.size(withAttributes: subAttrs)
        let subRight: CGFloat = 12
        var mainMaxW = w - 14 - subRight - (subSz.width > 0 ? subSz.width + 10 : 0)

        // ---------- 主文字：自动缩小以适应可用宽度 ----------
        let mainFull = moveText.isEmpty ? "—" : moveText
        var mainSize = h * 0.34
        var mainAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: mainSize, weight: .heavy),
            .foregroundColor: UIColor(red: 1.0, green: 0.93, blue: 0.42, alpha: 1)
        ]
        if !hasMove {
            mainAttrs[.foregroundColor] = UIColor(red: 0.82, green: 0.84, blue: 0.90, alpha: 1)
        }
        var mainStr = mainFull as NSString
        var mainSz = mainStr.size(withAttributes: mainAttrs)
        // 放不下就逐级缩字号，最小 13
        while mainSz.width > mainMaxW && mainSize > 13 {
            mainSize -= 1
            mainAttrs[.font] = UIFont.systemFont(ofSize: mainSize, weight: .heavy)
            mainSz = mainStr.size(withAttributes: mainAttrs)
        }
        // 还是超宽就截断
        if mainSz.width > mainMaxW {
            let cut = max(1, Int(mainMaxW / (mainSize * 0.95)))
            mainStr = (String(mainFull.prefix(cut)) + "…") as NSString
            mainSz = mainStr.size(withAttributes: mainAttrs)
        }
        let mainY: CGFloat = h * 0.10
        mainStr.draw(at: CGPoint(x: 14, y: mainY), withAttributes: mainAttrs)

        // 副信息画在同一行的右侧
        if subSz.width > 0 {
            subStr.draw(at: CGPoint(x: w - subSz.width - subRight, y: mainY + mainSz.height - subSz.height - 2),
                        withAttributes: subAttrs)
        }

        // ---------- 提示行（主文字下方，不重叠）----------
        let hintY = mainY + mainSz.height + 1
        if !hintText.isEmpty && hintY < h - 20 {
            let hintAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: max(9, h * 0.10), weight: .regular),
                .foregroundColor: UIColor(red: 0.60, green: 0.62, blue: 0.68, alpha: 1)
            ]
            var hintStr = hintText as NSString
            var hintSz = hintStr.size(withAttributes: hintAttrs)
            if hintSz.width > w - 26 {
                let cut = max(4, Int((w - 40) / (h * 0.10)))
                hintStr = (String(hintText.prefix(cut)) + "…") as NSString
                hintSz = hintStr.size(withAttributes: hintAttrs)
            }
            hintStr.draw(at: CGPoint(x: 14, y: hintY), withAttributes: hintAttrs)
        }

        // ---------- 胜率条 + 百分比（底部一行）----------
        let barY = h - 12
        let barH: CGFloat = 6
        let barX: CGFloat = 14
        let pctText = hasMove ? String(format: "%.0f%%", winrate) : ""
        let pctAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedDigitSystemFont(ofSize: max(9, h * 0.105), weight: .medium),
            .foregroundColor: UIColor(red: 0.85, green: 0.87, blue: 0.92, alpha: 1)
        ]
        let pctStr = pctText as NSString
        let pctSz = pctStr.size(withAttributes: pctAttrs)
        let barW = w - barX * 2 - (pctSz.width > 0 ? pctSz.width + 8 : 0)

        let track = UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: barW, height: barH),
                                 cornerRadius: barH / 2)
        UIColor(white: 0.24, alpha: 0.85).setFill()
        track.fill()

        let pct = CGFloat(max(0, min(100, winrate)) / 100)
        if pct > 0.02 && hasMove {
            let fill = UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: barW * pct, height: barH),
                                    cornerRadius: barH / 2)
            UIColor(red: 1.0, green: 0.32, blue: 0.26, alpha: 0.95).setFill()
            fill.fill()
        }
        if pctSz.width > 0 {
            pctStr.draw(at: CGPoint(x: w - pctSz.width - 12, y: barY - barH / 2 - 1),
                        withAttributes: pctAttrs)
        }

        // ---------- 构建标记（右下角小字）----------
        let tagAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedDigitSystemFont(ofSize: 7.5, weight: .regular),
            .foregroundColor: UIColor(red: 0.36, green: 0.38, blue: 0.44, alpha: 1)
        ]
        let tag = Self.buildTag as NSString
        let tagSz = tag.size(withAttributes: tagAttrs)
        // 放在胜率条上方右端，避免和百分比打架
        tag.draw(at: CGPoint(x: w - tagSz.width - 12, y: barY - barH / 2 - 1 - tagSz.height - 1),
                 withAttributes: tagAttrs)
    }
}
