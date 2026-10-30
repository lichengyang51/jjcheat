//
//  FloatingPanelView.swift
//  JJCheatApp —— 画中画浮窗内容
//
//  版式照鹏飞 iOS 那个小窗（视频抽帧 26 秒那一帧最清楚）：
//
//   ┌─────────────┬──────────────────────────────┐
//   │             │ 深度: 26                      │
//   │  小棋盘      │ 3.3秒                         │
//   │  木纹 +      │ 分数: 870          ← 亮蓝、更大 │
//   │  楚河汉界    │ 炮二平五 炮8平5 马二进三        │
//   │  + 蓝箭头    │                               │
//   └─────────────┴──────────────────────────────┘
//
//  · 左边约 1/3：木纹小棋盘，红子红盘、黑子黑盘、字是白的，蓝色箭头指着刚给的着法
//  · 右边约 2/3：浅蓝白底，四行左对齐文字（深度 / 用时 / 分数 / 候选着法）
//  · 左下角一个「菜单」小戳（鹏飞也有）；左上角的叉、右上角的图标是系统画中画自带的
//  · 还没识别出局面时显示鹏飞那四行提示：单击隐藏关闭按钮 / 双指缩放 / 正在识别 / 注意不要遮挡
//
//  ★ 外面那圈洋红边框别动 ★
//     浮窗会被录屏/截图一起拍进去，引擎靠这圈 (255,0,255) 算出它盖住了哪几格，
//     那几格整格作废（保留上一帧的值）。棋盘上没有这种颜色，认出即确定。
//

import UIKit

final class FloatingPanelView: UIView {

    static let borderWidth: CGFloat = 5

