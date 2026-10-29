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
    @State private var pickerTrigger = 0
    @State private var showCalibration = false
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

                    stepCard(num: "②", title: "校准棋盘",
                             desc: "先切到 JJ象棋 摆出完整棋盘，再回来点这里，在画面上按「左上→右上→右下→左下」点棋盘最外圈 4 个交叉点") {
                        Button {
                            if let blocker = model.calibrationBlocker() {
                                alertText = blocker
                                showAlert = true
                                return
                            }
                            showCalibration = true
                        } label: {
                            Label(model.calibrated ? "重新校准" : "点我校准",
                                  systemImage: "viewfinder")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(Color.blue.opacity(0.85))
                                .foregroundColor(.white)
                                .cornerRadius(10)
                        }

                        if model.calibrated {
                            Button("重新学习棋盘（画面停在标准开局时点）") {
                                model.forceRelearn()
                            }
                            .font(.footnote)
                            .padding(.top, 4)
                        }
                    }

                    stepCard(num: "③", title: "打开画中画浮窗",
                             desc: "浮窗飘在 JJ象棋 上面，可拖动、可双指缩放。拖到棋盘位置放大，就等于给棋盘加了标注") {
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
                if let img = model.lastImage {
                    CalibrationView(image: img) { pts in
                        model.applyCalibration(pts)
                        showCalibration = false
                    } onCancel: {
                        showCalibration = false
                    }
                } else {
                    Text("画面还没有准备好")
                        .onAppear { DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { showCalibration = false } }
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
            Text("通道诊断").font(.caption.bold()).foregroundColor(.secondary)
            row("后台接收", model.serverRunning ? "运行中 127.0.0.1:9527" : "已停止")
            row("录屏扩展", model.connected ? "已接入" : "未接入")
            row("心跳包", "\(model.heartbeats)" + (model.heartbeats > 0 ? "  (扩展活着)" : "  (扩展没发数据)"))
            row("收到帧数", "\(model.receivedFrames)")
            row("画面尺寸", model.frameSize == .zero ? "—" :
                "\(Int(model.frameSize.width)) × \(Int(model.frameSize.height))")
            row("音频保活", AudioKeepAlive.shared.isRunning ? "运行中" : "未运行")
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
