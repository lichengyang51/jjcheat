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
import Photos

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

    // ---- 识别留证 ----
    @Published var showEvidence = false
    @Published var evCorners: [[Double]] = []
    @Published var evChars: [Character] = Array(repeating: Character("."), count: 90)
    @Published var evConf: [Double] = []
    @Published var evTops: [[Int]] = []
    @Published var evImgW: Int = 0
    @Published var evImgH: Int = 0
    @Published var editMode = false
    @Published var pasteAlert = false
    @Published var pasteText = ""

    /// 思考时长（秒），对应设置页的「局时」
    @Published var thinkSeconds: Double = 3.0
    /// 画中画浮窗是否开着
    @Published var pipActive = false
    /// 当前局面分数（数值，浮窗要显示「分数: N」）
    @Published var scoreValue: Int = 0
    /// 浮窗在上一张截图里盖住了几格（引擎按洋红边框算出来的）
    @Published var pipCells: Int = 0
    /// 实时模式（录屏 + 浮窗）是否开着
    @Published var liveActive = false
    /// 实时模式的帧率/耗时（显示用）
    @Published var liveInfo: String = ""
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

    /// 直接拿相册里最新一张「截图」来分析
    ///
    /// 为什么做这个：原来的流程是「截图 → 打开 App → 选图 → 相册 → 翻到那张 → 选」，
    /// 每走一步棋都要重复四下手势。截图本来就躺在相册最前面，
    /// 这里直接取最新的一张（优先取 mediaSubtype == 截图），一下就到着法。
    func analyzeLatestScreenshot() {
        let go: () -> Void = { [weak self] in
            guard let self else { return }
            let opts = PHFetchOptions()
            opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
            opts.fetchLimit = 60
            let assets = PHAsset.fetchAssets(with: .image, options: opts)
            var picked: PHAsset?
            assets.enumerateObjects { a, _, stop in
                if a.mediaSubtypes.contains(.photoScreenshot) { picked = a; stop.pointee = true }
            }
            if picked == nil { picked = assets.firstObject }
            guard let asset = picked else {
                DispatchQueue.main.async { self.status = "相册里还没有截图" }
                return
            }
            DispatchQueue.main.async { self.status = "读取最新截图…" }
            let req = PHImageRequestOptions()
            req.deliveryMode = .highQualityFormat
            req.isNetworkAccessAllowed = true
            PHImageManager.default().requestImageDataAndOrientation(for: asset, options: req) { data, _, _, _ in
                guard let data, let img = UIImage(data: data) else {
                    DispatchQueue.main.async { self.status = "这张截图读不出来，改用「选图」" }
                    return
                }
                DispatchQueue.main.async { self.analyze(image: img) }
            }
        }

        let st = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        if st == .notDetermined {
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { s in
                DispatchQueue.main.async {
                    if s == .authorized || s == .limited {
                        go()
                    } else {
                        self.status = "没有相册权限：去「设置 → 象棋强软 → 照片」打开，或者用选图"
                    }
                }
            }
        } else if st == .authorized || st == .limited {
            go()
        } else {
            status = "没有相册权限：去「设置 → 象棋强软 → 照片」打开，或者用选图"
        }
    }

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
            // ★ 截图是静止的，不用连喂 3 帧
            //
            //   以前这里是 for _ in 0..<3 每帧都带 1200ms 搜索 —— 那是给
            //   实时抓屏用的「多帧求稳」，对一张静态截图毫无意义：
            //   3 次识别(约 300ms) + 3 次搜索(3.6s) 全是白烧的，
            //   其中两次的搜索结果还被下面 compute() 覆盖掉。
            //   现在只喂 1 帧、搜索时间给到最小，真正的深算交给 compute()。
            //   实测一张图从「几秒」降到 1 秒出头。
            let res: [String: Any]? = JJEngine.shared.process(pixels: rgba.data,
                                                             width: rgba.width,
                                                             height: rgba.height,
                                                             timeMs: 200)
            let fenStr = (res?["fen"] as? String) ?? ""
            let mySide = (res?["mySide"] as? String) ?? "red"

            // 留证数据：四角 / 每格字符 / 置信度 / 候选
            let conf90: [Double] = (res?["conf90"] as? [Any])?.map { item in
                (item as? Double) ?? Double((item as? Int) ?? 0)
            } ?? []
            var tops90: [[Int]] = []
            if let raw90 = res?["tops90"] as? [Any] {
                for item in raw90 {
                    if let arr = item as? [Any] {
                        tops90.append(arr.map { v in Int((v as? Double) ?? Double((v as? Int) ?? 0)) })
                    } else {
                        tops90.append([])
                    }
                }
            }
            DispatchQueue.main.async {
                self.thinking = false
                guard !fenStr.isEmpty else {
                    self.status = "没认出盘面（棋盘定位失败）。可「编辑局面」摆子后点「立刻出招」"
                    return
                }
                // ★ 盘面一律用「引擎坐标」（红永远在下），不要用屏幕坐标
                //
                //   之前这里灌的是屏幕原样的 FEN，而棋子绘制/箭头/「立刻出招」
                //   各自按不同方式换算，执黑时三套坐标系对不上：
                //   小棋盘画成左右镜像、蓝色箭头指到镜子里的格子、
                //   点「立刻出招」算的是一个镜像假局面。
                //   现在统一成引擎坐标：board[] 就是红在下、棋盘旋转 180 度后的局面，
                //   画的时候按 redAtBottom 再转回去（见 ChessBoardView.center），
                //   fenFromBoard() 出来的就是能直接喂给引擎的 FEN。
                let engineFen = (res?["engineFen"] as? String) ?? fenStr
                self.setBoardFromFen(engineFen)
                self.redAtBottom = (mySide == "red")
                self.pipCells = JJEngine.int(res, "pipOverlap", 0)
                self.refreshPanel()
                if let cornersArr = res?["corners"] as? [[Double]] {
                    self.evCorners = cornersArr
                } else {
                    self.evCorners = corners
                }
                // 留证页用的是「截图原样」的格子（因为它裁的就是截图里的像素），
                // 所以这里必须用屏幕坐标解析一份，不能拿引擎坐标的 board 去对。
                self.evChars = Self.parseFenChars(fenStr).map { $0 ?? Character(".") }
                self.evConf = conf90
                self.evTops = tops90
                self.evImgW = rgba.width
                self.evImgH = rgba.height
                let n = self.board.compactMap { $0 }.count
                self.status = "识别完成 · \(n) 个子 · \(mySide == "red" ? "你执红" : "你执黑")"
                self.compute()
            }
        }
    }

    // MARK: - 计算（多候选）

    /// - Parameter limitSeconds: 实时模式下用它把思考时间压短（否则 3 秒一帧太慢）
    func compute(limitSeconds: Double? = nil) {
        guard !thinking else { return }
        thinking = true
        rows = []
        let full = fenFromBoard() + " " + (redAtBottom ? "w" : "b") + " - - 0 1"
        let budget = limitSeconds ?? thinkSeconds
        let ms = Int(max(0.4, budget) * 1000)
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
                // 杀棋分（±30000 上下）直接写「绝杀 / 被绝杀」，
                // 原来显示 -29999 这种数字，看着像程序坏了。
                if sc > 29000 {
                    self.scoreText = "绝杀(我方赢)"
                } else if sc < -29000 {
                    self.scoreText = "被绝杀(我方被将死)"
                } else {
                    self.scoreText = (sc >= 0 ? "+" : "") + "\(sc)"
                }
                self.winratePct = JJEngine.double(res, "winrate", 50)
                self.scoreValue = sc

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
                self.refreshPanel()
            }
        }
    }

    // MARK: - 画中画浮窗（鹏飞式小窗）

    private var lastLiveAnalyze = Date.distantPast
    private var pipAnchor: UIView?

    func setPipAnchor(_ v: UIView) { pipAnchor = v }

    /// 「连接悬浮窗」：鹏飞那一套的三步合成一个按钮
    ///
    ///   ① 开浮窗（画中画）—— 浮在 JJ象棋 上面，可以拖动、可以缩放
    ///   ② 起帧服务器（127.0.0.1:9527）—— 等录屏扩展把画面送进来
    ///   ③ 弹系统录屏面板 —— 你点「开始直播/录屏」，浮窗里的棋盘就开始跟着棋局走
    func connectFloating() {
        if liveActive {
            stopFloating()
            return
        }
        LiveEngine.shared.onResult = { [weak self] res in self?.applyLive(res) }
        LiveEngine.shared.onStats = { [weak self] seen, ms, size in
            guard let self else { return }
            self.liveInfo = "\(seen) 帧 · \(ms)ms · \(Int(size.width))×\(Int(size.height))"
        }
        LiveEngine.shared.start()
        liveActive = true
        AudioKeepAlive.shared.start()
        if !PiPController.shared.isActive { toggleFloatingPanel() }
        // 先让浮窗动画起来，再弹录屏面板 —— 两个系统弹窗挤在同一帧会互相打断
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            BroadcastPickerHolder.shared.trigger()
        }
        status = "浮窗已开 · 在系统面板里点「开始直播」，浮窗会跟着棋局实时更新"
    }

    func stopFloating() {
        LiveEngine.shared.stop()
        liveActive = false
        liveInfo = ""
        AudioKeepAlive.shared.stop()
        PiPController.shared.stop()
        pipActive = false
        status = "浮窗已关"
    }

    /// 实时帧的识别结果直接推到界面和浮窗
    private func applyLive(_ res: [String: Any]) {
        let engineFen = (res["engineFen"] as? String) ?? ""
        let rawFen = (res["fen"] as? String) ?? ""
        guard !engineFen.isEmpty || !rawFen.isEmpty else { return }
        if !engineFen.isEmpty {
            setBoardFromFen(engineFen)
        }
        redAtBottom = ((res["mySide"] as? String) ?? "red") == "red"
        pipCells = JJEngine.int(res, "pipOverlap", 0)

        let move = JJEngine.str(res, "suggestChinese", "")
        if !move.isEmpty { bestChinese = move }
        fromSq = JJEngine.int(res, "from", -1)
        toSq = JJEngine.int(res, "to", -1)
        let sc = JJEngine.int(res, "score", 0)
        if sc > 29000 {
            scoreText = "绝杀(我方赢)"
        } else if sc < -29000 {
            scoreText = "被绝杀(我方被将死)"
        } else {
            scoreText = (sc >= 0 ? "+" : "") + "\(sc)"
        }
        winratePct = JJEngine.double(res, "winrate", 50)
        depth = JJEngine.int(res, "depth", 0)
        status = "实时 · \(liveInfo) · \(redAtBottom ? "你执红" : "你执黑")"

        // 浮窗右边要显示「深度 / 用时 / 分数 / 3 个候选着法」，
        // 这些必须真的搜一次才有 —— process 只给一个着法。
        // 1.2 秒最多搜一次，不然每帧都搜会把识别挤掉。
        let now = Date()
        if now.timeIntervalSince(lastLiveAnalyze) > 1.2 {
            lastLiveAnalyze = now
            compute(limitSeconds: 0.8)
        }
        _ = rawFen
        refreshPanel()
    }

    /// 开/关浮窗
    func toggleFloatingPanel() {
        if PiPController.shared.isActive {
            PiPController.shared.stop()
            pipActive = false
            status = "浮窗已关"
            return
        }
        let anchor: UIView? = pipAnchor ?? UIApplication.shared.connectedScenes
            .compactMap { ($0 as? UIWindowScene)?.keyWindow?.rootViewController?.view }
            .first
        guard let anchor else {
            status = "拿不到挂浮窗的视图，重开一下 App 再试"
            return
        }
        PiPController.shared.onStateChange = { [weak self] active, err in
            guard let self else { return }
            self.pipActive = active
            if let err {
                self.status = "浮窗没起来：\(err)"
            } else if active {
                self.status = "浮窗已开 · 回 JJ象棋，用「最新截图」出招"
            }
        }
        refreshPanel()
        PiPController.shared.start(sourceView: anchor)
        pipActive = true
    }

    /// 把当前结论推到浮窗
    ///
    /// 版式照鹏飞：右边四行「深度 / 用时 / 分数 / 候选着法」。
    func refreshPanel() {
        guard PiPController.shared.isActive else { return }
        let hint: String = pipCells > 0 ? "浮窗挡住 \(pipCells) 格，往边上拖" : ""
        var mv = rows.prefix(3).map { $0.chinese }.filter { !$0.isEmpty }
        if mv.isEmpty && !bestChinese.isEmpty { mv = [bestChinese] }
        if mv.isEmpty {
            PiPController.shared.waiting(liveActive ? "正在识别" : "等一张截图")
            return
        }
        PiPController.shared.update(
            fen: panelFen(),
            arrowFrom: panelMap(fromSq),
            arrowTo: panelMap(toSq),
            depth: depth,
            secs: elapsed,
            score: scoreValue,
            moves: mv,
            hint: hint
        )
    }

    /// 你执黑时浮窗里的小棋盘也要转过来（自己的子在下），不然看着别扭
    private func panelMap(_ sq: Int) -> Int {
        guard sq >= 0, sq < 90, !redAtBottom else { return sq }
        let r = sq / 9, c = sq % 9
        return (9 - r) * 9 + (8 - c)
    }

    private func panelFen() -> String {
        var rows: [String] = []
        for r in 0..<10 {
            var s = ""
            var empty = 0
            for c in 0..<9 {
                let src = redAtBottom ? (r * 9 + c) : ((9 - r) * 9 + (8 - c))
                if let ch = board[src] {
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
        board = Self.parseFenChars(s)
    }

    /// 把 FEN 的棋盘段解析成 90 格字符（不给走子方/回合信息）
    static func parseFenChars(_ s: String) -> [Character?] {
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
        return b
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
