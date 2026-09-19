import { JSON_RPC_METHOD_NOT_FOUND, jsonRpcKind, type JsonRpcFrame, type JsonRpcId } from './jsonRpc'

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export interface GatewayEvent<P = unknown> {
  payload?: P
  session_id?: string
  type: string
}

export type GatewayServerRequest = {
  id: JsonRpcId
  method: string
  params?: unknown
}

type ServerRequestHandler = (request: GatewayServerRequest) => boolean

type PendingCall = {
  reject: (error: Error) => void
  resolve: (value: unknown) => void
  timer?: ReturnType<typeof setTimeout>
}

export class JsonRpcGatewayError extends Error {
  code?: number

  constructor(message: string, code?: number) {
    super(message)
    this.name = 'JsonRpcGatewayError'
    this.code = code
  }
}

export function isAbortError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  return (error as { name?: string }).name === 'AbortError'
}

export class JsonRpcGatewayClient {
  private closeCode: number | null = null
  private connectingStartedAt = 0
  private heartbeatSequence = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private inboundAt = 0
  private nextId = 0
  private readonly eventHandlers = new Map<string, Set<(event: GatewayEvent) => void>>()
  private readonly pending = new Map<string | number, PendingCall>()
  private readonly requestHandlers = new Set<ServerRequestHandler>()
  private readonly inbound = new Set<JsonRpcId>()
  private readonly stateHandlers = new Set<(state: ConnectionState) => void>()
  private socket: WebSocket | null = null
  private state: ConnectionState = 'idle'

  get connectionState(): ConnectionState {
    return this.state
  }

  get lastInboundAt(): number {
    return this.inboundAt
  }

  get handshakeStartedAt(): number {
    return this.connectingStartedAt
  }

  get socketReadyState(): number | null {
    return this.socket?.readyState ?? null
  }

  get lastCloseCode(): number | null {
    return this.closeCode
  }

