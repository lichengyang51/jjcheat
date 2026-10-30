//
//  ScreenshotReader.swift
//  JJCheatApp
//
//  从「系统相册 → 截图」里读最新一张，交给引擎识别。
//
//  【为什么走这条路】
//   之前用 ReplayKit 录屏抓帧，问题都出在画面上：
//     · ReplayKit 给的是 YUV 420，色度天生半分辨率
//     · 扩展里再降采样 2 倍（441×958），色度细节只剩 1/4
//     · 量化测过：不模糊 0 格错 / 轻微模糊 3 格错 / 中等模糊 20 格错
//   结果就是「位置对、颜色对，但兵种认错」（黑将被认成炮）。
//
//   而系统截图是原生分辨率（1290×2796）、无损 PNG，颜色和清晰度都最好。
//   鹏飞象棋的 iOS 版就是「半自动」：靠截图读盘，走子自己点。
//   这里照它的思路做：你在 JJ象棋 里截一张图，切回本 App，
//   App 自动读最新那张截图 → 识别 → 给出着法。
//

import Foundation
import Photos
import UIKit

enum ScreenshotReader {

    /// 请求相册权限（只读）
    static func requestAuth(_ done: @escaping (Bool) -> Void) {
        let st = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        if st == .authorized || st == .limited {
            done(true)
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { s in
            DispatchQueue.main.async {
                done(s == .authorized || s == .limited)
            }
        }
    }

    /// 取最新一张截图（系统「截图」子类型的照片）
    static func latestScreenshot(_ done: @escaping (UIImage?, Date?) -> Void) {
        let opts = PHFetchOptions()
        opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        opts.fetchLimit = 12

        // 优先只找「截图」类型；找不到再退回最新照片
        var asset: PHAsset?
        let shots = PHAsset.fetchAssets(with: .image, options: opts)
        shots.enumerateObjects { a, _, stop in
            if a.mediaSubtypes.contains(.photoScreenshot) {
                asset = a
                stop.pointee = true
            }
        }
        if asset == nil { asset = shots.firstObject }
        guard let target = asset else {
            done(nil, nil)
            return
        }

        let req = PHImageRequestOptions()
        req.isSynchronous = false
        req.deliveryMode = .highQualityFormat
        req.resizeMode = .none
        req.isNetworkAccessAllowed = true

        PHImageManager.default().requestImage(
            for: target,
            targetSize: PHImageManagerMaximumSize,
            contentMode: .default,
            options: req
        ) { img, info in
            let cancelled = (info?[PHImageCancelledKey] as? Bool) ?? false
            let degraded = (info?[PHImageResultIsDegradedKey] as? Bool) ?? false
            guard !cancelled, let img else { return }
            if degraded { return }   // 等高清那一版
            DispatchQueue.main.async {
                done(img, target.creationDate)
            }
        }
    }

    /// UIImage → RGBA 字节（引擎要的格式，按原分辨率、不缩放）
    static func rgba(from image: UIImage) -> (data: Data, width: Int, height: Int)? {
        guard let cg = image.cgImage else { return nil }
        let w = cg.width, h = cg.height
        guard w > 32, h > 32 else { return nil }

        var buf = [UInt8](repeating: 0, count: w * h * 4)
        guard let cs = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue)

        let ok: Bool = buf.withUnsafeMutableBytes { raw -> Bool in
            guard let base = raw.baseAddress else { return false }
            guard let ctx = CGContext(data: base, width: w, height: h,
                                      bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: cs, bitmapInfo: info.rawValue) else { return false }
            ctx.interpolationQuality = .none
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard ok else { return nil }
        return (Data(buf), w, h)
    }
}
