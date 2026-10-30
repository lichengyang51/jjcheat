//
//  ContentView.swift
//  JJCheatApp
//
//  单屏：拍照 / 相册 → 认出盘面 → 给着法 → 你自己走。
//  结构照着鹏飞象棋移动版 iOS 的思路来（它的输入是照片，不是录屏）。
//

import SwiftUI

struct ContentView: View {

    @StateObject private var model = AppModel()

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 12) {

                    // ---- 着法卡片 ----
                    moveCard

                    // ---- 棋盘 ----
                    BoardEditorView(
                        board: $model.board,
                        selected: model.pickedKind,
                        redAtBottom: model.redAtBottom,
                        highlightFrom: model.fromSq,
                        highlightTo: model.toSq
                    ) { sq in
                        model.tapSquare(sq)
                    }
                    .frame(height: 400)
                    .background(Color.black.opacity(0.04))
                    .cornerRadius(10)

                    // ---- 取图按钮 ----
                    HStack(spacing: 10) {
                        Button {
                            model.showCamera = true
                        } label: {
                            Label("拍照", systemImage: "camera.fill")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.blue)
                                .foregroundColor(.white)
                                .cornerRadius(10)
                        }
                        Button {
                            model.showLibrary = true
                        } label: {
                            Label("相册", systemImage: "photo.on.rectangle")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.green)
                                .foregroundColor(.white)
                                .cornerRadius(10)
                        }
                    }

                    // ---- 摆子（改错子）----
                    piecePicker

                    // ---- 操作 ----
                    HStack(spacing: 10) {
                        Button("计算这步") { model.recompute() }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color.orange)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                        Button(model.redAtBottom ? "我执红" : "我执黑") { model.toggleSide() }
                            .padding(.vertical, 12)
                            .padding(.horizontal, 12)
                            .background(Color.gray.opacity(0.25))
                            .cornerRadius(10)
                    }

                    HStack(spacing: 10) {
                        Button("清空盘面") { model.clearBoard() }
                            .font(.footnote)
                        Button("回到开局") { model.resetToOpening() }
                            .font(.footnote)
                        Spacer()
                        Text("构建 \(model.buildTag)")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }

                    // ---- 状态 ----
                    Text(model.status)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Text(model.fen)
                        .font(.caption2.monospaced())
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding()
            }
            .navigationTitle("象棋强软")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { model.bootstrap() }
            .sheet(isPresented: $model.showCamera) {
                ImagePicker(source: .camera) { img in
                    model.showCamera = false
                    model.analyze(image: img)
                } onCancel: {
                    model.showCamera = false
                }
            }
            .sheet(isPresented: $model.showLibrary) {
                ImagePicker(source: .library) { img in
                    model.showLibrary = false
                    model.analyze(image: img)
                } onCancel: {
                    model.showLibrary = false
                }
            }
        }
        .navigationViewStyle(.stack)
    }

    // MARK: - 着法卡片

    private var moveCard: some View {
        VStack(spacing: 6) {
            Text(model.moveText.isEmpty ? "—" : model.moveText)
                .font(.system(size: 44, weight: .heavy))
                .foregroundColor(model.moveText.isEmpty ? .secondary : Color(red: 0.85, green: 0.15, blue: 0.15))
                .minimumScaleFactor(0.5)
                .lineLimit(1)

            HStack(spacing: 14) {
                Text(model.scoreText.isEmpty ? "—" : model.scoreText)
                Text("深度 \(model.depth)")
                Text(String(format: "胜率 %.0f%%", model.winrate))
                if model.busy {
                    ProgressView().scaleEffect(0.7)
                }
            }
            .font(.footnote.monospacedDigit())
            .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(Color.yellow.opacity(0.15))
        .cornerRadius(10)
    }

    // MARK: - 摆子选择

    private var piecePicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("点格子可改错子：先选棋种，再点棋盘；选「擦除」再点就清空该格")
                .font(.caption2)
                .foregroundColor(.secondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Button {
                        model.pickedKind = nil
                    } label: {
                        Text("擦除")
                            .font(.footnote.bold())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(model.pickedKind == nil ? Color.red.opacity(0.85) : Color.gray.opacity(0.2))
                            .foregroundColor(model.pickedKind == nil ? .white : .primary)
                            .cornerRadius(8)
                    }
                    ForEach(PieceKind.allCases) { kind in
                        Button {
                            model.pickedKind = kind
                        } label: {
                            Text(kind.cn)
                                .font(.footnote.bold())
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(model.pickedKind == kind ? Color.blue.opacity(0.85) : Color.gray.opacity(0.2))
                                .foregroundColor(model.pickedKind == kind ? .white : .primary)
                                .cornerRadius(8)
                        }
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
