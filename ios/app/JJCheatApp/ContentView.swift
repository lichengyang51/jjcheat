//
//  ContentView.swift
//  JJCheatApp
//
//  照鹏飞象棋移动版 iOS 的主界面复刻：
//    顶栏（☰ + 四个棋子按钮 + 左右翻页）
//    → 棋盘
//    → 状态行（深度 / 己方得分 / 秒 / nps / 演示 / 着法）
//    → 思考 · 开局库 · 用时 三个标签 + 候选着法表
//    → 一排引擎管理按钮
//    → 左侧抽屉菜单 / 设置页
//

import SwiftUI

struct ContentView: View {

    @StateObject private var model = AppModel()

    var body: some View {
        ZStack(alignment: .leading) {
            VStack(spacing: 0) {
                topBar
                ChessBoardView(
                    board: $model.board,
                    redAtBottom: model.redAtBottom,
                    fromSq: model.fromSq,
                    toSq: model.toSq,
                    demoProgress: model.demoProgress,
                    onTap: { sq in model.tapSquare(sq) }
                )
                .aspectRatio(8.0 / 9.0, contentMode: .fit)
                .padding(.horizontal, 4)

                // 你选的那张图（缩略）：选错图当场就能看出来
                if let img = model.pickedImage {
                    HStack(alignment: .top, spacing: 8) {
                        Image(uiImage: img)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(height: 54)
                            .cornerRadius(4)
                        Text("上面这张就是刚识别的图")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                }
                // 识别/操作状态（显眼一点，别缩在页面最底下）
                HStack(spacing: 8) {
                    Circle()
                        .fill(model.thinking ? Color.orange : Color.green)
                        .frame(width: 7, height: 7)
                    Text(model.status)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.black.opacity(0.8))
                        .lineLimit(2)
                    Spacer(minLength: 0)
                    if model.pickedImage != nil && !model.evConf.isEmpty {
                        Button {
                            model.showEvidence = true
                        } label: {
                            Text("识别留证")
                                .font(.system(size: 11, weight: .semibold))
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(Color.blue.opacity(0.85))
                                .foregroundColor(.white)
                                .cornerRadius(6)
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(model.thinking ? Color.orange.opacity(0.14) : Color.green.opacity(0.12))
                statusLine
                tabBar
                engineToolbar
                Divider()
                piecePicker
                candidateTable
                Spacer(minLength: 0)
            }
            .background(Color(red: 0.97, green: 0.96, blue: 0.93))
            .disabled(model.showMenu)

            if model.showMenu {
                Color.black.opacity(0.28)
                    .ignoresSafeArea()
                    .onTapGesture { withAnimation { model.showMenu = false } }
                    .transition(.opacity)
            }
            if model.showMenu {
                drawer
                    .transition(.move(edge: .leading))
            }
        }
        .animation(.easeOut(duration: 0.2), value: model.showMenu)
        .onAppear { model.bootstrap() }
        .sheet(isPresented: $model.showCamera) {
            ImagePicker(source: .camera) { img in
                model.showCamera = false
                model.analyze(image: img)
            } onCancel: { model.showCamera = false }
        }
        .sheet(isPresented: $model.showLibrary) {
            ImagePicker(source: .library) { img in
                model.showLibrary = false
                model.analyze(image: img)
            } onCancel: { model.showLibrary = false }
        }
        .sheet(isPresented: $model.showSettings) {
            SettingsView(model: model)
        }
        .sheet(isPresented: $model.showEvidence) {
            if let img = model.pickedImage {
                EvidenceView(image: img,
                             corners: model.evCorners,
                             imgW: model.evImgW,
                             imgH: model.evImgH,
                             chars: model.evChars,
                             conf: model.evConf,
                             tops: model.evTops)
            }
        }
    }

    // MARK: - 顶栏

    private var topBar: some View {
        HStack(spacing: 14) {
            Button {
                withAnimation { model.showMenu = true }
            } label: {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.black)
            }

            Spacer(minLength: 6)

            // 四个棋子按钮（照它的顶栏：車 相 士 帥 / 車）
            Button { model.showCamera = true } label: {
                topPiece("车", red: true)
            }
            Button { model.showLibrary = true } label: {
                topPiece("相", red: true)
            }
            Button { model.flip() } label: {
                topPiece("士", red: true)
            }
            Button { model.showSettings = true } label: {
                topPiece("帅", red: true)
            }

            Spacer(minLength: 6)

            Button { model.demoStep(-1) } label: {
                Image(systemName: "chevron.left").foregroundColor(.gray)
            }
            Button { model.demoStep(1) } label: {
                Image(systemName: "chevron.right").foregroundColor(.gray)
            }

            Button { model.playDemo() } label: {
                topPiece("车", red: false)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color.white)
    }

    private func topPiece(_ s: String, red: Bool) -> some View {
        Text(s)
            .font(.system(size: 15, weight: .bold))
            .foregroundColor(.white)
            .frame(width: 30, height: 30)
            .background(red ? Color(red: 0.72, green: 0.13, blue: 0.11)
                            : Color(red: 0.13, green: 0.13, blue: 0.15))
            .clipShape(Circle())
    }

    // MARK: - 状态行

    private var statusLine: some View {
        HStack(spacing: 10) {
            Text("深度: \(model.depth)")
            Text("己方得分: \(model.scoreText.isEmpty ? "—" : model.scoreText)")
            Text(String(format: "%.1f 秒", model.elapsed))
            Text("nps: \(npsText)")
            Text(model.thinking ? "思考中" : "演示")
                .foregroundColor(model.thinking ? .orange : .blue)
            if !model.bestChinese.isEmpty {
                Button { model.playDemo() } label: {
                    Text(model.bestChinese).underline()
                }
            }
            if model.thinking { ProgressView().scaleEffect(0.6) }
            Spacer(minLength: 0)
        }
        .font(.system(size: 11, weight: .medium).monospacedDigit())
        .foregroundColor(.black.opacity(0.75))
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Color(red: 0.90, green: 0.93, blue: 0.96))
    }

    private var npsText: String {
        guard model.elapsed > 0.05 else { return "—" }
        let k = Double(model.nodes) / model.elapsed / 1000.0
        return String(format: "%.0fK", k)
    }

    // MARK: - 标签栏

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(["思考", "开局库", "用时"].indices, id: \.self) { i in
                Button {
                    model.tabIndex = i
                } label: {
                    Text(["思考", "开局库", "用时"][i])
                        .font(.system(size: 13, weight: model.tabIndex == i ? .semibold : .regular))
                        .foregroundColor(model.tabIndex == i ? .red : .secondary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(model.tabIndex == i ? Color.white : Color.clear)
                }
            }
            Image(systemName: "plus").font(.system(size: 12)).foregroundColor(.secondary)
                .padding(.leading, 8)
            Spacer()
            Button { model.compute() } label: {
                Label("立刻出招", systemImage: "bolt.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.orange.opacity(0.9))
                    .foregroundColor(.white)
                    .cornerRadius(6)
            }
            .padding(.trailing, 8)
        }
        .background(Color(red: 0.94, green: 0.92, blue: 0.88))
    }

    // MARK: - 引擎工具条

    private var engineToolbar: some View {
        HStack(spacing: 8) {
            Text("添加引擎").font(.system(size: 11)).foregroundColor(.blue)
            Text("引擎管理").font(.system(size: 11)).foregroundColor(.blue)
            Text("多引擎策略").font(.system(size: 11)).foregroundColor(.blue)
            Spacer()
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.white)
    }

    // MARK: - 摆子（改错子）

    private var piecePicker: some View {
        HStack(spacing: 6) {
            Button {
                model.editMode.toggle()
            } label: {
                Text(model.editMode ? "退出编辑" : "编辑局面")
                    .font(.system(size: 11, weight: .semibold))
                    .padding(.horizontal, 8).padding(.vertical, 5)
                    .background(model.editMode ? Color.red.opacity(0.85) : Color.gray.opacity(0.2))
                    .foregroundColor(model.editMode ? .white : .primary)
                    .cornerRadius(6)
            }
            if model.editMode {
                Button {
                    model.pickedKind = nil
                } label: {
                    Text("擦")
                        .font(.system(size: 11, weight: .bold))
                        .padding(.horizontal, 8).padding(.vertical, 5)
                        .background(model.pickedKind == nil ? Color.red.opacity(0.85) : Color.gray.opacity(0.2))
                        .foregroundColor(model.pickedKind == nil ? .white : .primary)
                        .cornerRadius(6)
                }
                ForEach(PieceKind.allCases) { k in
                    Button {
                        model.pickedKind = k
                    } label: {
                        Text(k.cn)
                            .font(.system(size: 11, weight: .bold))
                            .padding(.horizontal, 8).padding(.vertical, 5)
                            .background(model.pickedKind == k ? Color.blue.opacity(0.85) : Color.gray.opacity(0.2))
                            .foregroundColor(model.pickedKind == k ? .white : .primary)
                            .cornerRadius(6)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
    }
    // MARK: - 候选着法表

    private var candidateTable: some View {
        VStack(spacing: 0) {
            HStack {
                Text("招法").frame(width: 74, alignment: .leading)
                Text("分数").frame(width: 46, alignment: .leading)
                Text("胜率").frame(width: 56, alignment: .leading)
                Text("注释").frame(maxWidth: .infinity, alignment: .leading)
            }
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(.secondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)

            Divider()

            ScrollView {
                LazyVStack(spacing: 0) {
                    if model.tabIndex == 0 {
                        ForEach(Array(model.rows.enumerated()), id: \.element.id) { idx, row in
                            Button {
                                model.pickRow(row)
                            } label: {
                                HStack {
                                    Text(row.chinese).frame(width: 74, alignment: .leading)
                                    Text("\(row.score)").frame(width: 46, alignment: .leading)
                                    Text(String(format: "%.4f", row.winrate / 100))
                                        .frame(width: 56, alignment: .leading)
                                    Text(idx == 0 ? "最佳" : "").frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .font(.system(size: 12).monospacedDigit())
                                .foregroundColor(idx == 0 ? .primary : .secondary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(idx == 0 ? Color.yellow.opacity(0.18) : Color.clear)
                            }
                        }
                    } else if model.tabIndex == 1 {
                        Text("开局库：本机未装开局库，用引擎直接算")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                            .padding(12)
                    } else {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("局时 \(String(format: "%.1f", model.thinkSeconds)) 秒/步")
                            Slider(value: $model.thinkSeconds, in: 0.5...15, step: 0.5)
                            Text("构建 \(model.buildTag)")
                                .font(.system(size: 10))
                                .foregroundColor(.secondary)
                        }
                        .font(.system(size: 12))
                        .padding(12)
                    }
                }
            }
        }
        .background(Color.white)
    }

    // MARK: - 左侧抽屉

    private var drawer: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("象棋强软").font(.system(size: 15, weight: .bold))
                Spacer()
                Button { withAnimation { model.showMenu = false } } label: {
                    Image(systemName: "xmark").foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 52)
            .padding(.bottom, 10)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    menuItem("棋盘棋子样式") {}
                    menuItem("设置") { model.showSettings = true }
                    menuItem("工具栏") {}
                    menuItem("对局记录") {}
                    menuItem("打开棋谱") { model.showLibrary = true }
                    menuItem("保存棋谱") {}
                    menuItem("编辑局面") { model.editMode.toggle() }
                    menuItem("拍照识别局面") { model.showCamera = true }
                    menuItem("复制局面") { _ = model.copyFen() }
                    menuItem("粘贴局面") { model.pasteFen() }
                    menuItem("重新开始") { model.restart() }
                    menuItem("上下翻转棋盘（红方在上）") { model.flip() }
                    menuItem("立刻出招") { model.compute() }
                    menuItem("关于") {}
                }
            }
            Spacer()
            Text("构建 \(model.buildTag)")
                .font(.system(size: 10))
                .foregroundColor(.secondary)
                .padding(14)
        }
        .frame(width: 260)
        .background(Color.white)
        .ignoresSafeArea(edges: .vertical)
    }

    private func menuItem(_ title: String, _ action: @escaping () -> Void) -> some View {
        Button {
            withAnimation { model.showMenu = false }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { action() }
        } label: {
            HStack {
                Text(title).font(.system(size: 14)).foregroundColor(.primary)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary.opacity(0.5))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - 设置页（照它的「添加/删除引擎」）

struct SettingsView: View {
    @ObservedObject var model: AppModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("难度设置")) {
                    HStack {
                        Text("难度类型")
                        Spacer()
                        Text("局时").foregroundColor(.secondary)
                    }
                    HStack {
                        Text("每步思考时长")
                        Spacer()
                        Text(String(format: "%.1f 秒", model.thinkSeconds))
                            .foregroundColor(.secondary)
                    }
                    Slider(value: $model.thinkSeconds, in: 0.5...15, step: 0.5)
                    HStack {
                        Text("网络延迟")
                        Spacer()
                        Text("0 毫秒（本地引擎）").foregroundColor(.secondary)
                    }
                }
                Section {
                    Label("后台思考在这种实现下不需要：出招是点「立刻出招」触发的", systemImage: "info.circle")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
                Section {
                    HStack {
                        Text("引擎")
                        Spacer()
                        Text("本地 JavaScript 引擎").foregroundColor(.secondary)
                    }
                    HStack {
                        Text("构建")
                        Spacer()
                        Text(model.buildTag).foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("引擎设置")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") {
                        dismiss()
                        model.compute()
                    }
                }
            }
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
