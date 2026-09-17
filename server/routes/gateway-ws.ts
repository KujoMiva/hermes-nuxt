import { mintGatewayWsUrl } from '../utils/gateway'
import { getConnection, readSessionIdFromCookieHeader } from '../utils/session'

type WsPeer = {
  close: (code?: number, reason?: string) => void
  context: Record<string, unknown>
  request?: Request
  send: (data: string) => void
}

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
    const record = message as { data?: unknown; text?: () => string; toString?: () => string }

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

function sendEvent(peer: WsPeer, type: string, payload: Record<string, unknown>): void {
  peer.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'event',
      params: { type, payload }
    })
  )
}

function flushQueue(peer: WsPeer, remote: WebSocket): void {
  const queue = (peer.context.queue as string[] | undefined) ?? []
  peer.context.queue = []

  for (const item of queue) {
    if (remote.readyState === WebSocket.OPEN) {
      remote.send(item)
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
  })
}

export default defineWebSocketHandler({
  async open(peer: WsPeer) {
    peer.context.queue = []
    const connection = getConnection(readSessionIdFromCookieHeader(cookieHeader(peer)))

    if (!connection) {
      sendEvent(peer, 'error', { message: '未登录，或服务已重启，请重新连接网关' })
      peer.close(4401, 'unauthorized')
      return
    }

    try {
      const wsUrl = await mintGatewayWsUrl(connection)
      const remote = new WebSocket(wsUrl)
      peer.context.remote = remote

      remote.addEventListener('message', event => {
        const data = typeof event.data === 'string' ? event.data : String(event.data)
        peer.send(data)
      })

      remote.addEventListener('close', event => {
        peer.close(event.code || 1000, event.reason || 'remote closed')
      })

      await waitForOpen(remote)
      flushQueue(peer, remote)
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法连接远程网关'
      sendEvent(peer, 'error', { message })
      peer.close(1011, message.slice(0, 120))
    }
  },

  message(peer: WsPeer, message) {
    const text = asText(message).trim()

    if (!text) {
      return
    }

    const remote = peer.context.remote as WebSocket | undefined

    if (remote?.readyState === WebSocket.OPEN) {
      remote.send(text)
      return
    }

    const queue = (peer.context.queue as string[] | undefined) ?? []
    queue.push(text)
    peer.context.queue = queue
  },

  close(peer: WsPeer) {
    const remote = peer.context.remote as WebSocket | undefined

    if (remote && (remote.readyState === WebSocket.OPEN || remote.readyState === WebSocket.CONNECTING)) {
      remote.close()
    }
  }
})
