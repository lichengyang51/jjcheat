//
//  AppModel.swift
//  JJCheatApp
//
//  整个 App 就一件事：把一张棋盘照片（拍照，或相册里的截图）
//  变成「当前局面 + 该走哪一步」。
//
//  【为什么是这条架构】
//   鹏飞象棋移动版在 App Store 上的官方说明写的是
//   「可以拍照识别实体棋盘局面或者软件棋盘局面」——
//   它 iOS 版的输入是照片，不是录屏。
//
//   照片是原生分辨率、无损，颜色和清晰度都最好；
//   录屏（ReplayKit）走 YUV 420 + 降采样，色度细节只剩 1/4，
//   字形被糊掉，兵种就会认错（实测：黑将被认成炮）。
//   这条路还顺带省掉广播扩展、画中画、回环传帧、浮窗遮挡污染。
//

import Foundation
import SwiftUI
import UIKit

final class AppModel: ObservableObject {

    // MARK: - 对外状态

    @Published var board: [Character?] = Array(repeating: nil, count: 90)
    @Published var fen: String = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1"
    @Published var moveText: String = ""
    @Published var scoreText: String = ""
    @Published var winrate: Double = 50
    @Published var depth: Int = 0
    @Published var redAtBottom: Bool = true
    @Published var fromSq: Int = -1
    @Published var toSq: Int = -1
    @Published var status: String = "点「拍照」或「相册」，选一张棋盘照片"
    @Published var busy: Bool = false
    @Published var previewImage: UIImage?
    @Published var pickedKind: PieceKind? = nil
    @Published var showCamera = false
    @Published var showLibrary = false

    let buildTag: String = (Bundle.main.infoDictionary?["CFBundleVersion"] as? String) ?? "?"

    private var started = false

    // MARK: - 启动

    func bootstrap() {
        guard !started else { return }
        started = true
        _ = JJEngine.shared
        setBoardFromFen(fen)
    }

    // MARK: - 识别

    func analyze(image: UIImage) {
        guard let rgba = ScreenshotReader.rgba(from: image) else {
            status = "这张图读不出来，换一张试试"
            return
        }
        previewImage = image
        busy = true
        status = "识别中…（\(rgba.width)×\(rgba.height)）"

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }

            guard let corners = JJEngine.shared.autoDetectBoard(pixels: rgba.data,
                                                               width: rgba.width,
                                                               height: rgba.height) else {
                DispatchQueue.main.async {
                    self.busy = false
                    self.status = "没找到棋盘。让整块棋盘完整出现在照片里，四边留一点空"
                }
                return
            }
            JJEngine.shared.setCorners(corners)

            var res: [String: Any]?
            for _ in 0..<3 {
                res = JJEngine.shared.process(pixels: rgba.data,
                                              width: rgba.width,
                                              height: rgba.height,
                                              timeMs: 1500)
            }
            let fenStr = (res?["fen"] as? String) ?? ""
            let mySide = (res?["mySide"] as? String) ?? "red"

            DispatchQueue.main.async {
                self.busy = false
                guard !fenStr.isEmpty else {
                    self.status = "识别失败，可以手动摆子后点「计算」"
                    return
                }
                self.fen = fenStr
                self.redAtBottom = (mySide == "red")
                self.setBoardFromFen(fenStr)
                self.applyEngineResult(res)
                let n = self.board.compactMap { $0 }.count
                self.status = "识别完成 · 共 \(n) 个子 · \(mySide == "red" ? "你执红" : "你执黑") · 点格子可改错子"
            }
        }
    }

    /// 用当前盘面重新算一步
    func recompute() {
        busy = true
        status = "计算中…"
        let full = fenFromBoard() + " " + (redAtBottom ? "w" : "b") + " - - 0 1"
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let res = JJEngine.shared.analyzeFen(fen: full, timeMs: 3000)
            DispatchQueue.main.async {
                self.busy = false
                self.fen = full
                self.applyEngineResult(res)
                self.status = self.moveText.isEmpty ? "没算出着法，检查一下盘面" : "建议：\(self.moveText)"
            }
        }
    }

    private func applyEngineResult(_ res: [String: Any]?) {
        guard let res else { return }
        let cn = JJEngine.str(res, "chinese", JJEngine.str(res, "suggestChinese", ""))
        moveText = cn
        let sc = JJEngine.int(res, "score", 0)
        scoreText = (sc >= 0 ? "+" : "") + String(format: "%.2f", Double(sc) / 100.0)
        winrate = JJEngine.double(res, "winrate", 50)
        depth = JJEngine.int(res, "depth", 0)
        let f = JJEngine.int(res, "from", -1)
        let t = JJEngine.int(res, "to", -1)
        fromSq = (f >= 0 && f < 90) ? f : -1
        toSq = (t >= 0 && t < 90) ? t : -1
    }

    // MARK: - 手动纠错

    func tapSquare(_ sq: Int) {
        guard sq >= 0, sq < 90 else { return }
        guard let kind = pickedKind else {
            board[sq] = nil
            fen = fenFromBoard()
            return
        }
        let ch: Character = redAtBottom
            ? Character(kind.rawValue.uppercased())
            : Character(kind.rawValue.lowercased())
        board[sq] = ch
        fen = fenFromBoard()
    }

    func clearBoard() {
        board = Array(repeating: nil, count: 90)
        fen = fenFromBoard()
        moveText = ""
        scoreText = ""
        fromSq = -1
        toSq = -1
    }

    func resetToOpening() {
        setBoardFromFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1")
        moveText = ""
    }

    func toggleSide() {
        redAtBottom.toggle()
        recompute()
    }

    // MARK: - FEN 互转

    func setBoardFromFen(_ s: String) {
        var b: [Character?] = Array(repeating: nil, count: 90)
        let layout = s.split(separator: " ").first.map(String.init) ?? s
        let rows = layout.split(separator: "/", omittingEmptySubsequences: false)
        if rows.count == 10 {
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
        }
        board = b
        fen = s
    }

    func fenFromBoard() -> String {
        var rows: [String] = []
        for r in 0..<10 {
            var s = ""
            var empty = 0
            for c in 0..<9 {
                if let ch = board[r * 9 + c] {
                    if empty > 0 { s += String(empty); empty = 0 }
                    s.append(ch)
                } else {
                    empty += 1
                }
            }
            if empty > 0 { s += String(empty) }
            rows.append(s)
        }
        return rows.joined(separator: "/")
    }
}