  async connect(wsUrl: string): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN && this.state === 'open') {
      return
    }

    this.dropSocket()
    this.closeCode = null
    this.setState('connecting')
    this.connectingStartedAt = Date.now()
    const socket = new WebSocket(wsUrl)
    this.socket = socket

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) {
        return
      }

      this.inboundAt = Date.now()
      this.handleMessage(String(event.data))
    })

    socket.addEventListener('close', (event) => {
      if (this.socket !== socket) {
        return
      }

      this.closeCode = event.code
      this.socket = null
      this.stopHeartbeat()
      this.setState('closed')
      this.rejectAll(new Error('WebSocket 已关闭'))
    })

    socket.addEventListener('error', () => {
      if (this.socket !== socket) {
        return
      }

      this.setState('error')
      try {
        socket.close()
      } catch {
        // already closing
      }
    })

    await new Promise<void>((resolve, reject) => {
      let settled = false
      let timer = 0
      const finish = (error?: Error) => {
        if (settled) {
          return
        }

        settled = true
        window.clearTimeout(timer)
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      }

      timer = window.setTimeout(() => {
        if (this.socket === socket) {
          this.setState('error')
          socket.close()
        }
        finish(new Error('连接网关超时'))
      }, 15_000)

      socket.addEventListener(
        'open',
        () => {
          if (this.socket !== socket) {
            finish(new Error('WebSocket 已关闭'))
            return
          }

          this.inboundAt = Date.now()
          this.setState('open')
          finish()
        },
        { once: true }
      )
      socket.addEventListener(
        'error',
        () => {
          if (this.socket === socket) {
            this.setState('error')
          }
          finish(new Error('WebSocket 连接失败'))
        },
        { once: true }
      )
      socket.addEventListener(
        'close',
        () => {
          finish(new Error('WebSocket 已关闭'))
        },
        { once: true }
      )
    })
  }

  close(): void {
    this.dropSocket()
    if (this.state !== 'closed') {
      this.setState('closed')
    }
  }

  on<P = unknown>(type: string, handler: (event: GatewayEvent<P>) => void): () => void {
    let handlers = this.eventHandlers.get(type)

    if (!handlers) {
      handlers = new Set()
      this.eventHandlers.set(type, handlers)
    }

    handlers.add(handler as (event: GatewayEvent) => void)
    return () => handlers?.delete(handler as (event: GatewayEvent) => void)
  }

  onState(handler: (state: ConnectionState) => void): () => void {
    this.stateHandlers.add(handler)
    handler(this.state)
    return () => this.stateHandlers.delete(handler)
  }

  onRequest(handler: ServerRequestHandler): () => void {
    this.requestHandlers.add(handler)
    return () => this.requestHandlers.delete(handler)
  }

  acceptRequest(id: JsonRpcId): void {
    this.inbound.add(id)
  }

  forgetRequest(id: JsonRpcId): boolean {
    return this.inbound.delete(id)
  }

  respond(id: JsonRpcId, result: unknown): boolean {
    if (!this.inbound.has(id)) return false
    this.inbound.delete(id)
    return this.sendFrame({ jsonrpc: '2.0', id, result })
  }

  respondError(id: JsonRpcId, message: string, code = JSON_RPC_METHOD_NOT_FOUND): boolean {
    if (!this.inbound.has(id)) return false
    this.inbound.delete(id)
    return this.sendFrame({ jsonrpc: '2.0', id, error: { code, message } })
  }

  request<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 120_000): Promise<T> {
    const socket = this.socket

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('尚未连接到网关'))
    }

    const id = `w${++this.nextId}`

    return new Promise<T>((resolve, reject) => {
      const pending: PendingCall = {
        resolve: value => resolve(value as T),
        reject
      }

      if (timeoutMs > 0) {
        pending.timer = setTimeout(() => {
          if (this.pending.delete(id)) {
            reject(new Error(`请求超时：${method}`))
          }
        }, timeoutMs)
      }

      this.pending.set(id, pending)

      try {
        socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
      } catch (error) {
        this.clearPending(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private handleMessage(raw: string): void {
    let frame: JsonRpcFrame

    try {
      frame = JSON.parse(raw) as JsonRpcFrame
    } catch {
      return
    }

    const kind = jsonRpcKind(frame)

    if (kind === 'request' && frame.method && frame.id !== undefined && frame.id !== null) {
      this.dispatchRequest({ id: frame.id, method: frame.method, params: frame.params })
      return
    }

    if (kind === 'response' && frame.id !== undefined && frame.id !== null) {
      const pending = this.pending.get(frame.id)
      if (!pending) return
      this.clearPending(frame.id)
      if (frame.error) {
        pending.reject(new JsonRpcGatewayError(frame.error.message || 'Hermes RPC 失败', frame.error.code))
      } else {
        pending.resolve(frame.result)
      }
      return
    }

    if (frame.method === 'event') {
      const event = frame.params as GatewayEvent | undefined
      if (!event?.type) return
      if (event.type === 'gateway.ready') {
        const payload = event.payload as { heartbeat?: unknown } | undefined
        if (payload?.heartbeat === true && this.socket) {
          this.inboundAt = Date.now()
          this.startHeartbeat(this.socket)
        }
      }
      this.dispatch(event)
    }
  }

  private dispatchRequest(request: GatewayServerRequest): void {
    this.inbound.add(request.id)
    let handled = false
    for (const handler of this.requestHandlers) {
      try {
        if (handler(request)) handled = true
      } catch {
        // a bad handler must not block the rest of the queue
      }
    }
    if (!handled && this.inbound.has(request.id)) {
      this.respondError(request.id, `Method not found: ${request.method}`)
    }
  }

  private sendFrame(frame: Record<string, unknown>): boolean {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    try {
      socket.send(JSON.stringify(frame))
      return true
    } catch {
      return false
    }
  }

  private dropSocket(): void {
    const socket = this.socket
    this.socket = null
    this.stopHeartbeat()
    this.rejectAll(new Error('WebSocket 已关闭'))

    if (!socket) {
      return
    }

    try {
      socket.close()
    } catch {
      // already closing
    }
  }

  private startHeartbeat(socket: WebSocket): void {
    this.stopHeartbeat()
    this.inboundAt = Date.now()
    this.heartbeatTimer = setInterval(() => {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) {
        return
      }

      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }

      if (Date.now() - this.inboundAt >= 45_000) {
        socket.close()
        return
      }

      try {
        socket.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: `heartbeat-${++this.heartbeatSequence}`,
            method: 'gateway.ping',
            params: {}
          })
        )
      } catch {
        socket.close()
      }
    }, 15_000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private dispatch(event: GatewayEvent): void {
    for (const handler of this.eventHandlers.get(event.type) ?? []) {
      handler(event)
    }

    for (const handler of this.eventHandlers.get('*') ?? []) {
      handler(event)
    }
  }

  private clearPending(id: string | number): void {
    const pending = this.pending.get(id)

    if (pending?.timer) {
      clearTimeout(pending.timer)
    }

    this.pending.delete(id)
  }

  private rejectAll(error: Error): void {
    this.inbound.clear()
    for (const [id, pending] of this.pending) {
      if (pending.timer) {
        clearTimeout(pending.timer)
      }

      pending.reject(error)
      this.pending.delete(id)
    }
  }

  private setState(state: ConnectionState): void {
    this.state = state

    for (const handler of this.stateHandlers) {
      handler(state)
    }
  }
}
