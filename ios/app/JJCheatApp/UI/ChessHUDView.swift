//
//  ChessHUDView.swift
//  JJCheatApp —— 画中画浮窗内容（文字条 + 实时棋盘）
//
//  上半部分是着法/分数/胜率，下半部分是按识别结果实时重绘的棋盘。
//  这样用户拿真实棋盘和浮窗棋盘一对比，就能立刻看出程序有没有识别错。
//

import UIKit

/* ============================================================
 *  纯棋盘渲染（不含任何信息条）
 * ============================================================ */
final class BoardGridView: UIView {

    var fen: String = "" { didSet { parseFen(); setNeedsDisplay() } }
    private var board: [Character?] = Array(repeating: nil, count: 90)

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(red: 0.93, green: 0.84, blue: 0.66, alpha: 1)
        isOpaque = true
        contentMode = .redraw
        isUserInteractionEnabled = false
    }
    required init?(coder: NSCoder) { fatalError() }

    private func parseFen() {
        board = Array(repeating: nil, count: 90)
        let parts = fen.split(separator: " ")
        guard let layout = parts.first else { return }
        let rows = layout.split(separator: "/", omittingEmptySubsequences: false)
        guard rows.count == 10 else { return }
        for r in 0..<10 {
            var c = 0
            for ch in rows[r] {
                if let d = ch.wholeNumberValue, d >= 1, d <= 9 {
                    c += d
                } else {
                    if c < 9 { board[r * 9 + c] = ch }
                    c += 1
                }
            }
        }
        setNeedsDisplay()
    }

    private func metrics() -> (cell: CGFloat, ox: CGFloat, oy: CGFloat) {
        let pad: CGFloat = 6
        let w = bounds.width - pad * 2
        let h = bounds.height - pad * 2
        let cell = min(w / 8.0, h / 9.0)
        let ox = (bounds.width - cell * 8) / 2
        let oy = (bounds.height - cell * 9) / 2
        return (cell, ox, oy)
    }

    private func pt(_ row: Int, _ col: Int, _ cell: CGFloat, _ ox: CGFloat, _ oy: CGFloat) -> CGPoint {
        CGPoint(x: ox + CGFloat(col) * cell, y: oy + CGFloat(row) * cell)
    }

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let (cell, ox, oy) = metrics()

        ctx.setFillColor(UIColor(red: 0.93, green: 0.84, blue: 0.66, alpha: 1).cgColor)
        ctx.fill(bounds)

        // 网格线
        ctx.setStrokeColor(UIColor(red: 0.36, green: 0.24, blue: 0.12, alpha: 0.9).cgColor)
        ctx.setLineWidth(max(0.6, cell * 0.025))
        for r in 0..<10 {
            ctx.move(to: pt(r, 0, cell, ox, oy))
            ctx.addLine(to: pt(r, 8, cell, ox, oy))
        }
        for c in 0..<9 {
            ctx.move(to: pt(0, c, cell, ox, oy))
            ctx.addLine(to: pt(9, c, cell, ox, oy))
        }
        ctx.strokePath()

        // 九宫斜线
        ctx.setLineWidth(max(0.6, cell * 0.02))
        ctx.move(to: pt(0, 3, cell, ox, oy)); ctx.addLine(to: pt(2, 5, cell, ox, oy))
        ctx.move(to: pt(0, 5, cell, ox, oy)); ctx.addLine(to: pt(2, 3, cell, ox, oy))
        ctx.move(to: pt(7, 3, cell, ox, oy)); ctx.addLine(to: pt(9, 5, cell, ox, oy))
        ctx.move(to: pt(7, 5, cell, ox, oy)); ctx.addLine(to: pt(9, 3, cell, ox, oy))
        ctx.strokePath()

        // 棋子
        let radius = cell * 0.44
        for sq in 0..<90 {
            guard let ch = board[sq] else { continue }
            let r = sq / 9, c = sq % 9
            let p = pt(r, c, cell, ox, oy)
            let isRed = ch.isUppercase
            let rect = CGRect(x: p.x - radius, y: p.y - radius, width: radius * 2, height: radius * 2)

            ctx.setFillColor(UIColor(red: 0.99, green: 0.96, blue: 0.87, alpha: 1).cgColor)
            ctx.fillEllipse(in: rect)
            ctx.setStrokeColor(UIColor(red: 0.45, green: 0.32, blue: 0.18, alpha: 1).cgColor)
            ctx.setLineWidth(max(0.5, cell * 0.022))
            ctx.strokeEllipse(in: rect.insetBy(dx: 0.4, dy: 0.4))

            let name = Self.cn(ch)
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: radius * 1.20, weight: .bold),
                .foregroundColor: isRed
                    ? UIColor(red: 0.80, green: 0.08, blue: 0.08, alpha: 1)
                    : UIColor(red: 0.08, green: 0.08, blue: 0.10, alpha: 1)
            ]
            let sz = (name as NSString).size(withAttributes: attrs)
            (name as NSString).draw(at: CGPoint(x: p.x - sz.width / 2, y: p.y - sz.height / 2),
                                    withAttributes: attrs)
        }
    }

    static func cn(_ ch: Character) -> String {
        switch ch {
        case "K": return "帅"; case "A": return "仕"; case "B": return "相"
        case "N": return "马"; case "R": return "车"; case "C": return "炮"
        case "P": return "兵"
        case "k": return "将"; case "a": return "士"; case "b": return "象"
        case "n": return "马"; case "r": return "车"; case "c": return "炮"
        case "p": return "卒"
        default: return ""
        }
    }
}

