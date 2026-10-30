//
//  EvidenceView.swift
//  JJCheatApp
//
//  识别留证：把 90 个格子「从截图里裁出来的真实小图」和「程序认成什么」
//  并排显示出来。哪一格认错，一眼就能看到那格的字形实际长什么样、
//  程序比出来最像的前三个候选是谁。
//
//  这一页存在的目的只有一个：让「认错」这件事可诊断，而不是盲猜。
//

import SwiftUI

struct EvidenceView: View {

    /// 刚识别的那张图
    let image: UIImage
    /// 引擎给的棋盘四角（在识别所用分辨率下的像素坐标）
    let corners: [[Double]]
    /// 识别所用图像的宽高
    let imgW: Int
    let imgH: Int
    /// 90 格识别出的 FEN 字符（'.' 表示空）
    let chars: [Character]
    /// 90 格置信度
    let conf: [Double]
    /// 90 格候选（棋子代号，最多 3 个）
    let tops: [[Int]]

    @Environment(\.dismiss) private var dismiss

    private let names: [Int: String] = [
        1: "帥", 2: "仕", 3: "相", 4: "馬", 5: "俥", 6: "炮", 7: "兵",
        8: "將", 9: "士", 10: "象", 11: "馬", 12: "車", 13: "砲", 14: "卒"
    ]

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    Text("每一格左边是从你截图里裁出来的真实小图，右边是程序认成的字和候选。框红色=没把握（分数<0.5），黄色=一般，绿色=有把握。")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)

                    // 顶部：整张图 + 四角位置，确认定位对不对
                    if let annotated = annotatedImage() {
                        Image(uiImage: annotated)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(maxHeight: 200)
                            .overlay(Rectangle().stroke(Color.blue.opacity(0.4), lineWidth: 1))
                    }

                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 9), spacing: 2) {
                        ForEach(0..<90, id: \.self) { sq in
                            cellView(sq)
                        }
                    }
                }
                .padding(8)
            }
            .navigationTitle("识别留证  \(recognizedCount) 子")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("关闭") { dismiss() }
                }
            }
        }
    }

    private var recognizedCount: Int {
        chars.filter { $0 != "." }.count
    }

    // MARK: - 单格

    private func cellView(_ sq: Int) -> some View {
        let c = chars[sq]
        let empty = (c == ".")
        let score = sq < conf.count ? conf[sq] : 0
        let frameColor: Color = empty ? Color.gray.opacity(0.25)
            : (score >= 0.8 ? Color.green.opacity(0.8)
               : (score >= 0.5 ? Color.yellow.opacity(0.9) : Color.red.opacity(0.9)))
        let topNames: String = {
            guard sq < tops.count else { return "" }
            return tops[sq].compactMap { names[$0] }.joined(separator: " ")
        }()

        return VStack(spacing: 1) {
            ZStack {
                if let crop = cropImage(sq) {
                    Image(uiImage: crop)
                        .resizable()
                        .aspectRatio(1, contentMode: .fill)
                } else {
                    Color.black.opacity(0.05)
                }
                // 识别结果盖在右下角，不挡字形
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Text(empty ? "·" : String(c))
                            .font(.system(size: 11, weight: .heavy))
                            .foregroundColor(.white)
                            .padding(.horizontal, 3)
                            .background(empty ? Color.gray.opacity(0.7) : Color.black.opacity(0.65))
                            .cornerRadius(3)
                    }
                }
            }
            .frame(height: 36)
            .clipShape(RoundedRectangle(cornerRadius: 3))
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(frameColor, lineWidth: 1.5))

            Text(empty ? " " : topNames)
                .font(.system(size: 6))
                .foregroundColor(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
    }

    // MARK: - 裁图


    /// 取第 sq 格的真实像素（按四角双线性插值出中心，再裁 0.8 格）
    private func cropImage(_ sq: Int) -> UIImage? {
        guard corners.count >= 4, let cg = image.cgImage else { return nil }
        let scale = CGFloat(imgW) / CGFloat(cg.width)     // 引擎坐标 -> 原图坐标
        let p00 = corners[0], p10 = corners[1], p11 = corners[2], p01 = corners[3]
        let cw = hypot(p10[0] - p00[0], p10[1] - p00[1]) / 8
        let ch = hypot(p01[0] - p00[0], p01[1] - p00[1]) / 9
        let cell = min(cw, ch)
        let r = sq / 9, c = sq % 9
        let u = Double(c) / 8, v = Double(r) / 9
        let a = (1 - u) * (1 - v), b = u * (1 - v), cc = u * v, d = (1 - u) * v
        let cx = (a * p00[0] + b * p10[0] + cc * p11[0] + d * p01[0]) / Double(scale)
        let cy = (a * p00[1] + b * p10[1] + cc * p11[1] + d * p01[1]) / Double(scale)
        // 裁 0.86 格（正好覆盖棋子圆盘）
        let half = cell * 0.86 / 2 / Double(scale)
        let rect = CGRect(x: cx - half, y: cy - half, width: half * 2, height: half * 2)
            .intersection(CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        guard rect.width > 4, rect.height > 4, let sub = cg.cropping(to: rect) else { return nil }
        return UIImage(cgImage: sub)
    }

    /// 原图上画出 90 个格点，确认棋盘定位
    private func annotatedImage() -> UIImage? {
        guard let cg = image.cgImage else { return nil }
        let scale = CGFloat(cg.width) / CGFloat(imgW)
        let size = CGSize(width: cg.width, height: cg.height)
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        return UIGraphicsImageRenderer(size: size, format: fmt).image { ctx in
            UIImage(cgImage: cg).draw(in: CGRect(origin: .zero, size: size))
            let col = UIColor.cyan.withAlphaComponent(0.9)
            col.setStroke()
            guard corners.count >= 4 else { return }
            let pts = corners.map { CGPoint(x: $0[0] * scale, y: $0[1] * scale) }
            let path = UIBezierPath()
            path.move(to: pts[0]); path.addLine(to: pts[1])
            path.addLine(to: pts[2]); path.addLine(to: pts[3]); path.close()
            path.lineWidth = 2; path.stroke()
            for r in 0..<10 {
                for c in 0..<9 {
                    let u = CGFloat(c) / 8, v = CGFloat(r) / 9
                    let a = (1 - u) * (1 - v), b = u * (1 - v), cc = u * v, d = (1 - u) * v
                    let x = a * pts[0].x + b * pts[1].x + cc * pts[2].x + d * pts[3].x
                    let y = a * pts[0].y + b * pts[1].y + cc * pts[2].y + d * pts[3].y
                    let rr: CGFloat = 3
                    ctx.cgContext.setFillColor(UIColor.cyan.cgColor)
                    ctx.cgContext.fillEllipse(in: CGRect(x: x - rr, y: y - rr, width: rr * 2, height: rr * 2))
                }
            }
        }
    }
}
