//
//  AppModel.swift
//  JJCheatApp —— 全局状态与主循环
//

import Foundation
import UIKit
import Combine
import ReplayKit

final class AppModel: ObservableObject {

    @Published var connected = false
    @Published var frameCount: UInt64 = 0
    @Published var lastImage: UIImage?
    @Published var frameSize: CGSize = .zero

    @Published var fen = BoardRenderView.startFen
    @Published var moveText = ""
    @Published var scoreText = ""
    @Published var winrate: Double = 50
    @Published var depth = 0
    @Published var fromSq = -1
    @Published var toSq = -1

    @Published var calibrated = false
    @Published var learned = false
    @Published var pipActive = false
    @Published var status = "① 先点「开始录屏」，再切到 JJ象棋"
    @Published var detail = ""

    private var busy = false
    private let processQueue = DispatchQueue(label: "com.fujiang.jjcheat.process", qos: .userInitiated)

    let corners: [[Double]] = []   // 占位，真实值存 UserDefaults

    init() {
        JJEngine.shared.loadIfNeeded()
        FrameServer.shared.onFrame = { [weak self] frame in
            self?.handle(frame)
        }
        FrameServer.shared.onStateChange = { [weak self] up in
            self?.connected = up
        }
        loadCalibration()
    }

    // MARK: - 标定持久化

    private let cornersKey = "JJCheat.corners"
    private let learnedKey = "JJCheat.learned"

    private func loadCalibration() {
        if let saved = UserDefaults.standard.array(forKey: cornersKey) as? [[Double]], saved.count == 4 {
            JJEngine.shared.setCorners(saved)
            calibrated = true
            learned = UserDefaults.standard.bool(forKey: learnedKey)
            status = learned ? "已就绪，点「③ 打开画中画」" : "标定已存，请进一局新棋后点「重新学习棋盘」"
        }
    }

    func applyCalibration(_ pts: [[Double]]) {
        guard pts.count == 4 else { return }
        UserDefaults.standard.set(pts, forKey: cornersKey)
        JJEngine.shared.setCorners(pts)
        JJEngine.shared.reset(fen: nil)
        calibrated = true
        learned = false
        UserDefaults.standard.set(false, forKey: learnedKey)
        status = "标定完成，请让画面停在标准开局"
    }

    func forceRelearn() {
        JJEngine.shared.reset(fen: nil)
        learned = false
        UserDefaults.standard.set(false, forKey: learnedKey)
        status = "请让画面停在标准开局，正在重新学习…"
    }

    // MARK: - 帧处理

    private func handle(_ frame: FrameServer.Frame) {
        frameCount = FrameServer.shared.frameCount
        frameSize = CGSize(width: frame.width, height: frame.height)

        // 校准界面需要看到画面
        if lastImage == nil || frameCount % 3 == 0 {
            lastImage = Self.image(from: frame)
        }

        guard calibrated else { return }
        guard !busy else { return }
        busy = true

        // 学习阶段
        if !learned {
            if let info = JJEngine.shared.learnBoard(pixels: frame.data,
                                                     width: frame.width,
                                                     height: frame.height),
               (info["templateCount"] as? Int ?? 0) > 0 {
                learned = true
                UserDefaults.standard.set(true, forKey: learnedKey)
                status = "棋盘学习完成，点「③ 打开画中画」"
            }
            busy = false
            return
        }

        processQueue.async { [weak self] in
            guard let self else { return }
            let t0 = Date()
            let res = JJEngine.shared.process(pixels: frame.data,
                                             width: frame.width,
                                             height: frame.height,
                                             timeMs: 900)
            let cost = Int(Date().timeIntervalSince(t0) * 1000)
            self.busy = false
            guard let res else { return }

            DispatchQueue.main.async {
                self.consume(res, cost: cost)
            }
        }
    }

    private func consume(_ res: [String: Any], cost: Int) {
        if let fail = res["detectFail"] as? Bool, fail {
            let d = res["detectDiff"] as? Int ?? 0
            status = "识别偏差 \(d) 格，建议重新标定"
            return
        }
        fen = res["fen"] as? String ?? fen
        moveText = res["suggestChinese"] as? String ?? ""
        scoreText = res["scoreText"] as? String ?? ""
        winrate = res["winrate"] as? Double ?? 50
        depth = res["depth"] as? Int ?? 0
        fromSq = res["from"] as? Int ?? -1
        toSq = res["to"] as? Int ?? -1

        let side = (res["sideToMove"] as? String) == "red" ? "红方" : "黑方"
        detail = "\(side)走 · 深度 \(depth) · \(cost)ms · 帧 \(frameCount)"

        if (res["moveDetected"] as? Bool) == true {
            let m = res["moveChinese"] as? String ?? res["move"] as? String ?? ""
            status = "对方走了 \(m)"
        }

        if pipActive {
            PiPController.shared.update(fen: fen, moveText: moveText, scoreText: scoreText,
                                        winrate: winrate, depth: depth,
                                        from: fromSq, to: toSq)
        }
    }

    // MARK: - 画中画

    func startPiP(sourceView: UIView) {
        PiPController.shared.update(fen: fen, moveText: moveText, scoreText: scoreText,
                                    winrate: winrate, depth: depth, from: fromSq, to: toSq)
        PiPController.shared.onStateChange = { [weak self] active, err in
            guard let self else { return }
            self.pipActive = active
            if let err {
                self.status = "画中画失败：\(err)"
            } else if active {
                self.status = "浮窗已开 · 现在切回 JJ象棋"
            }
        }
        PiPController.shared.start(sourceView: sourceView)
        pipActive = true
    }

    // MARK: - 像素转图

    static func image(from frame: FrameServer.Frame) -> UIImage? {
        let w = frame.width, h = frame.height
        guard w > 0, h > 0, frame.data.count >= w * h * 4 else { return nil }
        guard let provider = CGDataProvider(data: frame.data as CFData) else { return nil }
        let cs = CGColorSpaceCreateDeviceRGB()
        let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
        guard let cg = CGImage(width: w, height: h,
                               bitsPerComponent: 8, bitsPerPixel: 32,
                               bytesPerRow: w * 4, space: cs, bitmapInfo: info,
                               provider: provider, decode: nil,
                               shouldInterpolate: false, intent: .defaultIntent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