/* ============================================================
 *  顶部信息条
 * ============================================================ */
final class HUDTextView: UIView {

    var moveText: String = "" { didSet { setNeedsDisplay() } }
    var scoreText: String = "" { didSet { setNeedsDisplay() } }
    var winrate: Double = 50 { didSet { setNeedsDisplay() } }
    var depth: Int = 0 { didSet { setNeedsDisplay() } }
    var sideText: String = "" { didSet { setNeedsDisplay() } }
    var hintText: String = "" { didSet { setNeedsDisplay() } }
    var hasMove: Bool = false { didSet { setNeedsDisplay() } }
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

        UIColor(red: 0.05, green: 0.06, blue: 0.10, alpha: 1).setFill()
        UIRectFill(bounds)

        // 左侧状态色带
        let stripeColor: UIColor = {
            switch statusKind {
            case 1: return UIColor(red: 0.20, green: 0.60, blue: 1.0, alpha: 1)
            case 2: return UIColor(red: 0.15, green: 0.85, blue: 0.38, alpha: 1)
            case 3: return UIColor(red: 1.0, green: 0.30, blue: 0.25, alpha: 1)
            default: return UIColor(red: 0.45, green: 0.45, blue: 0.50, alpha: 1)
            }
        }()
        stripeColor.setFill()
        UIRectFill(CGRect(x: 0, y: 4, width: 4, height: h - 8))

