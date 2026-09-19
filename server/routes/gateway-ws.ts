import { mintGatewayWsUrl } from '../utils/gateway'
import { getConnection, readSessionIdFromCookieHeader } from '../utils/session'
import { GATEWAY_UNAUTHORIZED_CLOSE, websocketCloseCode, websocketCloseReason } from '#shared/utils/wsCloseCode'

type WsPeer = {
  close: (code?: number, reason?: string) => void
  context: Record<string, unknown>
  request?: Request
  send: (data: string) => void
}

type NodeReq = {
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  socket?: { on?: (event: string, handler: (...args: unknown[]) => void) => void }
}

const MAX_QUEUE = 32

function cookieHeader(peer: WsPeer): string | null {
  if (peer.request) {
    return peer.request.headers.get('cookie')
  }

  const nodeReq = (peer.context as { node?: { req?: { headers?: { cookie?: string | string[] } } } }).node?.req
  const cookie = nodeReq?.headers?.cookie
  return Array.isArray(cookie) ? cookie.join('; ') : cookie || null
}

function asText(message: unknown): string {
  if (typeof message === 'string') {
    return message
  }

  if (message && typeof message === 'object') {
    const record = message as { data?: unknown, text?: () => string, toString?: () => string }

    if (typeof record.text === 'function') {
      return record.text()
    }

    if (typeof record.data === 'string') {
      return record.data
    }

    if (typeof record.toString === 'function') {
      const text = record.toString()
      if (text && text !== '[object Object]') {
        return text
      }
    }
  }

  return String(message ?? '')
}

function silenceIncomingSocket(peer: WsPeer) {
  const req = (peer.context as { node?: { req?: NodeReq } }).node?.req
  req?.on?.('error', () => {})
  req?.socket?.on?.('error', () => {})
}

function safeSend(peer: WsPeer, data: string) {
  try {
    peer.send(data)
  } catch {
    // peer already gone
  }
}

function safeClose(peer: WsPeer, code?: number, reason?: string) {
  try {
    peer.close(websocketCloseCode(code), websocketCloseReason(reason))
  } catch {
    // already closing
  }
}

function sendEvent(peer: WsPeer, type: string, payload: Record<string, unknown>): void {
  safeSend(
    peer,
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'event',
      params: { type, payload }
    })
  )
}

function listenSocketError(socket: WebSocket, onError: () => void) {
  socket.addEventListener('error', onError)
  const emitter = socket as unknown as { on?: (event: string, handler: () => void) => void }
  if (typeof emitter.on === 'function') {
    emitter.on('error', onError)
  }
}

function flushQueue(peer: WsPeer, remote: WebSocket): void {
  const queue = (peer.context.queue as string[] | undefined) ?? []
  peer.context.queue = []

  for (const item of queue) {
    if (remote.readyState === WebSocket.OPEN) {
      try {
        remote.send(item)
      } catch {
        break
      }
    }
  }
}

function waitForOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('远程网关 WebSocket 连接超时'))
    }, 15_000)

    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timer)
        reject(new Error('远程网关 WebSocket 连接失败'))
      },
      { once: true }
    )
    socket.addEventListener(
      'close',
      () => {
        clearTimeout(timer)
        reject(new Error('远程网关 WebSocket 已关闭'))
      },
      { once: true }
    )
  })
}

function detachRemote(peer: WsPeer) {
  const remote = peer.context.remote as WebSocket | undefined
  peer.context.remote = undefined
  if (!remote) {
    return
  }

  try {
    if (remote.readyState === WebSocket.OPEN || remote.readyState === WebSocket.CONNECTING) {
      remote.close()
    }
  } catch {
    // already closing
  }
}

export default defineWebSocketHandler({
  async open(peer: WsPeer) {
    silenceIncomingSocket(peer)
    peer.context.queue = []
    const connection = getConnection(readSessionIdFromCookieHeader(cookieHeader(peer)))

    if (!connection) {
      sendEvent(peer, 'error', { message: '未登录，或服务已重启，请重新连接网关' })
      safeClose(peer, GATEWAY_UNAUTHORIZED_CLOSE, 'unauthorized')
      return
    }

    try {
      const wsUrl = await mintGatewayWsUrl(connection)
      const remote = new WebSocket(wsUrl)
      peer.context.remote = remote

      remote.addEventListener('message', (event) => {
        const data = typeof event.data === 'string' ? event.data : String(event.data)
        safeSend(peer, data)
      })

      remote.addEventListener('close', (event) => {
        if (peer.context.remote !== remote) {
          return
        }

        peer.context.remote = undefined
        safeClose(peer, event.code, event.reason || 'remote closed')
      })

      listenSocketError(remote, () => {
        if (peer.context.remote !== remote) {
          return
        }

        peer.context.remote = undefined
        safeClose(peer, 1011, 'remote error')
      })

      await waitForOpen(remote)
      if (peer.context.remote === remote) {
        flushQueue(peer, remote)
      }
    } catch (error) {
      detachRemote(peer)
      const message = error instanceof Error ? error.message : '无法连接远程网关'
      sendEvent(peer, 'error', { message })
      safeClose(peer, 1011, message)
    }
  },

  message(peer: WsPeer, message) {
    const text = asText(message).trim()

    if (!text) {
      return
    }

    const remote = peer.context.remote as WebSocket | undefined

    if (remote?.readyState === WebSocket.OPEN) {
      try {
        remote.send(text)
      } catch {
        safeClose(peer, 1011, 'remote send failed')
      }
      return
    }

    const queue = (peer.context.queue as string[] | undefined) ?? []
    if (queue.length < MAX_QUEUE) {
      queue.push(text)
      peer.context.queue = queue
    }
  },

  close(peer: WsPeer) {
    detachRemote(peer)
  },

  error(peer: WsPeer) {
    silenceIncomingSocket(peer)
    detachRemote(peer)
  }
})
