//
//  FrameServer.swift
//  JJCheatApp —— 接收 Broadcast Extension 发来的帧
//
//  监听 127.0.0.1:9527，按 JJFrameHeader 拆包，
//  回调到主线程（只保留最新一帧，旧的直接丢）。
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

    /// 收到新帧（主线程回调）
    var onFrame: ((Frame) -> Void)?
    /// 收到心跳包（主线程回调）——证明扩展活着
    var onHeartbeat: (() -> Void)?
    /// 连接状态变化（主线程回调）
    var onStateChange: ((Bool) -> Void)?

    private var listener: NWListener?
    private var connections: [NWConnection] = []
    private let queue = DispatchQueue(label: "com.fujiang.jjcheat.frameserver")
    private var pending = Data()
    private let maxPending = 32 * 1024 * 1024

    private(set) var isRunning = false
    private(set) var frameCount: UInt64 = 0
    private(set) var heartbeatCount: UInt64 = 0
    private(set) var startHeartbeats: UInt64 = 0     // broadcastStarted 发的
    private(set) var timerHeartbeats: UInt64 = 0     // 每秒定时发的
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
                    DispatchQueue.main.async { self.onStateChange?(true) }
                case .failed, .cancelled:
                    self.isRunning = false
                    DispatchQueue.main.async { self.onStateChange?(false) }
                default:
                    break
                }
            }
            l.start(queue: queue)
            listener = l
            NSLog("[JJCheat] FrameServer 监听 127.0.0.1:\(JJProto.port)")
        } catch {
            NSLog("[JJCheat] FrameServer 启动失败: \(error)")
        }
    }

    func stop() {
        listener?.cancel()
        listener = nil
        connections.forEach { $0.cancel() }
        connections.removeAll()
        isRunning = false
    }

    /// 从后台恢复时用：彻底重建监听（旧 socket 可能已经死了但 isRunning 还是 true）
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

    // MARK: - 拆包

    private func appendAndDrain(_ data: Data) {
        pending.append(data)
        if pending.count > maxPending {
            // 数据错位了，整段丢掉重来
            pending.removeAll(keepingCapacity: true)
            return
        }

        while true {
            guard pending.count >= JJProto.headerSize else { return }
            let headerData = pending.prefix(JJProto.headerSize)
            guard let h = JJFrameHeader.decode(Data(headerData)) else {
                // 魔数对不上 → 丢一个字节重新同步
                badPacketCount += 1
                pending.removeFirst()
                continue
            }
            let total = JJProto.headerSize + Int(h.payloadLen)
            guard pending.count >= total else { return }

            let payload = pending.subdata(in: JJProto.headerSize..<total)
            pending.removeFirst(total)

            // 心跳包：只证明扩展活着，不带画面
            if h.isHeartbeat {
                heartbeatCount += 1
                switch h.heartbeatKind {
                case 1: startHeartbeats += 1
                case 2: timerHeartbeats += 1
                default: break
                }
                DispatchQueue.main.async { [weak self] in
                    self?.onHeartbeat?()
                }
                continue
            }

            frameCount += 1
            lastFrameSize = CGSize(width: Int(h.width), height: Int(h.height))
            let frame = Frame(data: payload,
                              width: Int(h.width),
                              height: Int(h.height),
                              timestamp: Date())
            DispatchQueue.main.async { [weak self] in
                self?.onFrame?(frame)
            }
        }
    }
}
