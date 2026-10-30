//
//  FloatingPanelView.swift
//  JJCheatApp —— 画中画浮窗的内容（跟鹏飞象棋那个小窗一个意思）
//
//  左边：按识别结果重绘的小棋盘 + 蓝色着法箭头
//  右边：着法大字、评分/胜率/深度、你执红还是执黑、提示行
//
//  ★ 外面那圈洋红边框是有用途的，不要改颜色 ★
//     浮窗会被一起截进截图里，引擎靠这圈 (255,0,255) 精确算出它盖住了哪几格，
//     那几格整格作废（保留上一帧的值）。棋盘、棋子、JJ象棋界面上都没有这种颜色，
//     所以认出来就是 100% 确定，不会像以前「按米黄色猜」那样把半盘抹掉。
//

import UIKit

final class FloatingPanelView: UIView {

    /// 洋红边框宽度（会被截图缩放，别小于 5）
    static let borderWidth: CGFloat = 6

    private var board: [Character?] = Array(repeating: nil, count: 90)
    private var moveText: String = ""
    private var scoreText: String = ""
    private var winrate: Double = 50
    private var depth: Int = 0
    private var sideText: String = ""
    private var hintText: String = ""
    private var arrowFrom: Int = -1
    private var arrowTo: Int = -1

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = true
        contentMode = .redraw
        isUserInteractionEnabled = false
    }
    required init?(coder: NSCoder) { fatalError() }

    /// 一次性推入全部要显示的东西
    func apply(fen: String,
               moveChinese: String,
               fromSq: Int,
               toSq: Int,
               scoreText: String,
               winrate: Double,
               depth: Int,
               sideText: String,
               hint: String) {
        board = Self.parseFen(fen)
        moveText = moveChinese
        arrowFrom = fromSq
        arrowTo = toSq
        self.scoreText = scoreText
        self.winrate = winrate
        self.depth = depth
        self.sideText = sideText
        hintText = hint
        setNeedsDisplay()
    }

    static func parseFen(_ fen: String) -> [Character?] {
        var b: [Character?] = Array(repeating: nil, count: 90)
        guard let layout = fen.split(separator: " ").first else { return b }
        let rows = layout.split(separator: "/", omittingEmptySubsequences: false)
        guard rows.count == 10 else { return b }
        for r in 0..<10 {
            var c = 0
            for ch in rows[r] {
                if let d = ch.wholeNumberValue, d >= 1, d <= 9 {
                    c += d
                } else {
                    if c < 9 { b[r * 9 + c] = ch }
                    c += 1
                }
            }
        }
        return b
    }

    private static func cn(_ ch: Character) -> String {
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

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let bw = Self.borderWidth

        // ---- 洋红边框（引擎靠它定位，别动）----
        UIColor(red: 1, green: 0, blue: 1, alpha: 1).setFill()
        UIRectFill(bounds)
        UIColor(red: 0.06, green: 0.07, blue: 0.10, alpha: 1).setFill()
        UIRectFill(bounds.insetBy(dx: bw, dy: bw))

        let inner = bounds.insetBy(dx: bw + 4, dy: bw + 4)

        // ---- 棋盘区（左边，approx 9:10 比例）----
        let boardW = min(inner.width * 0.46, inner.height * 8.0 / 9.0)
        let cell = boardW / 8.0
        let boardH = cell * 9.0
        let ox = inner.minX + 2
        let oy = inner.minY + (inner.height - boardH) / 2

        // 木色底
        UIColor(red: 0.90, green: 0.81, blue: 0.62, alpha: 1).setFill()
        UIBezierPath(roundedRect: CGRect(x: ox - cell * 0.4, y: oy - cell * 0.4,
                                        width: boardW + cell * 0.8, height: boardH + cell * 0.8),
                     cornerRadius: cell * 0.25).fill()

        // 网格
        ctx.setStrokeColor(UIColor(red: 0.35, green: 0.23, blue: 0.11, alpha: 0.85).cgColor)
        ctx.setLineWidth(max(0.7, cell * 0.035))
        for r in 0..<10 {
            ctx.move(to: CGPoint(x: ox, y: oy + CGFloat(r) * cell))
            ctx.addLine(to: CGPoint(x: ox + boardW, y: oy + CGFloat(r) * cell))
        }
        for c in 0..<9 {
            ctx.move(to: CGPoint(x: ox + CGFloat(c) * cell, y: oy))
            ctx.addLine(to: CGPoint(x: ox + CGFloat(c) * cell, y: oy + boardH))
        }
        ctx.strokePath()
        // 九宫
        ctx.setLineWidth(max(0.7, cell * 0.03))
        for (r0, c0, r1, c1) in [(0, 3, 2, 5), (7, 3, 9, 5)] {
            ctx.move(to: CGPoint(x: ox + CGFloat(c0) * cell, y: oy + CGFloat(r0) * cell))
            ctx.addLine(to: CGPoint(x: ox + CGFloat(c1) * cell, y: oy + CGFloat(r1) * cell))
            ctx.move(to: CGPoint(x: ox + CGFloat(c1) * cell, y: oy + CGFloat(r0) * cell))
            ctx.addLine(to: CGPoint(x: ox + CGFloat(c0) * cell, y: oy + CGFloat(r1) * cell))
        }
        ctx.strokePath()

        // 棋子
        let rad = cell * 0.42
        for sq in 0..<90 {
            guard let ch = board[sq] else { continue }
            let r = sq / 9, c = sq % 9
            let p = CGPoint(x: ox + CGFloat(c) * cell, y: oy + CGFloat(r) * cell)
            let disc = CGRect(x: p.x - rad, y: p.y - rad, width: rad * 2, height: rad * 2)
            UIColor(red: 0.99, green: 0.96, blue: 0.86, alpha: 1).setFill()
            UIBezierPath(ovalIn: disc).fill()
            UIColor(red: 0.45, green: 0.32, blue: 0.18, alpha: 1).setStroke()
            let ring = UIBezierPath(ovalIn: disc.insetBy(dx: 0.5, dy: 0.5))
            ring.lineWidth = max(0.6, cell * 0.03)
            ring.stroke()
            let isRed = ch.isUppercase
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: rad * 1.25, weight: .bold),
                .foregroundColor: isRed
                    ? UIColor(red: 0.78, green: 0.08, blue: 0.08, alpha: 1)
                    : UIColor(red: 0.08, green: 0.08, blue: 0.10, alpha: 1)
            ]
            let s = Self.cn(ch) as NSString
            let sz = s.size(withAttributes: attrs)
            s.draw(at: CGPoint(x: p.x - sz.width / 2, y: p.y - sz.height / 2), withAttributes: attrs)
        }

        // ---- 蓝色着法箭头 ----
        if arrowFrom >= 0 && arrowTo >= 0 {
            let r0 = arrowFrom / 9, c0 = arrowFrom % 9
            let r1 = arrowTo / 9, c1 = arrowTo % 9
            let p0 = CGPoint(x: ox + CGFloat(c0) * cell, y: oy + CGFloat(r0) * cell)
            let p1 = CGPoint(x: ox + CGFloat(c1) * cell, y: oy + CGFloat(r1) * cell)
            let blue = UIColor(red: 0.25, green: 0.45, blue: 1.0, alpha: 0.95)
            blue.setStroke()
            blue.setFill()
            let path = UIBezierPath()
            path.lineWidth = max(2.0, cell * 0.13)
            path.lineCapStyle = .round
            path.move(to: p0)
            path.addLine(to: p1)
            path.stroke()
            let ang = atan2(p1.y - p0.y, p1.x - p0.x)
            let head = max(4.0, cell * 0.34)
            let tri = UIBezierPath()
            tri.move(to: p1)
            tri.addLine(to: CGPoint(x: p1.x - head * cos(ang - 0.42), y: p1.y - head * sin(ang - 0.42)))
            tri.addLine(to: CGPoint(x: p1.x - head * cos(ang + 0.42), y: p1.y - head * sin(ang + 0.42)))
            tri.close()
            tri.fill()
        }

        // ---- 右边文字区 ----
        let tx = ox + boardW + cell * 1.2
        let tw = inner.maxX - tx
        var y = inner.minY + 2

        let moveFull = moveText.isEmpty ? "—" : moveText
        var moveSize = min(inner.height * 0.30, 56)
        var moveAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: moveSize, weight: .heavy),
            .foregroundColor: UIColor(red: 1.0, green: 0.92, blue: 0.35, alpha: 1)
        ]
        var ms = (moveFull as NSString).size(withAttributes: moveAttrs)
        while ms.width > tw && moveSize > 12 {
            moveSize -= 1
            moveAttrs[.font] = UIFont.systemFont(ofSize: moveSize, weight: .heavy)
            ms = (moveFull as NSString).size(withAttributes: moveAttrs)
        }
        (moveFull as NSString).draw(at: CGPoint(x: tx + max(0, (tw - ms.width) / 2), y: y),
                                    withAttributes: moveAttrs)
        y += ms.height + 2

        // 评分 + 胜率 + 深度
        let subParts = [scoreText, String(format: "%.0f%%", winrate), depth > 0 ? "深\(depth)" : ""]
            .filter { !$0.isEmpty }
        if !subParts.isEmpty {
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedDigitSystemFont(ofSize: max(11, inner.height * 0.075), weight: .semibold),
                .foregroundColor: UIColor(red: 0.60, green: 0.82, blue: 1.0, alpha: 1)
            ]
            let s = subParts.joined(separator: "  ") as NSString
            let sz = s.size(withAttributes: attrs)
            s.draw(at: CGPoint(x: tx + max(0, (tw - sz.width) / 2), y: y), withAttributes: attrs)
            y += sz.height + 2
        }

        // 你执红 / 你执黑
        if !sideText.isEmpty {
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: max(11, inner.height * 0.072), weight: .semibold),
                .foregroundColor: UIColor(red: 0.85, green: 0.88, blue: 0.95, alpha: 1)
            ]
            let s = sideText as NSString
            let sz = s.size(withAttributes: attrs)
            s.draw(at: CGPoint(x: tx + max(0, (tw - sz.width) / 2), y: y), withAttributes: attrs)
            y += sz.height + 2
        }

        // 提示行（例如「浮窗挡住 3 格，往边上拖」）
        if !hintText.isEmpty {
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: max(10, inner.height * 0.062), weight: .regular),
                .foregroundColor: UIColor(red: 0.98, green: 0.62, blue: 0.28, alpha: 1)
            ]
            var s = hintText as NSString
            var sz = s.size(withAttributes: attrs)
            while sz.width > tw && s.length > 5 {
                s = (String(s.substring(to: s.length - 2)) + "…") as NSString
                sz = s.size(withAttributes: attrs)
            }
            s.draw(at: CGPoint(x: tx + max(0, (tw - sz.width) / 2), y: y), withAttributes: attrs)
        }
    }
}
