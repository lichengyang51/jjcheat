//
//  FloatingPanelView.swift
//  JJCheatApp —— 画中画浮窗内容
//
//  版式照鹏飞 iOS 那个小窗（视频 0:26 / 0:31 两帧）：
//    左边约 1/3：小棋盘（木纹底、楚河汉界、红黑圆子白字、蓝色着法箭头）
//    右边约 2/3：浅蓝白底，左边距对齐的大字着法，正常状态只有一行
//                「库: 兵七进一」/「引擎: 卒1进1」
//    左下角：一个「菜单」小戳；左上角的叉和右上角的图标是系统画中画自带的
//    还没识别出局面时，右边显示那四行提示：
//                「单击可以隐藏关闭按钮」「双指按住操作可以缩放悬浮框」
//                「正在识别」「注意不要遮挡被连线棋盘」
//
//  ★ 外面那圈洋红边框别动 ★
//     浮窗会被录屏/截图一起拍进去，引擎靠这圈 (255,0,255) 算出它盖住了哪几格，
//     那几格整格作废（保留上一帧的值）。棋盘上没有这种颜色，所以认出即确定。
//

import UIKit

final class FloatingPanelView: UIView {

    static let borderWidth: CGFloat = 5

    private var board: [Character?] = Array(repeating: nil, count: 90)
    private var moveText: String = ""
    private var busyText: String = "正在识别"
    private var warnText: String = "注意不要遮挡被连线棋盘"
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

    func apply(fen: String, moveChinese: String, fromSq: Int, toSq: Int, redAtBottom: Bool, hint: String) {
        board = Self.parseFen(fen)
        moveText = moveChinese
        arrowFrom = fromSq
        arrowTo = toSq
        if !hint.isEmpty { warnText = hint }
        setNeedsDisplay()
    }

