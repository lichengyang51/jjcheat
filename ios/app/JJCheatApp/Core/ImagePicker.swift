//
//  ImagePicker.swift
//  JJCheatApp
//
//  拍照 / 从相册选一张棋盘照片。
//  鹏飞象棋 iOS 版的核心输入就是「拍照或选照片」，这里照它做。
//

import SwiftUI
import UIKit

struct ImagePicker: UIViewControllerRepresentable {

    enum Source { case camera, library }

    var source: Source
    var onPick: (UIImage) -> Void
    var onCancel: () -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.delegate = context.coordinator
        if source == .camera, UIImagePickerController.isSourceTypeAvailable(.camera) {
            p.sourceType = .camera
        } else {
            p.sourceType = .photoLibrary
        }
        p.allowsEditing = false
        return p
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coord { Coord(self) }

    final class Coord: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: ImagePicker
        init(_ parent: ImagePicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage {
                parent.onPick(img)
            } else {
                parent.onCancel()
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.onCancel()
        }
    }
}
