//
//  CalibrationView.swift
//  JJCheatApp —— 在录屏画面上点棋盘四角
//
//  关键：点出的坐标是「录屏帧坐标」，而识别也正是在这个坐标系里做的，
//  所以中间不需要任何屏幕缩放换算，一次点准终身有效。
//

import SwiftUI

struct CalibrationView: View {

    let image: UIImage
    var onDone: ([[Double]]) -> Void
    var onCancel: () -> Void

    @State private var points: [CGPoint] = []
    @State private var showError = false
    @State private var errorText = ""

    private let labels = ["左上角", "右上角", "右下角", "左下角"]

    var body: some View {
        VStack(spacing: 0) {
            header
            GeometryReader { geo in
                ZStack {
                    Color.black
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: geo.size.width, height: geo.size.height)

                    ForEach(Array(points.enumerated()), id: \.offset) { idx, p in
                        let vp = toView(p, imageSize: image.size, box: geo.size)
                        ZStack {
                            Circle().fill(Color.green.opacity(0.85)).frame(width: 22, height: 22)
                            Text("\(idx + 1)").font(.caption2.bold()).foregroundColor(.black)
                        }
                        .position(vp)
                    }

                    if points.count == 2 {
                        let a = toView(points[0], imageSize: image.size, box: geo.size)
                        let b = toView(points[1], imageSize: image.size, box: geo.size)
                        Path { p in
                            p.move(to: a); p.addLine(to: b)
                        }
                        .stroke(Color.green, lineWidth: 2)
                    }
                }
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onEnded { value in
                            handleTap(at: value.location, box: geo.size)
                        }
                )
            }
            footer
        }
        .background(Color.black.ignoresSafeArea())
        .alert("点偏了", isPresented: $showError) {
            Button("重来", role: .cancel) { points.removeAll() }
        } message: {
            Text(errorText)
        }
    }

    private var header: some View {
        VStack(spacing: 4) {
            Text(points.count < 4
                 ? "点第 \(points.count + 1) 个角：\(labels[points.count])"
                 : "点满了")
                .font(.headline)
                .foregroundColor(.white)
            Text("认准棋盘最外圈的交叉点，按 左上 → 右上 → 右下 → 左下 的顺序点")
                .font(.caption)
                .foregroundColor(.gray)
        }
        .padding(.vertical, 10)
    }

    private var footer: some View {
        HStack(spacing: 12) {
            Button("取消") { onCancel() }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color.gray.opacity(0.3))
                .foregroundColor(.white)
                .cornerRadius(10)

            Button("撤销") {
                if !points.isEmpty { points.removeLast() }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Color.orange.opacity(0.75))
            .foregroundColor(.white)
            .cornerRadius(10)
            .disabled(points.isEmpty)

            Button("完成") {
                guard points.count == 4 else { return }
                onDone(points.map { [Double($0.x), Double($0.y)] })
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(points.count == 4 ? Color.green : Color.gray.opacity(0.3))
            .foregroundColor(.white)
            .cornerRadius(10)
            .disabled(points.count != 4)
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 24)
        .padding(.top, 8)
    }

    // MARK: - 坐标换算

    /// aspectFit 之后图片实际占的矩形
    private func fittedRect(imageSize: CGSize, box: CGSize) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0 else { return .zero }
        let scale = min(box.width / imageSize.width, box.height / imageSize.height)
        let w = imageSize.width * scale
        let h = imageSize.height * scale
        return CGRect(x: (box.width - w) / 2, y: (box.height - h) / 2, width: w, height: h)
    }

    /// 图片像素坐标 → 视图坐标
    private func toView(_ p: CGPoint, imageSize: CGSize, box: CGSize) -> CGPoint {
        let r = fittedRect(imageSize: imageSize, box: box)
        guard imageSize.width > 0, imageSize.height > 0 else { return .zero }
        return CGPoint(x: r.minX + p.x / imageSize.width * r.width,
                       y: r.minY + p.y / imageSize.height * r.height)
    }

    /// 视图坐标 → 图片像素坐标
    private func handleTap(at loc: CGPoint, box: CGSize) {
        guard points.count < 4 else { return }
        let r = fittedRect(imageSize: image.size, box: box)
        guard r.contains(loc) else {
            errorText = "点到了画面外，请点在棋盘上"
            showError = true
            return
        }
        let nx = (loc.x - r.minX) / r.width
        let ny = (loc.y - r.minY) / r.height
        let px = nx * image.size.width
        let py = ny * image.size.height
        points.append(CGPoint(x: px, y: py))
    }
}
