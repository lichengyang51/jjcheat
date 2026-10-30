//
//  AppModel.swift
//  JJCheatApp
//
//  照鹏飞象棋移动版 iOS 的交互来做：
//    照片（拍照 / 相册）→ 识别棋盘 → 引擎给出多候选着法 → 你自己走
//
//  鹏飞在 App Store 的官方说明写的是「可以拍照识别实体棋盘局面或者软件棋盘局面」，
//  所以它的 iOS 输入是照片、不是录屏。照片是原生分辨率、无损；
//  录屏走 YUV 420 + 降采样会把字形糊掉，兵种就会认错（实测：黑将认成炮）。
//

import Foundation
import SwiftUI
import UIKit

/// 一行候选着法（对应界面上「思考」表格的一行）
struct CandidateRow: Identifiable {
    let id = UUID()
    let chinese: String
    let move: String
    let score: Int
    let winrate: Double
    let depth: Int
    var note: String = ""
}

final class AppModel: ObservableObject {

    // MARK: - 盘面

    @Published var board: [Character?] = Array(repeating: nil, count: 90)
    @Published var redAtBottom: Bool = true

    // MARK: - 引擎输出

    @Published var rows: [CandidateRow] = []
    @Published var bestChinese: String = ""
    @Published var scoreText: String = ""
    @Published var winratePct: Double = 50
    @Published var depth: Int = 0
    @Published var nodes: Int = 0
    @Published var elapsed: Double = 0
    @Published var fromSq: Int = -1
    @Published var toSq: Int = -1

    // MARK: - 界面状态

    @Published var thinking = false
    @Published var demoProgress: Double = -1
    @Published var status: String = "点上排「拍照」或「相册」取一张棋盘照片"
    @Published var showCamera = false
    @Published var showLibrary = false
    @Published var showMenu = false
    @Published var showSettings = false
    @Published var tabIndex: Int = 0            // 0 思考 / 1 开局库 / 2 用时
    @Published var pickedKind: PieceKind? = nil
    /// 用户选的那张图（显示出来，选错图能当场看见）
    @Published var pickedImage: UIImage?
    @Published var editMode = false
    @Published var pasteAlert = false
    @Published var pasteText = ""

    /// 思考时长（秒），对应设置页的「局时」
    @Published var thinkSeconds: Double = 3.0
    /// 编辑模式：打开后点棋盘才会改子，平时点棋盘不动


    let buildTag: String = (Bundle.main.infoDictionary?["CFBundleVersion"] as? String) ?? "?"

    private var started = false

    /// 演示计时器
    private var demoTimer: Timer?

    // MARK: - 启动

    func bootstrap() {
        guard !started else { return }
        started = true
        _ = JJEngine.shared
        setBoardFromFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1")
        compute()
    }

    // MARK: - 识别