    /// 还没识别出局面时用这个状态（鹏飞那个「正在识别」的样子）
    func showWaiting(_ text: String) {
        moveText = ""
        busyText = text.isEmpty ? "正在识别" : text
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

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let bw = Self.borderWidth

        // 洋红边框（引擎定位用，别动）
        UIColor(red: 1, green: 0, blue: 1, alpha: 1).setFill()
        UIRectFill(bounds)

        let inner = bounds.insetBy(dx: bw, dy: bw)

        // 左边：小棋盘
        let boardW = inner.width * 0.335
        let boardRect = CGRect(x: inner.minX, y: inner.minY, width: boardW, height: inner.height)
        drawBoard(in: boardRect, ctx: ctx)

        // 右边：鹏飞那种浅蓝白文字区
        let textRect = CGRect(x: boardRect.maxX, y: inner.minY,
                              width: inner.maxX - boardRect.maxX, height: inner.height)
        UIColor(red: 0.929, green: 0.945, blue: 0.973, alpha: 1).setFill()
        UIRectFill(textRect)

        if moveText.isEmpty {
            drawWaiting(in: textRect)
        } else {
            drawMove(in: textRect)
        }

        // 左下角「菜单」小戳（鹏飞也有一个）
        let menuW = boardW * 0.34, menuH = inner.height * 0.14
        let menuRect = CGRect(x: inner.minX + boardW * 0.03,
                              y: inner.maxY - menuH - inner.height * 0.03,
                              width: menuW, height: menuH)
        UIColor(red: 0.62, green: 0.62, blue: 0.64, alpha: 0.85).setFill()
        UIBezierPath(roundedRect: menuRect, cornerRadius: menuH * 0.22).fill()
        let menuAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: menuH * 0.62, weight: .medium),
            .foregroundColor: UIColor.white
        ]
        let ms = "菜单" as NSString
        let msz = ms.size(withAttributes: menuAttrs)
        ms.draw(at: CGPoint(x: menuRect.midX - msz.width / 2, y: menuRect.midY - msz.height / 2),
                withAttributes: menuAttrs)
    }

    // MARK: - 小棋盘

    private func drawBoard(in r: CGRect, ctx: CGContext) {
        UIColor(red: 0.902, green: 0.847, blue: 0.706, alpha: 1).setFill()
        UIRectFill(r)

        let cell = min(r.width * 0.94 / 8.0, r.height * 0.86 / 9.0)
        let ox = r.minX + (r.width - cell * 8) / 2
        let oy = r.minY + (r.height - cell * 9) / 2

        func pt(_ rr: Int, _ cc: Int) -> CGPoint {
            CGPoint(x: ox + CGFloat(cc) * cell, y: oy + CGFloat(rr) * cell)
        }

        ctx.setStrokeColor(UIColor(red: 0.42, green: 0.30, blue: 0.16, alpha: 0.75).cgColor)
        ctx.setLineWidth(max(0.5, cell * 0.045))
        for rr in 0..<10 {
            ctx.move(to: pt(rr, 0)); ctx.addLine(to: pt(rr, 8))
        }
        for cc in 0..<9 {
            ctx.move(to: pt(0, cc)); ctx.addLine(to: pt(9, cc))
        }
        ctx.strokePath()
        for (r0, c0, r1, c1) in [(0, 3, 2, 5), (7, 3, 9, 5)] {
            ctx.move(to: pt(r0, c0)); ctx.addLine(to: pt(r1, c1))
            ctx.move(to: pt(r0, c1)); ctx.addLine(to: pt(r1, c0))
        }
        ctx.strokePath()

        // 楚河 汉界
        let riverAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: max(4, cell * 0.40), weight: .regular),
            .foregroundColor: UIColor(red: 0.45, green: 0.33, blue: 0.18, alpha: 0.75)
        ]
        let cy = oy + cell * 4.5
        ("楚河" as NSString).draw(at: CGPoint(x: ox + cell * 1.0, y: cy - cell * 0.26), withAttributes: riverAttrs)
        ("汉界" as NSString).draw(at: CGPoint(x: ox + cell * 5.2, y: cy - cell * 0.26), withAttributes: riverAttrs)

        // 棋子：红子红盘、黑子黑盘、字白（跟鹏飞小窗一样）
        let rad = cell * 0.40
        for sq in 0..<90 {
            guard let ch = board[sq] else { continue }
            let rr = sq / 9, cc = sq % 9
            let p = pt(rr, cc)
            let disc = CGRect(x: p.x - rad, y: p.y - rad, width: rad * 2, height: rad * 2)
            (ch.isUppercase ? UIColor(red: 0.72, green: 0.16, blue: 0.13, alpha: 1)
                            : UIColor(red: 0.18, green: 0.18, blue: 0.20, alpha: 1)).setFill()
            UIBezierPath(ovalIn: disc).fill()
            UIColor(white: 1.0, alpha: 0.5).setStroke()
            let ring = UIBezierPath(ovalIn: disc.insetBy(dx: 0.4, dy: 0.4))
            ring.lineWidth = max(0.4, cell * 0.03)
            ring.stroke()
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: rad * 1.30, weight: .bold),
                .foregroundColor: UIColor.white
            ]
            let s = Self.cn(ch) as NSString
            let sz = s.size(withAttributes: attrs)
            s.draw(at: CGPoint(x: p.x - sz.width / 2, y: p.y - sz.height / 2), withAttributes: attrs)
        }

        // 蓝色着法箭头
        if arrowFrom >= 0 && arrowTo >= 0 {
            let p0 = pt(arrowFrom / 9, arrowFrom % 9)
            let p1 = pt(arrowTo / 9, arrowTo % 9)
            let blue = UIColor(red: 0.23, green: 0.42, blue: 0.92, alpha: 0.95)
            blue.setStroke(); blue.setFill()
            let path = UIBezierPath()
            path.lineWidth = max(1.6, cell * 0.16)
            path.lineCapStyle = .round
            path.move(to: p0)
            path.addLine(to: p1)
            path.stroke()
            let ang = atan2(p1.y - p0.y, p1.x - p0.x)
            let head = max(3.5, cell * 0.42)
            let tri = UIBezierPath()
            tri.move(to: p1)
            tri.addLine(to: CGPoint(x: p1.x - head * cos(ang - 0.40), y: p1.y - head * sin(ang - 0.40)))
            tri.addLine(to: CGPoint(x: p1.x - head * cos(ang + 0.40), y: p1.y - head * sin(ang + 0.40)))
            tri.close()
            tri.fill()
        }
    }

    // MARK: - 右边文字

    /// 正常状态：一行大字着法（鹏飞：「库: 兵七进一」）
    private func drawMove(in r: CGRect) {
        let padX = r.width * 0.05
        let availW = r.width - padX * 2
        var size = min(r.height * 0.34, 52)
        var attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: size, weight: .regular),
            .foregroundColor: UIColor(red: 0.22, green: 0.28, blue: 0.40, alpha: 1)
        ]
        let s = moveText as NSString
        var sz = s.size(withAttributes: attrs)
        while sz.width > availW && size > 10 {
            size -= 1
            attrs[.font] = UIFont.systemFont(ofSize: size, weight: .regular)
            sz = s.size(withAttributes: attrs)
        }
        // 还放不下就折两行 —— 宁可折行也不截断（用户就是被截断气到的）
        if sz.width > availW && s.length >= 4 {
            let chars = Array(moveText)
            let half = (chars.count + 1) / 2
            let l1 = String(chars[0..<half]) as NSString
            let l2 = String(chars[half...]) as NSString
            var fs = size
            var a = attrs
            var w1 = l1.size(withAttributes: a).width
            var w2 = l2.size(withAttributes: a).width
            while max(w1, w2) > availW && fs > 10 {
                fs -= 1
                a[.font] = UIFont.systemFont(ofSize: fs, weight: .regular)
                w1 = l1.size(withAttributes: a).width
                w2 = l2.size(withAttributes: a).width
            }
            _ = (w1, w2)
            let lh = l1.size(withAttributes: a).height
            let y0 = r.midY - lh
            l1.draw(at: CGPoint(x: r.minX + padX, y: y0), withAttributes: a)
            l2.draw(at: CGPoint(x: r.minX + padX, y: y0 + lh * 0.98), withAttributes: a)
            return
        }
        s.draw(at: CGPoint(x: r.minX + padX, y: r.midY - sz.height / 2), withAttributes: attrs)
    }

    /// 等待/提示状态：鹏飞那四行
    private func drawWaiting(in r: CGRect) {
        let padX = r.width * 0.05
        let availW = r.width - padX * 2
        var y = r.minY + r.height * 0.05

        func line(_ text: String, size: CGFloat, color: UIColor) {
            var fs = size
            var attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: fs, weight: .regular),
                .foregroundColor: color
            ]
            let s = text as NSString
            var sz = s.size(withAttributes: attrs)
            while sz.width > availW && fs > 6 {
                fs -= 0.5
                attrs[.font] = UIFont.systemFont(ofSize: fs, weight: .regular)
                sz = s.size(withAttributes: attrs)
            }
            s.draw(at: CGPoint(x: r.minX + padX, y: y), withAttributes: attrs)
            y += sz.height + r.height * 0.02
        }

        let h = r.height
        guard h > 90 else {
            line(busyText, size: h * 0.20, color: UIColor(red: 0.18, green: 0.44, blue: 0.88, alpha: 1))
            return
        }
        line("单击可以隐藏关闭按钮", size: h * 0.085, color: UIColor(red: 0.49, green: 0.53, blue: 0.60, alpha: 1))
        line("双指按住操作可以缩放悬浮窗", size: h * 0.085, color: UIColor(red: 0.49, green: 0.53, blue: 0.60, alpha: 1))
        y += h * 0.06
        line(busyText, size: h * 0.16, color: UIColor(red: 0.16, green: 0.42, blue: 0.88, alpha: 1))
        line(warnText, size: h * 0.10, color: UIColor(red: 0.20, green: 0.46, blue: 0.90, alpha: 1))
    }
}
