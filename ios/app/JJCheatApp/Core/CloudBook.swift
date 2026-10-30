//
//  CloudBook.swift
//  JJCheatApp —— 云库（chessdb.cn）
//
//  鹏飞 iOS 那个「开局库」就是查云库：
//      使用云库 http://www.chessdb.cn/chessdb…  超时 2 秒  优先使用云库
//  云库背后是皮卡鱼那一档的引擎跑出来的局面库，查到的着法比我们本机
//  JS 引擎算的强得多，而且是「现成的」——不烧 CPU、不会两个同分着法来回跳。
//
//  接口（实测）：
//    GET /chessdb.php?action=querybest&board=<FEN的棋盘+走子方>   →  move:c0e2
//    GET /chessdb.php?action=queryall&board=<...>                →  move:c0e2,score:1,rank:2,...|move:...
//  没收录时返回 unknown。
//

import Foundation

final class CloudBook {

    static let shared = CloudBook()

    /// 云库超时（鹏飞默认也是 2 秒）
    var timeout: TimeInterval = 2.0
    var enabled = true

    private var cache: [String: [String]] = [:]
    private var inflight = Set<String>()
    private let lock = NSLock()

    private var session: URLSession = {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = 2.0
        cfg.timeoutIntervalForResource = 3.0
        cfg.waitsForConnectivity = false
        return URLSession(configuration: cfg)
    }()

    /// 同步拿缓存（查过的局面立刻给答案，不等待）
    func cached(fen: String) -> [String]? {
        lock.lock(); defer { lock.unlock() }
        return cache[Self.bookKey(fen)]
    }

    /// 查云库，回调在后台线程；没收录/超时给空数组
    func query(fen: String, completion: @escaping ([String]) -> Void) {
        guard enabled else { completion([]); return }
        let key = Self.bookKey(fen)
        guard !key.isEmpty else { completion([]); return }

        lock.lock()
        if let hit = cache[key] { lock.unlock(); completion(hit); return }
        if inflight.contains(key) { lock.unlock(); completion([]); return }
        inflight.insert(key)
        lock.unlock()

        var comps = URLComponents(string: "https://www.chessdb.cn/chessdb.php")!
        comps.queryItems = [
            URLQueryItem(name: "action", value: "queryall"),
            URLQueryItem(name: "board", value: key)
        ]
        guard let url = comps.url else { completion([]); return }
        var req = URLRequest(url: url)
        req.timeoutInterval = timeout

        session.dataTask(with: req) { [weak self] data, _, _ in
            guard let self else { return }
            var moves: [String] = []
            if let data, let text = String(data: data, encoding: .utf8) {
                moves = Self.parse(text)
            }
            self.lock.lock()
            self.inflight.remove(key)
            // 查到了才缓存；unknown 不缓存，好让下次局面变了再查
            if !moves.isEmpty { self.cache[key] = moves }
            if self.cache.count > 400 { self.cache.removeAll() }
            self.lock.unlock()
            completion(moves)
        }.resume()
    }

    /// 解析 queryall 的返回：move:c0e2,score:1,rank:2,...|move:...
    static func parse(_ text: String) -> [String] {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty || t == "unknown" || t.hasPrefix("invalid") { return [] }
        var out: [String] = []
        for chunk in t.split(separator: "|") {
            for field in chunk.split(separator: ",") {
                let s = String(field)
                if s.hasPrefix("move:") {
                    let mv = String(s.dropFirst(5))
                    if mv.count == 4 && !out.contains(mv) { out.append(mv) }
                }
            }
            if out.count >= 5 { break }
        }
        return out
    }

    /// 云库认「棋盘 + 走子方」，不要回合数
    static func bookKey(_ fen: String) -> String {
        let parts = fen.split(separator: " ")
        guard parts.count >= 2 else { return "" }
        let side = parts[1] == "b" ? "b" : "w"
        return String(parts[0]) + " " + side
    }
}
