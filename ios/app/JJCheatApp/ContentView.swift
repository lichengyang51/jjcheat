//
//  ContentView.swift
//  JJCheatApp —— 主界面
//

import SwiftUI
import ReplayKit

// MARK: - 录屏启动按钮（包装 RPSystemBroadcastPickerView）

struct BroadcastPickerButton: UIViewRepresentable {

    let extensionID: String
    @Binding var trigger: Int

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var picker: RPSystemBroadcastPickerView?
        var lastTrigger = 0
    }

    func makeUIView(context: Context) -> UIView {
        let host = UIView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        host.backgroundColor = .clear

        let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 54, height: 54))
        picker.preferredExtension = extensionID
        picker.showsMicrophoneButton = false
        picker.backgroundColor = .clear
        for sub in picker.subviews {
            if let b = sub as? UIButton {
                b.setImage(nil, for: .normal)
                b.backgroundColor = .clear
            }
        }
        host.addSubview(picker)
        context.coordinator.picker = picker
        NSLog("[JJCheat] BroadcastPicker 使用扩展 id: %@", extensionID)
        return host
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        // 只在 trigger 真的变了才触发一次，避免每次重绘都弹录屏面板
        guard trigger != context.coordinator.lastTrigger else { return }
        context.coordinator.lastTrigger = trigger
        guard trigger > 0, let picker = context.coordinator.picker else { return }
        DispatchQueue.main.async {
            for sub in picker.subviews {
                if let b = sub as? UIButton {
                    b.sendActions(for: .allTouchEvents)
                    break
                }
            }
        }
    }
}

// MARK: - 主界面

struct ContentView: View {

    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase
    @State private var pickerTrigger = 0
    @State private var showCalibration = false
    @State private var calibFrames: [FrameSnapshot] = []
    @State private var anchorView = UIView()
    @State private var showAlert = false
    @State private var alertText = ""

