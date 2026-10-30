//
//  ChessBoardView.swift
//  JJCheatApp
//
//  棋盘：照鹏飞象棋移动版的样式画
//    · 浅木色底 + 细棕色格线
//    · 棋子是实心圆片：黑子黑底白字、红子红底白字
//    · 中间「楚河 汉界」
//    · 底边中文数字（九八七六五四三二一），顶边阿拉伯数字
//    · 推荐着法用箭头标出，并支持「演示」动画
//

import SwiftUI

struct ChessBoardView: View {

    @Binding var board: [Character?]
    var redAtBottom: Bool = true
    var fromSq: Int = -1
    var toSq: Int = -1
    /// 演示进度 0→1（-1 表示不演示）
    var demoProgress: Double = -1
    var onTap: ((Int) -> Void)? = nil

    private let woodTop = Color(red: 0.93, green: 0.86, blue: 0.70)
    private let woodBottom = Color(red: 0.88, green: 0.79, blue: 0.60)
    private let lineColor = Color(red: 0.55, green: 0.42, blue: 0.26)

    var body: some View {
        GeometryReader { geo in
            let pad = min(geo.size.width, geo.size.height) * 0.035
            let w = geo.size.width - pad * 2
            let h = geo.size.height - pad * 2
            let cell = min(w / 8, h / 9)
            let ox = (geo.size.width - cell * 8) / 2
            let oy = (geo.size.height - cell * 9) / 2

            ZStack(alignment: .topLeading) {
                LinearGradient(colors: [woodTop, woodBottom], startPoint: .top, endPoint: .bottom)

                Canvas { ctx, size in
                    draw(ctx: ctx, size: size, cell: cell, ox: ox, oy: oy)
                }

                if let onTap {
                    Color.clear
                        .contentShape(Rectangle())
                        .onTapGesture { loc in
                            let col = Int(round((loc.x - ox) / cell))
                            let drow = Int(round((loc.y - oy) / cell))
                            guard col >= 0, col < 9, drow >= 0, drow < 10 else { return }
                            let row = redAtBottom ? drow : 9 - drow
                            onTap(row * 9 + col)
                        }
                }
            }
            .cornerRadius(6)
        }
    }

    // MARK: - 绘制

