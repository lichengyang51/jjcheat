//
//  BoardEditorView.swift
//  JJCheatApp
//
//  可交互的象棋棋盘：显示识别结果，也能点格子手动改子。
//
//  为什么要能改：拍照/截图识别偶尔会认错一两个子（尤其字多的炮和将）。
//  鹏飞象棋同类软件也都是「识别 + 手动纠错」的组合 ——
//  与其让用户接受一个错盘面，不如让他两下点正，再算棋。
//

import SwiftUI

/// 棋种（用于手动摆子）
enum PieceKind: String, CaseIterable, Identifiable {
    case k = "K", a = "A", b = "B", n = "N", r = "R", c = "C", p = "P"
    var id: String { rawValue }
    var cn: String {
        switch self {
        case .k: return "将/帅"
        case .a: return "士/仕"
        case .b: return "象/相"
        case .n: return "马/傌"
        case .r: return "车/俥"
        case .c: return "炮"
        case .p: return "卒/兵"
        }
    }
}

struct BoardEditorView: View {

    /// 90 格，每格是 FEN 字符（nil = 空）
    @Binding var board: [Character?]
    /// 当前选中的棋种（nil 表示擦除）
    var selected: PieceKind?
    /// 是否执红（红在下）
    var redAtBottom: Bool = true
    /// 上一步的着法（画箭头）
    var highlightFrom: Int = -1
    var highlightTo: Int = -1

    var onTap: (Int) -> Void

    var body: some View {
        GeometryReader { geo in
            let pad: CGFloat = 8
            let w = geo.size.width - pad * 2
            let h = geo.size.height - pad * 2
            let cell = min(w / 8, h / 9)
            let ox = (geo.size.width - cell * 8) / 2
            let oy = (geo.size.height - cell * 9) / 2

            ZStack(alignment: .topLeading) {
                Canvas { ctx, size in
                    // 棋盘底
                    let rect = CGRect(x: 0, y: 0, width: size.width, height: size.height)
                    ctx.fill(Path(roundedRect: rect, cornerRadius: 8),
                             with: .color(Color(red: 0.86, green: 0.78, blue: 0.60)))
                    // 格线
                    var lines = Path()
                    for r in 0..<10 {
                        let y = oy + CGFloat(displayRow(r)) * cell
                        lines.move(to: CGPoint(x: ox, y: y))
                        lines.addLine(to: CGPoint(x: ox + cell * 8, y: y))
                    }
                    for c in 0..<9 {
                        let x = ox + CGFloat(c) * cell
                        lines.move(to: CGPoint(x: x, y: oy))
                        lines.addLine(to: CGPoint(x: x, y: oy + cell * 9))
                    }
                    // 九宫斜线
                    for base in [0, 7] {
                        let y0 = oy + CGFloat(displayRow(base)) * cell
                        let y2 = oy + CGFloat(displayRow(base + 2)) * cell
                        lines.move(to: CGPoint(x: ox + cell * 3, y: y0))
                        lines.addLine(to: CGPoint(x: ox + cell * 5, y: y2))
                        lines.move(to: CGPoint(x: ox + cell * 5, y: y0))
                        lines.addLine(to: CGPoint(x: ox + cell * 3, y: y2))
                    }
                    ctx.stroke(lines, with: .color(Color(red: 0.42, green: 0.31, blue: 0.18)), lineWidth: 1)

                    // 着法箭头
                    if highlightFrom >= 0 && highlightTo >= 0 {
                        let p0 = center(highlightFrom, cell, ox, oy)
                        let p1 = center(highlightTo, cell, ox, oy)
                        var arrow = Path()
                        arrow.move(to: p0)
                        arrow.addLine(to: p1)
                        ctx.stroke(arrow, with: .color(Color.red.opacity(0.9)),
                                   style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        ctx.fill(Path(ellipseIn: CGRect(x: p0.x - 5, y: p0.y - 5, width: 10, height: 10)),
                                 with: .color(Color.red.opacity(0.9)))
                    }

                    // 棋子
                    let rad = cell * 0.44
                    for sq in 0..<90 {
                        guard let ch = board[sq] else { continue }
                        let p = center(sq, cell, ox, oy)
                        let isRed = ch.isUppercase
                        let disc = CGRect(x: p.x - rad, y: p.y - rad, width: rad * 2, height: rad * 2)
                        ctx.fill(Path(ellipseIn: disc),
                                 with: .color(Color(red: 0.98, green: 0.94, blue: 0.83)))
                        ctx.stroke(Path(ellipseIn: disc.insetBy(dx: 0.5, dy: 0.5)),
                                   with: .color(Color(red: 0.55, green: 0.40, blue: 0.22)), lineWidth: 1)
                        let txt = Text(Self.cn(ch))
                            .font(.system(size: rad * 1.15, weight: .bold))
                            .foregroundColor(isRed
                                             ? Color(red: 0.78, green: 0.10, blue: 0.10)
                                             : Color(red: 0.10, green: 0.10, blue: 0.12))
                        ctx.draw(txt, at: p, anchor: .center)
                    }
                }

                // 点击层
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
    }

    /// 屏幕第 drow 行对应的棋盘行号
    private func displayRow(_ row: Int) -> Int { redAtBottom ? row : 9 - row }

    private func center(_ sq: Int, _ cell: CGFloat, _ ox: CGFloat, _ oy: CGFloat) -> CGPoint {
        let r = sq / 9, c = sq % 9
        return CGPoint(x: ox + CGFloat(c) * cell, y: oy + CGFloat(displayRow(r)) * cell)
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
