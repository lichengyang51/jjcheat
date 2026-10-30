//
//  FrameServer.swift
//  JJCheatApp —— 接收 Broadcast Extension 发来的帧
//
//  【血泪教训】
//  Data.subdata(in:) 接受的是「绝对索引」，而 Data.removeFirst() 会把
//  startIndex 往后推。上一版写成
//        pending.subdata(in: JJProto.headerSize..<total)
//        pending.removeFirst(total)
//  第二轮循环时 startIndex 已经不是 0，range 立刻越界，
//  Swift 运行时 brk 1（EXC_BREAKPOINT / SIGTRAP），整个 App 被干掉。
//
//  现在改成：
//    · 用一个 consumed 游标 + pending.startIndex 做基准，绝不假设索引从 0 开始
//    · 处理完用 Data(dropFirst(consumed)) 重建，startIndex 归零
//    · payload 用切片再复制成独立 Data，避免持有 pending 的引用
//

import Foundation
import Network

final class FrameServer {

    struct Frame {
        let data: Data
        let width: Int
        let height: Int
        let timestamp: Date
    }

    static let shared = FrameServer()

    var onFrame: ((Frame) -> Void)?
    var onHeartbeat: (() -> Void)?
    var onStateChange: ((Bool) -> Void)?

    private var listener: NWListener?
    private var connections: [NWConnection] = []
    private let queue = DispatchQueue(label: "com.fujiang.jjcheat.frameserver")
    private var pending = Data()
    private let maxPending = 32 * 1024 * 1024

    private(set) var isRunning = false
    private(set) var frameCount: UInt64 = 0
    private(set) var heartbeatCount: UInt64 = 0
    private(set) var startHeartbeats: UInt64 = 0
    private(set) var timerHeartbeats: UInt64 = 0
    private(set) var badPacketCount: UInt64 = 0
    private(set) var lastFrameSize: CGSize = .zero

    // MARK: - 启停

    func start() {
        guard !isRunning else { return }
        do {
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true
            guard let port = NWEndpoint.Port(rawValue: JJProto.port) else { return }
            let l = try NWListener(using: params, on: port)
            l.newConnectionHandler = { [weak self] conn in
                self?.accept(conn)
            }
            l.stateUpdateHandler = { [weak self] state in
                guard let self else { return }
                switch state {
                case .ready:
                    self.isRunning = true
                    NSLog("[JJCheat] FrameServer 监听 127.0.0.1:\(JJProto.port)")
                    DispatchQueue.main.async { self.onStateChange?(true) }
                case .failed(let e):
                    NSLog("[JJCheat] FrameServer 失败: \(e)")
                    self.isRunning = false
                    DispatchQueue.main.async { self.onStateChange?(false) }
                case .cancelled:
                    self.isRunning = false
                    DispatchQueue.main.async { self.onStateChange?(false) }
                default:
                    break
                }
            }
            l.start(queue: queue)
            listener = l
        } catch {
            NSLog("[JJCheat] FrameServer 启动失败: \(error)")
        }
    }

    func stop() {
        listener?.cancel()
        listener = nil
        connections.forEach { $0.cancel() }
        connections.removeAll()
        pending.removeAll(keepingCapacity: false)
        isRunning = false
    }

    func restart() {
        stop()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            self?.start()
        }
    }

    // MARK: - 连接

    private func accept(_ conn: NWConnection) {
        connections.append(conn)
        conn.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                NSLog("[JJCheat] Extension 已连接")
                self.pending.removeAll(keepingCapacity: false)
                DispatchQueue.main.async { self.onStateChange?(true) }
            case .failed, .cancelled:
                self.connections.removeAll { $0 === conn }
            default:
                break
            }
        }
        conn.start(queue: queue)
        receive(on: conn)
    }

    private func receive(on conn: NWConnection) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                self.appendAndDrain(data)
            }
            if isComplete || error != nil {
                conn.cancel()
                self.connections.removeAll { $0 === conn }
                return
            }
            self.receive(on: conn)
        }
    }

    // MARK: - 拆包（索引安全版）

    private func appendAndDrain(_ data: Data) {
        pending.append(data)

        if pending.count > maxPending {
            NSLog("[JJCheat] pending 超限，丢弃重来")
            pending.removeAll(keepingCapacity: true)
            return
        }

        var consumed = 0                 // 相对已处理偏移
        let base = pending.startIndex    // 关键：以真实起点为基准
        let end = pending.endIndex

        while true {
            let remain = pending.count - consumed
            guard remain >= JJProto.headerSize else { break }

            let hStart = base + consumed
            let hEnd = hStart + JJProto.headerSize
            guard hEnd <= end else { break }

            // 只用明确落在范围内的切片，绝不传裸常量给 subdata
            guard let h = JJFrameHeader.decode(Data(pending[hStart..<hEnd])) else {
                badPacketCount += 1
                consumed += 1            // 逐字节重新同步
                continue
            }

            let payloadLen = Int(h.payloadLen)
            let total = JJProto.headerSize + payloadLen
            guard remain >= total else { break }        // 半包，等下一批数据

            let pStart = hStart + JJProto.headerSize
            let pEnd = pStart + payloadLen
            guard pEnd <= end else { break }

            if h.isHeartbeat {
                heartbeatCount += 1
                switch h.heartbeatKind {
                case 1: startHeartbeats += 1
                case 2: timerHeartbeats += 1
                default: break
                }
                DispatchQueue.main.async { [weak self] in self?.onHeartbeat?() }
            } else {
                // 切片复制成独立 Data，避免继续持有 pending 内部引用
                let payload = Data(pending[pStart..<pEnd])
                frameCount += 1
                lastFrameSize = CGSize(width: Int(h.width), height: Int(h.height))
                let frame = Frame(data: payload,
                                  width: Int(h.width),
                                  height: Int(h.height),
                                  timestamp: Date())
                DispatchQueue.main.async { [weak self] in self?.onFrame?(frame) }
            }

            consumed += total
        }

        if consumed > 0 {
            // dropFirst 出来的还是 slice，再包一层 Data 让 startIndex 归零
            pending = Data(pending.dropFirst(consumed))
        }
    }
}