    private func draw(ctx: GraphicsContext, size: CGSize, cell: CGFloat, ox: CGFloat, oy: CGFloat) {
        let lineW = max(0.7, cell * 0.02)

        // 格线
        var lines = Path()
        for r in 0..<10 {
            let y = oy + CGFloat(disp(r)) * cell
            lines.move(to: CGPoint(x: ox, y: y))
            lines.addLine(to: CGPoint(x: ox + cell * 8, y: y))
        }
        for c in 0..<9 {
            let x = ox + CGFloat(c) * cell
            if c == 0 || c == 8 {
                lines.move(to: CGPoint(x: x, y: oy))
                lines.addLine(to: CGPoint(x: x, y: oy + cell * 9))
            } else {
                // 中间列在河界处断开
                lines.move(to: CGPoint(x: x, y: oy))
                lines.addLine(to: CGPoint(x: x, y: oy + cell * 4))
                lines.move(to: CGPoint(x: x, y: oy + cell * 5))
                lines.addLine(to: CGPoint(x: x, y: oy + cell * 9))
            }
        }
        // 九宫斜线
        for base in [0, 7] {
            let y0 = oy + CGFloat(disp(base)) * cell
            let y2 = oy + CGFloat(disp(base + 2)) * cell
            lines.move(to: CGPoint(x: ox + cell * 3, y: y0))
            lines.addLine(to: CGPoint(x: ox + cell * 5, y: y2))
            lines.move(to: CGPoint(x: ox + cell * 5, y: y0))
            lines.addLine(to: CGPoint(x: ox + cell * 3, y: y2))
        }
        ctx.stroke(lines, with: .color(lineColor), lineWidth: lineW)

        // 九宫位置的小角标（照真实棋盘）
        var ticks = Path()
        let marks: [(Int, Int)] = [(0,3),(0,5),(2,3),(2,5),(7,3),(7,5),(9,3),(9,5)]
        for (r, c) in marks {
            let x = ox + CGFloat(c) * cell
            let y = oy + CGFloat(disp(r)) * cell
            let d = cell * 0.14
            for (sx, sy) in [(-1, -1), (1, -1), (-1, 1), (1, 1)] {
                if sx > 0 && c == 8 { continue }
                if sx < 0 && c == 0 { continue }
                ticks.move(to: CGPoint(x: x + CGFloat(sx) * d, y: y))
                ticks.addLine(to: CGPoint(x: x + CGFloat(sx) * d, y: y + CGFloat(sy) * d))
                ticks.addLine(to: CGPoint(x: x, y: y + CGFloat(sy) * d))
            }
        }
        ctx.stroke(ticks, with: .color(lineColor.opacity(0.85)), lineWidth: lineW)

        // 楚河 汉界
        let riverY = oy + cell * 4.5
        ctx.draw(Text("楚 河").font(.system(size: cell * 0.42, weight: .semibold))
                    .foregroundColor(lineColor.opacity(0.75)),
                 at: CGPoint(x: ox + cell * 2.0, y: riverY), anchor: .center)
        ctx.draw(Text("汉 界").font(.system(size: cell * 0.42, weight: .semibold))
                    .foregroundColor(lineColor.opacity(0.75)),
                 at: CGPoint(x: ox + cell * 6.0, y: riverY), anchor: .center)

        // 坐标
        let numAttrs = Font.system(size: cell * 0.26, weight: .medium)
        for c in 0..<9 {
            let x = ox + CGFloat(c) * cell
            // 底边：中文数字（红方视角 九→一）
            let cnNum = ["九", "八", "七", "六", "五", "四", "三", "二", "一"][c]
            ctx.draw(Text(cnNum).font(numAttrs).foregroundColor(lineColor.opacity(0.7)),
                     at: CGPoint(x: x, y: oy + cell * 9 + cell * 0.42), anchor: .center)
            // 顶边：阿拉伯数字
            ctx.draw(Text("\(c + 1)").font(numAttrs).foregroundColor(lineColor.opacity(0.55)),
                     at: CGPoint(x: x, y: oy - cell * 0.42), anchor: .center)
        }

        // 着法箭头
        if fromSq >= 0, toSq >= 0 {
            let p0 = center(fromSq, cell, ox, oy)
            let p1 = center(toSq, cell, ox, oy)
            var arrow = Path()
            arrow.move(to: p0)
            arrow.addLine(to: p1)
            ctx.stroke(arrow, with: .color(Color(red: 0.35, green: 0.25, blue: 0.85).opacity(0.9)),
                       style: StrokeStyle(lineWidth: max(2, cell * 0.07), lineCap: .round))
            // 箭头
            let ang = atan2(p1.y - p0.y, p1.x - p0.x)
            let head = cell * 0.26
            var tri = Path()
            tri.move(to: p1)
            tri.addLine(to: CGPoint(x: p1.x - head * cos(ang - 0.45), y: p1.y - head * sin(ang - 0.45)))
            tri.addLine(to: CGPoint(x: p1.x - head * cos(ang + 0.45), y: p1.y - head * sin(ang + 0.45)))
            tri.closeSubpath()
            ctx.fill(tri, with: .color(Color(red: 0.35, green: 0.25, blue: 0.85).opacity(0.9)))
        }

        // 棋子
        let rad = cell * 0.42
        for sq in 0..<90 {
            guard let ch = board[sq] else { continue }
            var p = center(sq, cell, ox, oy)
            // 演示：把被走的子沿着箭头移动
            if demoProgress >= 0, sq == fromSq, toSq >= 0 {
                let a = center(toSq, cell, ox, oy)
                p = CGPoint(x: p.x + (a.x - p.x) * demoProgress,
                            y: p.y + (a.y - p.y) * demoProgress)
            }
            let isRed = ch.isUppercase
            let disc = CGRect(x: p.x - rad, y: p.y - rad, width: rad * 2, height: rad * 2)
            ctx.fill(Path(ellipseIn: disc),
                     with: .color(isRed
                                  ? Color(red: 0.72, green: 0.13, blue: 0.11)
                                  : Color(red: 0.13, green: 0.13, blue: 0.15)))
            ctx.stroke(Path(ellipseIn: disc.insetBy(dx: rad * 0.09, dy: rad * 0.09)),
                       with: .color(Color.white.opacity(0.35)), lineWidth: max(0.6, cell * 0.02))
            ctx.draw(Text(BoardEditorView.cn(ch))
                        .font(.system(size: rad * 1.18, weight: .bold))
                        .foregroundColor(.white),
                     at: p, anchor: .center)
        }
    }

    private func disp(_ row: Int) -> Int { redAtBottom ? row : 9 - row }

    private func center(_ sq: Int, _ cell: CGFloat, _ ox: CGFloat, _ oy: CGFloat) -> CGPoint {
        let r = sq / 9, c = sq % 9
        return CGPoint(x: ox + CGFloat(c) * cell, y: oy + CGFloat(disp(r)) * cell)
    }
}
