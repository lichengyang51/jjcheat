//
//  BoardRenderView.swift
//  JJCheatApp —— 棋盘重绘 + 建议箭头
//
//  这个视图是画中画浮窗的内容。它不依赖录屏像素，
//  直接用引擎给出的 FEN 重绘棋盘，所以画质干净、箭头精确。
//

import UIKit

final class BoardRenderView: UIView {

    static let startFen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1"

    var fen: String = BoardRenderView.startFen { didSet { setNeedsDisplay() } }
    var suggestFrom: Int = -1 { didSet { setNeedsDisplay() } }
    var suggestTo: Int = -1 { didSet { setNeedsDisplay() } }
    var moveText: String = "" { didSet { setNeedsDisplay() } }
    var scoreText: String = "" { didSet { setNeedsDisplay() } }
    var winrate: Double = 50 { didSet { setNeedsDisplay() } }
    var depth: Int = 0 { didSet { setNeedsDisplay() } }

    private var board: [Character?] = Array(repeating: nil, count: 90)

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(red: 0.93, green: 0.84, blue: 0.66, alpha: 1)
        isOpaque = true
        contentMode = .redraw
        parseFen()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - FEN 解析

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

    // MARK: - 绘制

    private func metrics() -> (cell: CGFloat, ox: CGFloat, oy: CGFloat) {
        let pad: CGFloat = 10
        let w = bounds.width - pad * 2
        let h = bounds.height - pad * 2
        let cell = min(w / 8.0, h / 9.0)
        let ox = (bounds.width - cell * 8) / 2
        let oy = (bounds.height - cell * 9) / 2
        return (cell, ox, oy)
    }

    private func point(row: Int, col: Int, cell: CGFloat, ox: CGFloat, oy: CGFloat) -> CGPoint {
        CGPoint(x: ox + CGFloat(col) * cell, y: oy + CGFloat(row) * cell)
    }

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let (cell, ox, oy) = metrics()

        // 背景木纹
        ctx.setFillColor(UIColor(red: 0.93, green: 0.84, blue: 0.66, alpha: 1).cgColor)
        ctx.fill(bounds)

        // 棋格线
        ctx.setStrokeColor(UIColor(red: 0.36, green: 0.24, blue: 0.12, alpha: 0.9).cgColor)
        ctx.setLineWidth(max(0.8, cell * 0.02))
        for r in 0..<10 {
            ctx.move(to: point(row: r, col: 0, cell: cell, ox: ox, oy: oy))
            ctx.addLine(to: point(row: r, col: 8, cell: cell, ox: ox, oy: oy))
        }
        for c in 0..<9 {
            ctx.move(to: point(row: 0, col: c, cell: cell, ox: ox, oy: oy))
            ctx.addLine(to: point(row: 9, col: c, cell: cell, ox: ox, oy: oy))
        }
        ctx.strokePath()

        // 九宫斜线
        ctx.setLineWidth(max(0.8, cell * 0.018))
        ctx.move(to: point(row: 0, col: 3, cell: cell, ox: ox, oy: oy))
        ctx.addLine(to: point(row: 2, col: 5, cell: cell, ox: ox, oy: oy))
        ctx.move(to: point(row: 0, col: 5, cell: cell, ox: ox, oy: oy))
        ctx.addLine(to: point(row: 2, col: 3, cell: cell, ox: ox, oy: oy))
        ctx.move(to: point(row: 7, col: 3, cell: cell, ox: ox, oy: oy))
        ctx.addLine(to: point(row: 9, col: 5, cell: cell, ox: ox, oy: oy))
        ctx.move(to: point(row: 7, col: 5, cell: cell, ox: ox, oy: oy))
        ctx.addLine(to: point(row: 9, col: 3, cell: cell, ox: ox, oy: oy))
        ctx.strokePath()

