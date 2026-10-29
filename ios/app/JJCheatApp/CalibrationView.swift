//
//  CalibrationView.swift
//  JJCheatApp —— 在录屏画面上点棋盘四角
//
//  【为什么需要多帧】
//  App 在录制屏幕，而校准界面本身就在屏幕里。
//  切回 JJCheat 的那一刻，最新帧录的是「JJCheat 自己」，
//  直接显示会变成无限镜面嵌套。
//
//  所以这里给一个横向缩略图条：往前翻到刚才在 JJ象棋 里的那一帧，
//  在那一帧上点四角才准。
//
//  坐标点出来就是「录屏帧坐标」，识别也在这个坐标系里做，
//  中间不做任何屏幕缩放换算。
//

import SwiftUI

struct CalibrationView: View {

    let frames: [FrameSnapshot]
    var onDone: ([[Double]]) -> Void
    var onCancel: () -> Void

    @State private var index: Int
    @State private var points: [CGPoint] = []
    @State private var showError = false
    @State private var errorText = ""

    private let labels = ["左上角", "右上角", "右下角", "左下角"]

    init(frames: [FrameSnapshot],
         onDone: @escaping ([[Double]]) -> Void,
         onCancel: @escaping () -> Void) {
        self.frames = frames
        self.onDone = onDone
        self.onCancel = onCancel
        _index = State(initialValue: max(0, frames.count - 1))
    }