    private var board: [Character?] = Array(repeating: nil, count: 90)
    private var arrowFrom: Int = -1
    private var arrowTo: Int = -1
    private var depth: Int = 0
    private var secs: Double = 0
    private var score: Int = 0
    private var moves: [String] = []
    private var isBook = false
    private var busyText: String = "正在识别"
    private var warnText: String = "注意不要遮挡被连线棋盘"

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isOpaque = true
        contentMode = .redraw
        isUserInteractionEnabled = false
    }
    required init?(coder: NSCoder) { fatalError() }

    /// 推一帧结论进浮窗
    func apply(fen: String, arrowFrom: Int, arrowTo: Int,
               depth: Int, secs: Double, score: Int, moves: [String], hint: String, isBook: Bool = false) {
        self.isBook = isBook
        board = Self.parseFen(fen)
        self.arrowFrom = arrowFrom
        self.arrowTo = arrowTo
        self.depth = depth
        self.secs = secs
        self.score = score
        self.moves = moves
        if !hint.isEmpty { warnText = hint }
        setNeedsDisplay()
    }

    /// 还没识别出局面时的「正在识别」状态
    func showWaiting(_ text: String) {
        moves = []
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
        let boardW = inner.width * 0.34
        let boardRect = CGRect(x: inner.minX, y: inner.minY, width: boardW, height: inner.height)
        drawBoard(in: boardRect, ctx: ctx)

        // 右边：浅蓝白文字区
        let textRect = CGRect(x: boardRect.maxX, y: inner.minY,
                              width: inner.maxX - boardRect.maxX, height: inner.height)
        UIColor(red: 0.945, green: 0.960, blue: 0.980, alpha: 1).setFill()
        UIRectFill(textRect)

        if moves.isEmpty {
            drawWaiting(in: textRect)
        } else {
            drawInfo(in: textRect)
        }

        // 左下角「菜单」小戳
        let menuW = boardW * 0.34, menuH = inner.height * 0.15
        let menuRect = CGRect(x: inner.minX + boardW * 0.03,
                              y: inner.maxY - menuH - inner.height * 0.03,
                              width: menuW, height: menuH)
        UIColor(red: 0.60, green: 0.60, blue: 0.62, alpha: 0.88).setFill()
        UIBezierPath(roundedRect: menuRect, cornerRadius: menuH * 0.24).fill()
        let menuAttrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: menuH * 0.60, weight: .medium),
            .foregroundColor: UIColor.white
        ]
        let ms = "菜单" as NSString
        let msz = ms.size(withAttributes: menuAttrs)
        ms.draw(at: CGPoint(x: menuRect.midX - msz.width / 2, y: menuRect.midY - msz.height / 2),
                withAttributes: menuAttrs)
    }

    // MARK: - 小棋盘

    private func drawBoard(in r: CGRect, ctx: CGContext) {
        UIColor(red: 0.906, green: 0.851, blue: 0.710, alpha: 1).setFill()
        UIRectFill(r)

        let cell = min(r.width * 0.94 / 8.0, r.height * 0.88 / 9.0)
        let ox = r.minX + (r.width - cell * 8) / 2
        let oy = r.minY + (r.height - cell * 9) / 2

        func pt(_ rr: Int, _ cc: Int) -> CGPoint {
            CGPoint(x: ox + CGFloat(cc) * cell, y: oy + CGFloat(rr) * cell)
        }

        ctx.setStrokeColor(UIColor(red: 0.45, green: 0.33, blue: 0.18, alpha: 0.72).cgColor)
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
            .font: UIFont.systemFont(ofSize: max(4, cell * 0.38), weight: .regular),
            .foregroundColor: UIColor(red: 0.47, green: 0.35, blue: 0.20, alpha: 0.78)
        ]
        let cy = oy + cell * 4.5
        ("楚河" as NSString).draw(at: CGPoint(x: ox + cell * 1.0, y: cy - cell * 0.26), withAttributes: riverAttrs)
        ("汉界" as NSString).draw(at: CGPoint(x: ox + cell * 5.2, y: cy - cell * 0.26), withAttributes: riverAttrs)

        // 棋子：红子红盘、黑子黑盘、白字
        let rad = cell * 0.40
        for sq in 0..<90 {
            guard let ch = board[sq] else { continue }
            let rr = sq / 9, cc = sq % 9
            let p = pt(rr, cc)
            let disc = CGRect(x: p.x - rad, y: p.y - rad, width: rad * 2, height: rad * 2)
            (ch.isUppercase ? UIColor(red: 0.72, green: 0.16, blue: 0.13, alpha: 1)
                            : UIColor(red: 0.16, green: 0.16, blue: 0.18, alpha: 1)).setFill()
            UIBezierPath(ovalIn: disc).fill()
            UIColor(white: 1.0, alpha: 0.45).setStroke()
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

        // 蓝色着法箭头（带三角头）
        if arrowFrom >= 0 && arrowTo >= 0 {
            let p0 = pt(arrowFrom / 9, arrowFrom % 9)
            let p1 = pt(arrowTo / 9, arrowTo % 9)
            let blue = UIColor(red: 0.22, green: 0.40, blue: 0.93, alpha: 0.95)
            blue.setStroke(); blue.setFill()
            let path = UIBezierPath()
            path.lineWidth = max(1.8, cell * 0.17)
            path.lineCapStyle = .round
            path.move(to: p0)
            path.addLine(to: p1)
            path.stroke()
            let ang = atan2(p1.y - p0.y, p1.x - p0.x)
            let head = max(4.0, cell * 0.46)
            let tri = UIBezierPath()
            tri.move(to: p1)
            tri.addLine(to: CGPoint(x: p1.x - head * cos(ang - 0.40), y: p1.y - head * sin(ang - 0.40)))
            tri.addLine(to: CGPoint(x: p1.x - head * cos(ang + 0.40), y: p1.y - head * sin(ang + 0.40)))
            tri.close()
            tri.fill()
        }
    }

    // MARK: - 右边四行文字（深度 / 用时 / 分数 / 候选着法）

    private func drawInfo(in r: CGRect) {
        let padX = r.width * 0.05
        let availW = r.width - padX * 2
        let slate = UIColor(red: 0.24, green: 0.31, blue: 0.42, alpha: 1)
        let blue = UIColor(red: 0.16, green: 0.42, blue: 0.90, alpha: 1)
        var y = r.minY + r.height * 0.05

        /// 画一行：先按可用宽度缩字号，缩到下限还不够就按字符折行。
        /// 以前的写法只在「拼下一段」时判宽，单独一段超长就直接画出去 ——
        /// 用户截图里「炮八平五 兵一进一」冲出悬浮窗就是这么来的。
        func drawFitted(_ text: String, size: CGFloat, color: UIColor, weight: UIFont.Weight = .regular) {
            var fs = size
            func attrs(_ s: CGFloat) -> [NSAttributedString.Key: Any] {
                [.font: UIFont.systemFont(ofSize: s, weight: weight), .foregroundColor: color]
            }
            var w = (text as NSString).size(withAttributes: attrs(fs)).width
            while w > availW && fs > 7 {
                fs -= 0.5
                w = (text as NSString).size(withAttributes: attrs(fs)).width
            }
            if w <= availW {
                let sz = (text as NSString).size(withAttributes: attrs(fs))
                if y + sz.height > r.maxY { return }
                (text as NSString).draw(at: CGPoint(x: r.minX + padX, y: y), withAttributes: attrs(fs))
                y += sz.height + r.height * 0.012
                return
            }
            // 缩到下限还放不下：按字符切
            var line = ""
            for ch in text {
                let candidate = line + String(ch)
                let cw = (candidate as NSString).size(withAttributes: attrs(fs)).width
                if cw > availW && !line.isEmpty {
                    let sz = (line as NSString).size(withAttributes: attrs(fs))
                    if y + sz.height > r.maxY { return }
                    (line as NSString).draw(at: CGPoint(x: r.minX + padX, y: y), withAttributes: attrs(fs))
                    y += sz.height + r.height * 0.012
                    line = String(ch)
                } else {
                    line = candidate
                }
            }
            if !line.isEmpty {
                let sz = (line as NSString).size(withAttributes: attrs(fs))
                if y + sz.height > r.maxY { return }
                (line as NSString).draw(at: CGPoint(x: r.minX + padX, y: y), withAttributes: attrs(fs))
                y += sz.height + r.height * 0.012
            }
        }

        let h = r.height
        if isBook {
            // 开局库命中：跟鹏飞 0:31 那一帧一样，只给一行大字「库: 兵七进一」
            drawFitted("库: " + moves.joined(separator: "  "), size: h * 0.20, color: slate)
            return
        }
        drawFitted("深度: \(depth)", size: h * 0.125, color: slate)
        drawFitted(String(format: "%.1f秒", secs), size: h * 0.125, color: slate)
        drawFitted("分数: \(score)", size: h * 0.140, color: blue)
        // 候选着法：每个着法单独一段，超宽自动折
        drawFitted(moves.joined(separator: "  "), size: h * 0.130, color: slate)
    }

    // MARK: - 等待/提示状态

    private func drawWaiting(in r: CGRect) {
        let padX = r.width * 0.05
        let availW = r.width - padX * 2
        var y = r.minY + r.height * 0.06

        func line(_ text: String, size: CGFloat, color: UIColor) {
            var fs = size
            func attrs(_ s: CGFloat) -> [NSAttributedString.Key: Any] {
                [.font: UIFont.systemFont(ofSize: s, weight: .regular), .foregroundColor: color]
            }
            var w = (text as NSString).size(withAttributes: attrs(fs)).width
            while w > availW && fs > 7 {
                fs -= 0.5
                w = (text as NSString).size(withAttributes: attrs(fs)).width
            }
            let sz = (text as NSString).size(withAttributes: attrs(fs))
            guard y + sz.height <= r.maxY else { return }
            (text as NSString).draw(at: CGPoint(x: r.minX + padX, y: y), withAttributes: attrs(fs))
            y += sz.height + r.height * 0.02
        }

        let h = r.height
        guard h > 90 else {
            line(busyText, size: h * 0.18, color: UIColor(red: 0.16, green: 0.42, blue: 0.90, alpha: 1))
            return
        }
        line("单击可以隐藏关闭按钮", size: h * 0.075, color: UIColor(red: 0.49, green: 0.53, blue: 0.60, alpha: 1))
        line("双指按住操作可以缩放悬浮窗", size: h * 0.075, color: UIColor(red: 0.49, green: 0.53, blue: 0.60, alpha: 1))
        y += h * 0.04
        line(busyText, size: h * 0.125, color: UIColor(red: 0.18, green: 0.30, blue: 0.48, alpha: 1))
        line(warnText, size: h * 0.085, color: UIColor(red: 0.16, green: 0.42, blue: 0.90, alpha: 1))
    }
}