    private var broadcastID: String { ExtensionInfo.broadcastBundleID }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {

                    statusBanner
                    diagCard

                    stepCard(num: "①", title: "开始录屏",
                             desc: "点下面的按钮 → 选「JJCheat 录屏」→ 点「开始直播」。录起来后顶部/灵动岛会有红点") {
                        Button {
                            pickerTrigger += 1
                        } label: {
                            Label("开始录屏", systemImage: "record.circle")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(Color.red.opacity(0.85))
                                .foregroundColor(.white)
                                .cornerRadius(10)
                        }
                        .overlay(
                            BroadcastPickerButton(extensionID: broadcastID,
                                                  trigger: $pickerTrigger)
                                .opacity(0.02)
                        )
                    }

                    stepCard(num: "②", title: "打开画中画",
                             desc: "浮窗会飘在 JJ象棋 上面。打开后切到 JJ象棋，点浮窗右上角的「校准」按钮就能校准，不用回这个 App") {
                        Button {
                            model.startPiP(sourceView: anchorView)
                        } label: {
                            Label(model.pipActive ? "浮窗已启动" : "打开画中画",
                                  systemImage: "pip")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(model.pipActive ? Color.green.opacity(0.85)
                                                            : Color.purple.opacity(0.85))
                                .foregroundColor(.white)
                                .cornerRadius(10)
                        }
                    }

                    stepCard(num: "③", title: "我执红还是执黑（自动识别）",
                             desc: "棋盘最下方那排永远是你这边，程序直接看那排棋子颜色判断，不用你选。识别结果：") {
                        HStack(spacing: 8) {
                            Text(model.mySide == "red" ? "🔴 我执红（先走）" : "⚫ 我执黑（后走）")
                                .font(.subheadline.bold())
                                .foregroundColor(model.mySide == "red" ? .red : .primary)
                            Spacer()
                            Text(model.isMyTurn ? "轮到我走" : "等对方走")
                                .font(.caption)
                                .foregroundColor(model.isMyTurn ? .green : .secondary)
                        }
                        .padding(.vertical, 4)
                    }

                    stepCard(num: "④", title: "兜底：手动校准",
                             desc: "浮窗上的自动校准失败时才用这个。在录屏画面上点棋盘最外圈 4 个交叉点") {
                        Button {
                            if let blocker = model.calibrationBlocker() {
                                alertText = blocker
                                showAlert = true
                                return
                            }
                            calibFrames = model.calibrationFrames()
                            if calibFrames.isEmpty {
                                alertText = "还没有可用画面，重开录屏再试。"
                                showAlert = true
                                return
                            }
                            showCalibration = true
                        } label: {
                            Label("手动校准", systemImage: "viewfinder")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(Color.blue.opacity(0.85))
                                .foregroundColor(.white)
                                .cornerRadius(10)
                        }

                        if model.calibrated {
                            Button("重置校准状态") {
                                model.resetCalibration()
                            }
                            .font(.footnote)
                            .padding(.top, 4)
                        }

                        // ★ 截图读盘（和鹏飞象棋 iOS 版同一条路）
                        //   在 JJ象棋 里截一张图，切回这里就自动出着法；
                        //   也可以点这个按钮手动再读一次。
                        VStack(alignment: .leading, spacing: 6) {
                            Button {
                                model.analyzeLatestScreenshot(manual: true)
                            } label: {
                                HStack {
                                    Image(systemName: "photo.on.rectangle.angled")
                                    Text("读最新截图，出着法")
                                        .fontWeight(.semibold)
                                    Spacer()
                                }
                                .padding(.vertical, 12)
                                .padding(.horizontal, 14)
                                .background(Color.green.opacity(0.85))
                                .foregroundColor(.white)
                                .cornerRadius(10)
                            }
                            Text("在 JJ象棋 里截一张图 → 切回本 App 会自动读；走子仍需你自己点（苹果不允许第三方 App 代替点击）")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                        .padding(.top, 8)
                    }

                    resultCard
                }
                .padding()
            }
            .navigationTitle("JJCheat 象棋辅助")
            .navigationBarTitleDisplayMode(.inline)
            .overlay(alignment: .topLeading) {
                AnchorView(view: $anchorView)
                    .frame(width: 1, height: 1)
                    .allowsHitTesting(false)
            }
            .alert("还差一步", isPresented: $showAlert) {
                Button("知道了", role: .cancel) { }
                Button("重新开始录屏") {
                    pickerTrigger += 1
                }
            } message: {
                Text(alertText)
            }
            .sheet(isPresented: $showCalibration) {
                CalibrationView(frames: calibFrames) { pts in
                    model.applyCalibration(pts)
                    showCalibration = false
                } onCancel: {
                    showCalibration = false
                }
            }
            // 从 JJ象棋 切回本 App 时，自动读最新截图并出着法
            // （iOS 16 只能用 onChange(of:perform:)）
            .onChange(of: scenePhase) { phase in
                if phase == .active {
                    model.analyzeLatestScreenshot(manual: false)
                }
            }
        }
    }

    // MARK: - 子视图

    private var statusBanner: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Circle()
                    .fill(model.connected ? Color.green : (model.serverRunning ? Color.orange : Color.red))
                    .frame(width: 9, height: 9)
                Text(model.connected ? "录屏已连接" : (model.serverRunning ? "通道就绪 · 等录屏接入" : "通道未启动"))
                    .font(.subheadline.bold())
                Spacer()
                Text("帧 \(model.receivedFrames)")
                    .font(.caption.monospacedDigit())
                    .foregroundColor(.secondary)
            }
            Text(model.status)
                .font(.footnote)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    /// 诊断卡：卡在哪一环一眼看穿
    private var diagCard: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text("通道诊断").font(.caption.bold()).foregroundColor(.secondary)
                Spacer()
                // 构建标记：每编译一次都不一样，用来确认装的是哪一版
                Text("构建 " + HUDTextView.buildTag)
                    .font(.caption2.monospacedDigit())
                    .foregroundColor(.blue)
            }
            row("后台接收", model.serverRunning ? "运行中 127.0.0.1:9527" : "已停止")
            row("录屏扩展", model.connected ? "已接入" : "未接入")
            row("启动心跳", model.startHB > 0 ? "\(model.startHB) 个  (扩展已启动)"
                                            : "0 个")
            row("定时心跳", model.timerHB > 0 ? "\(model.timerHB) 个  (扩展进程活着)"
                                            : "0 个")
            row("画面帧", "\(model.receivedFrames)" + (model.receivedFrames > 0 ? "  (系统在喂画面)"
                                                                    : "  (系统没喂画面)"))
            row("画面尺寸", model.frameSize == .zero ? "—" :
                "\(Int(model.frameSize.width)) × \(Int(model.frameSize.height))")
            row("历史帧", "\(model.frameHistory.count) 张  (校准可回翻)")
            row("扩展 ID", model.extID)
            if let t = model.lastFrameAt {
                row("最后收帧", t.formatted(date: .omitted, time: .standard))
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(k).font(.caption2).foregroundColor(.secondary).frame(width: 64, alignment: .leading)
            Text(v).font(.caption2.monospaced()).foregroundColor(.primary)
            Spacer(minLength: 0)
        }
    }

    private var resultCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(model.moveText.isEmpty ? "—" : model.moveText)
                    .font(.title2.bold())
                Spacer()
                Text(model.scoreText)
                    .font(.title3.monospacedDigit())
                    .foregroundColor(.red)
            }
            HStack {
                Text(String(format: "胜率 %.1f%%", model.winrate))
                    .font(.subheadline.monospacedDigit())
                Spacer()
                Text("深度 \(model.depth)")
                    .font(.subheadline.monospacedDigit())
                    .foregroundColor(.secondary)
            }
            ProgressView(value: max(0, min(100, model.winrate)), total: 100)
                .tint(.red)
            Text(model.detail)
                .font(.caption2.monospaced())
                .foregroundColor(.secondary)
                .lineLimit(2)
            Text(model.fen)
                .font(.caption2.monospaced())
                .foregroundColor(.secondary)
                .lineLimit(2)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }

    private func stepCard<C: View>(num: String, title: String, desc: String,
                                   @ViewBuilder content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(num).font(.headline).foregroundColor(.accentColor)
                Text(title).font(.headline)
            }
            Text(desc).font(.caption).foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            content()
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}

// MARK: - 给 PiP 用的锚点视图

struct AnchorView: UIViewRepresentable {

    @Binding var view: UIView

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var installed = false
    }

    func makeUIView(context: Context) -> UIView {
        let v = UIView()
        v.backgroundColor = .clear
        DispatchQueue.main.async { self.view = v }
        return v
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        guard !context.coordinator.installed else { return }
        context.coordinator.installed = true
        DispatchQueue.main.async { self.view = uiView }
    }
}