    func analyze(image: UIImage) {
        pickedImage = image
        thinking = true
        status = "识别中…（这步要几秒，别退出）"

        // 缩图 + 转换都放到后台队列，别卡界面
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            guard let rgba = ScreenshotReader.rgba(from: image) else {
                DispatchQueue.main.async {
                    self.thinking = false
                    self.status = "这张图读不出来，换一张试试"
                }
                return
            }
            DispatchQueue.main.async {
                self.status = "识别中… \(rgba.width)×\(rgba.height)"
            }
            guard let corners = JJEngine.shared.autoDetectBoard(pixels: rgba.data,
                                                               width: rgba.width,
                                                               height: rgba.height) else {
                DispatchQueue.main.async {
                    self.thinking = false
                    self.status = "没找到棋盘。让整块棋盘完整出现在照片里，四边留点空"
                }
                return
            }
            // ★ 每张新截图都从干净状态开始
            //   引擎里有「逐格保留上一稳定值」的机制，换一局（尤其残局只剩 4~6 子）
            //   上一局的棋子会被当成「本帧置信度低 → 沿用上一帧」，于是凭空多出車炮。
            //   先 reset 再识别，就不会串局。
            JJEngine.shared.reset(fen: nil)
            JJEngine.shared.setCorners(corners)
            var res: [String: Any]?
            for _ in 0..<3 {
                res = JJEngine.shared.process(pixels: rgba.data,
                                              width: rgba.width,
                                              height: rgba.height,
                                              timeMs: 1200)
            }
            let fenStr = (res?["fen"] as? String) ?? ""
            let mySide = (res?["mySide"] as? String) ?? "red"
            DispatchQueue.main.async {
                self.thinking = false
                guard !fenStr.isEmpty else {
                    self.status = "没认出盘面（棋盘定位失败）。可「编辑局面」摆子后点「立刻出招」"
                    return
                }
                self.setBoardFromFen(fenStr)
                self.redAtBottom = (mySide == "red")
                let n = self.board.compactMap { $0 }.count
                self.status = "识别完成 · \(n) 个子 · \(mySide == "red" ? "你执红" : "你执黑")"
                self.compute()
            }
        }
    }

    // MARK: - 计算（多候选）

    func compute() {
        guard !thinking else { return }
        thinking = true
        rows = []
        let full = fenFromBoard() + " " + (redAtBottom ? "w" : "b") + " - - 0 1"
        let ms = Int(max(0.4, thinkSeconds) * 1000)
        let t0 = Date()

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let res = JJEngine.shared.analyzeTop(fen: full, timeMs: ms, count: 8)
            let cost = Date().timeIntervalSince(t0)
            DispatchQueue.main.async {
                self.thinking = false
                self.elapsed = Double(JJEngine.int(res, "ms", Int(cost * 1000))) / 1000.0
                self.depth = JJEngine.int(res, "depth", 0)
                self.nodes = JJEngine.int(res, "nodes", 0)
                let best = JJEngine.str(res, "bestmove", "")
                let sc = JJEngine.int(res, "score", 0)
                self.scoreText = (sc >= 0 ? "+" : "") + "\(sc)"
                self.winratePct = JJEngine.double(res, "winrate", 50)

                var list: [CandidateRow] = []
                if let raw = res?["rows"] as? [[String: Any]] {
                    for r in raw {
                        list.append(CandidateRow(
                            chinese: (r["chinese"] as? String) ?? "",
                            move: (r["move"] as? String) ?? "",
                            score: (r["score"] as? Int) ?? Int((r["score"] as? Double) ?? 0),
                            winrate: ((r["winrate"] as? Double) ?? 0) * 100,
                            depth: (r["depth"] as? Int) ?? 0
                        ))
                    }
                }
                self.rows = list
                if let first = list.first {
                    self.bestChinese = first.chinese
                    self.fromSq = Self.sqOf(first.move, 0)
                    self.toSq = Self.sqOf(first.move, 1)
                } else {
                    self.bestChinese = best
                    self.fromSq = -1
                    self.toSq = -1
                }
            }
        }
    }

    /// ucci 串（如 b7c7）取第 idx 个格子（0=from,1=to）
    static func sqOf(_ ucci: String, _ idx: Int) -> Int {
        guard ucci.count >= 4 else { return -1 }
        let s = Array(ucci)
        let part = idx == 0 ? [s[0], s[1]] : [s[2], s[3]]
        guard let c = part[0].asciiValue, let r = part[1].wholeNumberValue else { return -1 }
        let col = Int(c) - 97
        guard col >= 0, col < 9, r >= 0, r < 10 else { return -1 }
        return r * 9 + col
    }

    // MARK: - 演示

    func playDemo() {
        demoTimer?.invalidate()
        guard fromSq >= 0, toSq >= 0 else { return }
        demoProgress = 0
        var t: Double = 0
        demoTimer = Timer.scheduledTimer(withTimeInterval: 0.03, repeats: true) { [weak self] timer in
            guard let self else { timer.invalidate(); return }
            t += 0.03 / 0.7
            if t >= 1 {
                timer.invalidate()
                self.demoProgress = -1
            } else {
                self.demoProgress = t
            }
        }
    }

    /// 点表格里的某一行 → 把箭头切成那一步
    func pickRow(_ row: CandidateRow) {
        bestChinese = row.chinese
        fromSq = Self.sqOf(row.move, 0)
        toSq = Self.sqOf(row.move, 1)
        playDemo()
    }

    /// 左右翻页：在候选着法之间走
    func demoStep(_ delta: Int) {
        guard !rows.isEmpty else { return }
        var cur = 0
        for (i, r) in rows.enumerated() where r.chinese == bestChinese {
            cur = i
            break
        }
        var next = cur + delta
        if next < 0 { next = 0 }
        if next >= rows.count { next = rows.count - 1 }
        pickRow(rows[next])
    }

    // MARK: - 编辑

    func tapSquare(_ sq: Int) {
        guard editMode else { return }          // 平时点棋盘不改任何东西，避免误擦
        guard sq >= 0, sq < 90 else { return }
        guard let kind = pickedKind else {
            board[sq] = nil
            return
        }
        board[sq] = redAtBottom
            ? Character(kind.rawValue.uppercased())
            : Character(kind.rawValue.lowercased())
    }

    func flip() {
        redAtBottom.toggle()
    }

    func restart() {
        setBoardFromFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1")
        compute()
    }

    func copyFen() -> String {
        UIPasteboard.general.string = fenFromBoard()
        status = "局面已复制"
        return fenFromBoard()
    }

    func pasteFen() {
        if let s = UIPasteboard.general.string, s.contains("/") {
            setBoardFromFen(s)
            compute()
            status = "已粘贴局面"
        } else {
            status = "剪贴板里没有局面字符串"
        }
    }

    // MARK: - FEN

    func setBoardFromFen(_ s: String) {
        var b: [Character?] = Array(repeating: nil, count: 90)
        let layout = s.split(separator: " ").first.map(String.init) ?? s
        let rowsArr = layout.split(separator: "/", omittingEmptySubsequences: false)
        if rowsArr.count == 10 {
            for r in 0..<10 {
                var c = 0
                for ch in rowsArr[r] {
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
    }

    func fenFromBoard() -> String {
        var out: [String] = []
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
            out.append(s)
        }
        return out.joined(separator: "/")
    }
}