        // 棋子
        let radius = cell * 0.42
        for sq in 0..<90 {
            guard let ch = board[sq] else { continue }
            let r = sq / 9, c = sq % 9
            let p = point(row: r, col: c, cell: cell, ox: ox, oy: oy)
            let isRed = ch.isUppercase
            let rect = CGRect(x: p.x - radius, y: p.y - radius, width: radius * 2, height: radius * 2)

            ctx.setFillColor(UIColor(red: 0.99, green: 0.96, blue: 0.88, alpha: 1).cgColor)
            ctx.fillEllipse(in: rect)
            ctx.setStrokeColor(UIColor(red: 0.45, green: 0.32, blue: 0.18, alpha: 1).cgColor)
            ctx.setLineWidth(max(0.8, cell * 0.02))
            ctx.strokeEllipse(in: rect.insetBy(dx: 0.6, dy: 0.6))

            let name = Self.chineseName(ch)
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: radius * 1.18, weight: .semibold),
                .foregroundColor: isRed
                    ? UIColor(red: 0.78, green: 0.10, blue: 0.10, alpha: 1)
                    : UIColor(red: 0.10, green: 0.10, blue: 0.12, alpha: 1)
            ]
            let size = (name as NSString).size(withAttributes: attrs)
            (name as NSString).draw(at: CGPoint(x: p.x - size.width / 2, y: p.y - size.height / 2),
                                    withAttributes: attrs)
        }

        // 建议箭头
        if suggestFrom >= 0 && suggestFrom < 90 && suggestTo >= 0 && suggestTo < 90 {
            let a = point(row: suggestFrom / 9, col: suggestFrom % 9, cell: cell, ox: ox, oy: oy)
            let b = point(row: suggestTo / 9, col: suggestTo % 9, cell: cell, ox: ox, oy: oy)
            drawArrow(ctx: ctx, from: a, to: b, cell: cell)
        }

        // 顶部信息条
        drawInfoBar(ctx: ctx)
    }

    private func drawArrow(ctx: CGContext, from a: CGPoint, to b: CGPoint, cell: CGFloat) {
        let dx = b.x - a.x, dy = b.y - a.y
        let len = hypot(dx, dy)
        guard len > cell * 0.2 else { return }
        let ang = atan2(dy, dx)
        let head = min(cell * 0.75, max(cell * 0.45, len * 0.32))
        let width = max(3.0, cell * 0.14)

        ctx.setLineCap(.round)
        // 外描边
        ctx.setStrokeColor(UIColor.black.withAlphaComponent(0.28).cgColor)
        ctx.setLineWidth(width + 4)
        ctx.move(to: a)
        ctx.addLine(to: CGPoint(x: b.x - cos(ang) * head * 0.85, y: b.y - sin(ang) * head * 0.85))
        ctx.strokePath()

        // 主线
        ctx.setStrokeColor(UIColor(red: 1.0, green: 0.18, blue: 0.18, alpha: 0.95).cgColor)
        ctx.setLineWidth(width)
        ctx.move(to: a)
        ctx.addLine(to: CGPoint(x: b.x - cos(ang) * head * 0.85, y: b.y - sin(ang) * head * 0.85))
        ctx.strokePath()

        // 箭头三角
        let p2 = CGPoint(x: b.x - cos(ang - 0.42) * head, y: b.y - sin(ang - 0.42) * head)
        let p3 = CGPoint(x: b.x - cos(ang + 0.42) * head, y: b.y - sin(ang + 0.42) * head)
        ctx.setFillColor(UIColor(red: 1.0, green: 0.12, blue: 0.12, alpha: 1).cgColor)
        ctx.move(to: b)
        ctx.addLine(to: p2)
        ctx.addLine(to: p3)
        ctx.closePath()
        ctx.fillPath()

        // 起点圈
        ctx.setStrokeColor(UIColor(red: 1.0, green: 0.2, blue: 0.2, alpha: 0.85).cgColor)
        ctx.setLineWidth(max(2.0, cell * 0.06))
        ctx.strokeEllipse(in: CGRect(x: a.x - cell * 0.42, y: a.y - cell * 0.42,
                                     width: cell * 0.84, height: cell * 0.84))
    }

    private func drawInfoBar(ctx: CGContext) {
        let barH = max(34.0, bounds.height * 0.085)
        let bar = CGRect(x: 0, y: 0, width: bounds.width, height: barH)
        ctx.setFillColor(UIColor(red: 0.04, green: 0.05, blue: 0.09, alpha: 0.94).cgColor)
        ctx.fill(bar)

        let main = moveText.isEmpty ? "等待走子…" : "\(moveText)   \(scoreText)"
        let sub = String(format: "胜率 %.1f%%   深度 %d", winrate, depth)

        let mainAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.boldSystemFont(ofSize: barH * 0.46),
            .foregroundColor: UIColor(red: 1.0, green: 0.94, blue: 0.55, alpha: 1)
        ]
        let subAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedDigitSystemFont(ofSize: barH * 0.32, weight: .medium),
            .foregroundColor: UIColor(red: 0.70, green: 0.85, blue: 1.0, alpha: 1)
        ]
        (main as NSString).draw(at: CGPoint(x: 8, y: barH * 0.10), withAttributes: mainAttrs)
        (sub as NSString).draw(at: CGPoint(x: 8, y: barH * 0.55), withAttributes: subAttrs)
    }

    // MARK: - 棋子名

    static func chineseName(_ ch: Character) -> String {
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