    private var current: FrameSnapshot? {
        guard frames.indices.contains(index) else { return nil }
        return frames[index]
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            if frames.count > 1 { strip }
            content
            footer
        }
        .background(Color.black.ignoresSafeArea())
        .alert("点偏了", isPresented: $showError) {
            Button("重来", role: .cancel) { points.removeAll() }
        } message: {
            Text(errorText)
        }
    }

    // MARK: - 顶部说明

    private var header: some View {
        VStack(spacing: 4) {
            Text(points.count < 4
                 ? "点第 \(points.count + 1) 个角：\(labels[points.count])"
                 : "四个角都点完了")
                .font(.headline)
                .foregroundColor(.white)
            Text("先在上面的缩略图里滑到「JJ象棋 棋盘」那一帧，再按 左上 → 右上 → 右下 → 左下 点最外圈交叉点")
                .font(.caption2)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)
        }
        .padding(.vertical, 10)
    }

    // MARK: - 缩略图选择条

    private var strip: some View {
        VStack(alignment: .leading, spacing: 4) {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(Array(frames.enumerated()), id: \.element.id) { idx, f in
                            Image(uiImage: f.image)
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .frame(width: 46, height: 96)
                                .clipped()
                                .overlay(
                                    Rectangle()
                                        .stroke(idx == index ? Color.green : Color.white.opacity(0.25),
                                                lineWidth: idx == index ? 2.5 : 1)
                                )
                                .id(idx)
                                .onTapGesture {
                                    index = idx
                                    points.removeAll()   // 换帧就重来，坐标系可能不同
                                }
                        }
                    }
                    .padding(.horizontal, 10)
                }
                .onAppear {
                    proxy.scrollTo(index, anchor: .trailing)
                }
            }
            HStack {
                Text("← 往左滑 = 更早的画面")
                    .font(.caption2).foregroundColor(.gray)
                Spacer()
                Text("第 \(index + 1) / \(frames.count) 帧")
                    .font(.caption2.monospacedDigit()).foregroundColor(.gray)
            }
            .padding(.horizontal, 10)
        }
        .padding(.bottom, 6)
    }

    // MARK: - 画面 + 点角

    private var content: some View {
        GeometryReader { geo in
            ZStack {
                Color.black
                if let img = current?.image {
                    Image(uiImage: img)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: geo.size.width, height: geo.size.height)

                    ForEach(Array(points.enumerated()), id: \.offset) { idx, p in
                        let vp = toView(p, imageSize: img.size, box: geo.size)
                        ZStack {
                            Circle().fill(Color.green.opacity(0.85)).frame(width: 24, height: 24)
                            Text("\(idx + 1)").font(.caption2.bold()).foregroundColor(.black)
                        }
                        .position(vp)
                    }

                    if points.count >= 2 {
                        let a = toView(points[0], imageSize: img.size, box: geo.size)
                        let b = toView(points[1], imageSize: img.size, box: geo.size)
                        Path { p in
                            p.move(to: a); p.addLine(to: b)
                        }
                        .stroke(Color.green, lineWidth: 2)
                    }

                    // ---- 四个点都点完后：立刻画出识别网格，和棋盘线条对不对得上，一眼就知道 ----
                    if points.count == 4 {
                        Canvas { ctx, size in
                            drawGridPreview(ctx: &ctx, imageSize: img.size, box: size)
                        }
                        .allowsHitTesting(false)
                        .overlay(alignment: .bottom) {
                            Text(previewHint)
                                .font(.caption2.bold())
                                .foregroundColor(.white)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(verdictGood ? Color.green.opacity(0.85)
                                                        : Color.red.opacity(0.85))
                                .cornerRadius(8)
                                .padding(.bottom, 6)
                        }
                    }
                } else {
                    Text("没有可用画面").foregroundColor(.gray)
                }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onEnded { v in
                        handleTap(at: v.location, box: geo.size)
                    }
            )
        }
    }

    // MARK: - 底部按钮

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

    // MARK: - 网格预览

    /// 四点围成的四边形内，按 9 竖 10 横插值画出网格 + 90 个采样点
    private func drawGridPreview(ctx: inout GraphicsContext, imageSize: CGSize, box: CGSize) {
        guard points.count == 4 else { return }
        let r = fittedRect(imageSize: imageSize, box: box)
        guard r.width > 0 else { return }

        // 四点从图像像素坐标转成视图坐标
        var vp: [CGPoint] = []
        for p in points {
            vp.append(CGPoint(x: r.minX + p.x / imageSize.width * r.width,
                              y: r.minY + p.y / imageSize.height * r.height))
        }

        func at(_ u: Double, _ v: Double) -> CGPoint {
            let a = (1 - u) * (1 - v), b = u * (1 - v), c = u * v, d = (1 - u) * v
            return CGPoint(x: a * vp[0].x + b * vp[1].x + c * vp[2].x + d * vp[3].x,
                           y: a * vp[0].y + b * vp[1].y + c * vp[2].y + d * vp[3].y)
        }

        // 9 条竖线
        for c in 0...8 {
            var path = Path()
            let u = Double(c) / 8.0
            path.move(to: at(u, 0))
            for rr in 1...9 { path.addLine(to: at(u, Double(rr) / 9.0)) }
            ctx.stroke(path, with: .color(.green.opacity(0.85)), lineWidth: 1.2)
        }
        // 10 条横线
        for rr in 0...9 {
            var path = Path()
            let v = Double(rr) / 9.0
            path.move(to: at(0, v))
            for cc in 1...8 { path.addLine(to: at(Double(cc) / 8.0, v)) }
            ctx.stroke(path, with: .color(.green.opacity(0.85)), lineWidth: 1.2)
        }
        // 90 个采样点
        for rr in 0...9 {
            for cc in 0...8 {
                let p = at(Double(cc) / 8.0, Double(rr) / 9.0)
                let dot = Path(ellipseIn: CGRect(x: p.x - 2.2, y: p.y - 2.2, width: 4.4, height: 4.4))
                ctx.fill(dot, with: .color(.yellow))
            }
        }
        // 四个角高亮
        for (i, p) in vp.enumerated() {
            let ring = Path(ellipseIn: CGRect(x: p.x - 9, y: p.y - 9, width: 18, height: 18))
            ctx.stroke(ring, with: .color(.white), lineWidth: 2)
            _ = i
        }
    }

    /// 四边形是否像个正经棋盘（用边长比例做粗判）
    private var verdictGood: Bool {
        guard points.count == 4 else { return false }
        // 校验：四个点应该构成一个明显「竖长」的四边形，且不能太扁、不能自交
        let p0 = points[0], p1 = points[1], p2 = points[2], p3 = points[3]
        let topW = hypot(p1.x - p0.x, p1.y - p0.y)
        let bottomW = hypot(p2.x - p3.x, p2.y - p3.y)
        let leftH = hypot(p3.x - p0.x, p3.y - p0.y)
        let rightH = hypot(p2.x - p1.x, p2.y - p1.y)
        guard topW > 20, bottomW > 20, leftH > 20, rightH > 20 else { return false }
        // 上下宽度差异 < 35%，左右高度差异 < 35%
        let wRatio = min(topW, bottomW) / max(topW, bottomW)
        let hRatio = min(leftH, rightH) / max(leftH, rightH)
        if wRatio < 0.65 || hRatio < 0.65 { return false }
        // 中国象棋棋盘：高 / 宽 ≈ 9 / 8 = 1.125
        let aspect = ((leftH + rightH) / 2) / ((topW + bottomW) / 2)
        return aspect > 0.85 && aspect < 1.45
    }

    private var previewHint: String {
        if verdictGood {
            return "绿线和棋盘线条重合就点「完成」"
        }
        return "形状不对 · 请撤销重点（必须点棋格最外圈的交叉点）"
    }

    // MARK: - 坐标换算

    private func fittedRect(imageSize: CGSize, box: CGSize) -> CGRect {
        guard imageSize.width > 0, imageSize.height > 0 else { return .zero }
        let scale = min(box.width / imageSize.width, box.height / imageSize.height)
        let w = imageSize.width * scale
        let h = imageSize.height * scale
        return CGRect(x: (box.width - w) / 2, y: (box.height - h) / 2, width: w, height: h)
    }

    private func toView(_ p: CGPoint, imageSize: CGSize, box: CGSize) -> CGPoint {
        let r = fittedRect(imageSize: imageSize, box: box)
        guard imageSize.width > 0, imageSize.height > 0 else { return .zero }
        return CGPoint(x: r.minX + p.x / imageSize.width * r.width,
                       y: r.minY + p.y / imageSize.height * r.height)
    }

    private func handleTap(at loc: CGPoint, box: CGSize) {
        guard points.count < 4 else { return }
        guard let img = current?.image else { return }
        let r = fittedRect(imageSize: img.size, box: box)
        guard r.contains(loc) else {
            errorText = "点到画面外面了，请点在棋盘交叉点上"
            showError = true
            return
        }
        let nx = (loc.x - r.minX) / r.width
        let ny = (loc.y - r.minY) / r.height
        points.append(CGPoint(x: nx * img.size.width, y: ny * img.size.height))
    }
}