        // 副信息（右上）
        var subParts: [String] = []
        if hasMove {
            if !scoreText.isEmpty { subParts.append(scoreText) }
            if depth > 0 { subParts.append("深\(depth)") }
        }
        let subAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedDigitSystemFont(ofSize: max(9, h * 0.20), weight: .semibold),
            .foregroundColor: UIColor(red: 0.62, green: 0.82, blue: 1.0, alpha: 1)
        ]
        let subStr = subParts.joined(separator: " ") as NSString
        let subSz = subStr.size(withAttributes: subAttrs)
        let mainMaxW = w - 14 - 10 - (subSz.width > 0 ? subSz.width + 8 : 0)

        // 主文字（自适应）
        let mainFull = moveText.isEmpty ? "—" : moveText
        var mainSize = h * 0.46
        var mainAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: mainSize, weight: .heavy),
            .foregroundColor: UIColor(red: 1.0, green: 0.93, blue: 0.42, alpha: 1)
        ]
        if !hasMove {
            mainAttrs[.foregroundColor] = UIColor(red: 0.82, green: 0.84, blue: 0.90, alpha: 1)
        }
        var mainStr = mainFull as NSString
        var mainSz = mainStr.size(withAttributes: mainAttrs)
        while mainSz.width > mainMaxW && mainSize > 12 {
            mainSize -= 1
            mainAttrs[.font] = UIFont.systemFont(ofSize: mainSize, weight: .heavy)
            mainSz = mainStr.size(withAttributes: mainAttrs)
        }
        if mainSz.width > mainMaxW {
            let cut = max(1, Int(mainMaxW / (mainSize * 0.95)))
            mainStr = (String(mainFull.prefix(cut)) + "…") as NSString
            mainSz = mainStr.size(withAttributes: mainAttrs)
        }
        let mainY = h * 0.18
        mainStr.draw(at: CGPoint(x: 12, y: mainY), withAttributes: mainAttrs)

        if subSz.width > 0 {
            subStr.draw(at: CGPoint(x: w - subSz.width - 10, y: mainY + mainSz.height - subSz.height - 1),
                        withAttributes: subAttrs)
        }

        // 提示行
        if !hintText.isEmpty {
            let hintAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: max(8.5, h * 0.15), weight: .regular),
                .foregroundColor: UIColor(red: 0.60, green: 0.62, blue: 0.68, alpha: 1)
            ]
            var hintStr = hintText as NSString
            var hintSz = hintStr.size(withAttributes: hintAttrs)
            if hintSz.width > w - 22 {
                let cut = max(4, Int((w - 34) / (h * 0.15)))
                hintStr = (String(hintText.prefix(cut)) + "…") as NSString
                hintSz = hintStr.size(withAttributes: hintAttrs)
            }
            hintStr.draw(at: CGPoint(x: 12, y: mainY + mainSz.height + 1), withAttributes: hintAttrs)
        }

        // 胜率条
        let barY = h - 9
        let barH: CGFloat = 5
        let barX: CGFloat = 12
        let pctText = hasMove ? String(format: "%.0f%%", winrate) : ""
        let pctAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedDigitSystemFont(ofSize: max(8.5, h * 0.15), weight: .medium),
            .foregroundColor: UIColor(red: 0.85, green: 0.87, blue: 0.92, alpha: 1)
        ]
        let pctStr = pctText as NSString
        let pctSz = pctStr.size(withAttributes: pctAttrs)
        let barW = w - barX * 2 - (pctSz.width > 0 ? pctSz.width + 6 : 0)

        UIColor(white: 0.24, alpha: 0.9).setFill()
        UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: barW, height: barH),
                     cornerRadius: barH / 2).fill()

        let pct = CGFloat(max(0, min(100, winrate)) / 100)
        if pct > 0.02 && hasMove {
            UIColor(red: 1.0, green: 0.32, blue: 0.26, alpha: 0.95).setFill()
            UIBezierPath(roundedRect: CGRect(x: barX, y: barY, width: barW * pct, height: barH),
                         cornerRadius: barH / 2).fill()
        }
        if pctSz.width > 0 {
            pctStr.draw(at: CGPoint(x: w - pctSz.width - 10, y: barY - barH / 2),
                        withAttributes: pctAttrs)
        }

        // 构建标记
        let tagAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedDigitSystemFont(ofSize: 7, weight: .regular),
            .foregroundColor: UIColor(red: 0.36, green: 0.38, blue: 0.44, alpha: 1)
        ]
        let tag = Self.buildTag as NSString
        let tagSz = tag.size(withAttributes: tagAttrs)
        tag.draw(at: CGPoint(x: w - tagSz.width - 10, y: barY - barH / 2 - tagSz.height - 1),
                 withAttributes: tagAttrs)
    }
}

/* ============================================================
 *  组合视图：文字条 + 棋盘
 * ============================================================ */
final class ChessHUDView: UIView {

    let textView = HUDTextView(frame: .zero)
    let boardView = BoardGridView(frame: .zero)

    /// 文字条高度
    static let textHeight: CGFloat = 62

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(red: 0.05, green: 0.06, blue: 0.10, alpha: 1)
        isUserInteractionEnabled = false
        addSubview(textView)
        addSubview(boardView)
    }
    required init?(coder: NSCoder) { fatalError() }

    override func layoutSubviews() {
        super.layoutSubviews()
        let th = Self.textHeight
        textView.frame = CGRect(x: 0, y: 0, width: bounds.width, height: th)
        boardView.frame = CGRect(x: 0, y: th, width: bounds.width, height: bounds.height - th)
    }

    func apply(moveText: String, scoreText: String, winrate: Double, depth: Int,
               sideText: String, hintText: String, hasMove: Bool,
               statusKind: Int, fen: String) {
        textView.moveText = moveText
        textView.scoreText = scoreText
        textView.winrate = winrate
        textView.depth = depth
        textView.sideText = sideText
        textView.hintText = hintText
        textView.hasMove = hasMove
        textView.statusKind = statusKind
        boardView.fen = fen
    }
}
