export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export interface GatewayEvent<P = unknown> {
  payload?: P
  session_id?: string
  type: string
}

interface JsonRpcFrame {
  error?: { code?: number; message?: string }
  id?: number | string | null
  method?: string
  params?: GatewayEvent
  result?: unknown
}

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
  private heartbeatSequence = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private lastInboundAt = 0
  private nextId = 0
  private readonly eventHandlers = new Map<string, Set<(event: GatewayEvent) => void>>()
  private readonly pending = new Map<string | number, PendingCall>()
  private readonly stateHandlers = new Set<(state: ConnectionState) => void>()
  private socket: WebSocket | null = null
  private state: ConnectionState = 'idle'

  get connectionState(): ConnectionState {
    return this.state
  }

  async connect(wsUrl: string): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN || this.state === 'connecting') {
      return
    }

    this.setState('connecting')
    const socket = new WebSocket(wsUrl)
    this.socket = socket

    socket.addEventListener('message', event => {
      if (this.socket !== socket) {
        return
      }

      this.lastInboundAt = Date.now()
      this.handleMessage(String(event.data))
    })

    socket.addEventListener('close', () => {
      if (this.socket !== socket) {
        return
      }

      this.socket = null
      this.stopHeartbeat()
      this.setState('closed')
      this.rejectAll(new Error('WebSocket 已关闭'))
    })

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timer = window.setTimeout(() => {
        if (settled) {
          return
        }

        settled = true
        this.setState('error')
        socket.close()
        reject(new Error('连接网关超时'))
      }, 15_000)

      socket.addEventListener(
        'open',
        () => {
          if (settled) {
            return
          }

          settled = true
          window.clearTimeout(timer)
          this.setState('open')
          resolve()
        },
        { once: true }
      )
      socket.addEventListener(
        'error',
        () => {
          if (settled) {
            return
          }

          settled = true
          window.clearTimeout(timer)
          this.setState('error')
          reject(new Error('WebSocket 连接失败'))
        },
        { once: true }
      )
    })
  }

  close(): void {
    const socket = this.socket

    if (!socket) {
      return
    }

    try {
      socket.close()
    } finally {
      this.socket = null
      this.stopHeartbeat()
      this.setState('closed')
      this.rejectAll(new Error('WebSocket 已关闭'))
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

    if (frame.id !== undefined && frame.id !== null) {
      const pending = this.pending.get(frame.id)

      if (!pending) {
        return
      }

      this.clearPending(frame.id)

      if (frame.error) {
        pending.reject(new JsonRpcGatewayError(frame.error.message || 'Hermes RPC 失败', frame.error.code))
      } else {
        pending.resolve(frame.result)
      }

      return
    }

    if (frame.method === 'event' && frame.params?.type) {
      if (frame.params.type === 'gateway.ready') {
        const payload = frame.params.payload as { heartbeat?: unknown } | undefined

        if (payload?.heartbeat === true && this.socket) {
          this.startHeartbeat(this.socket)
        }
      }

      this.dispatch(frame.params)
    }
  }

  private startHeartbeat(socket: WebSocket): void {
    this.stopHeartbeat()
    this.lastInboundAt = Date.now()
    this.heartbeatTimer = setInterval(() => {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) {
        return
      }

      if (Date.now() - this.lastInboundAt >= 45_000) {
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
