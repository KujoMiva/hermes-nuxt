import {
  JsonRpcGatewayClient,
  type ConnectionState,
  type GatewayEvent
} from '~/utils/gateway-client'
import {
  RESUME_RECONNECT_THROTTLE_MS,
  shouldReconnectOnResume
} from '~/utils/gatewayReconnect'

let client: JsonRpcGatewayClient | null = null
let connecting: Promise<JsonRpcGatewayClient> | null = null
let connectGeneration = 0
let lastResumeAt = 0
let lifecycleBound = false
let quietClose = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0
let wantOpen = false

function gatewayWsUrl() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/gateway-ws`
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function useGateway() {
  const state = useState<ConnectionState>('gateway-connection', () => 'idle')
  const lastError = useState('gateway-last-error', () => '')

  function getClient() {
    if (!import.meta.client) {
      throw new Error('网关仅在浏览器中连接')
    }

    bindLifecycle()

    if (!client) {
      client = new JsonRpcGatewayClient()
      client.onState((next) => {
        state.value = next
        if ((next === 'closed' || next === 'error') && wantOpen && !quietClose) {
          scheduleReconnect()
        }
      })
    }

    return client
  }

  function scoped(params: Record<string, unknown> = {}) {
    const profile = useCookie('hermes-profile', { path: '/', sameSite: 'lax' }).value?.trim()
    if (profile && params.profile == null) {
      return { ...params, profile }
    }
    return params
  }

  function scheduleReconnect() {
    if (!import.meta.client || !wantOpen) {
      return
    }

    clearReconnectTimer()
    const delay = Math.min(15_000, 800 * (2 ** reconnectAttempt))
    reconnectAttempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void ensureConnected().catch(() => {})
    }, delay)
  }

  async function ensureConnected() {
    if (!import.meta.client) {
      throw new Error('网关仅在浏览器中连接')
    }

    wantOpen = true
    bindLifecycle()
    const gw = getClient()
    if (gw.connectionState === 'open' && gw.socketReadyState === WebSocket.OPEN) {
      reconnectAttempt = 0
      return gw
    }

    if (connecting) {
      return connecting
    }

    const generation = ++connectGeneration
    connecting = gw.connect(gatewayWsUrl())
      .then(() => {
        if (generation !== connectGeneration) {
          return gw
        }
        reconnectAttempt = 0
        lastError.value = ''
        return gw
      })
      .catch((error) => {
        if (generation === connectGeneration) {
          lastError.value = error instanceof Error ? error.message : String(error)
        }
        throw error
      })
      .finally(() => {
        if (generation === connectGeneration) {
          connecting = null
        }
      })

    return connecting
  }

  async function request<T>(method: string, params: Record<string, unknown> = {}, timeoutMs?: number) {
    const gw = await ensureConnected()
    return gw.request<T>(method, scoped(params), timeoutMs)
  }

  function on<P = unknown>(type: string, handler: (event: GatewayEvent<P>) => void) {
    return getClient().on(type, handler)
  }

  function dropTransport() {
    quietClose = true
    try {
      client?.close()
    } finally {
      quietClose = false
      connecting = null
      connectGeneration += 1
    }
  }

  async function resumeNow(event?: Event) {
    if (!wantOpen) {
      return
    }

    const now = Date.now()
    if (now - lastResumeAt < RESUME_RECONNECT_THROTTLE_MS) {
      return
    }

    const gw = getClient()
    const action = shouldReconnectOnResume({
      connectingStartedAt: gw.handshakeStartedAt,
      connectionState: gw.connectionState,
      hidden: document.visibilityState === 'hidden',
      lastInboundAt: gw.lastInboundAt,
      now,
      online: isOnline(),
      persistedPageShow: Boolean(event && 'persisted' in event && (event as PageTransitionEvent).persisted),
      readyState: gw.socketReadyState,
      wantOpen
    })

    if (action === 'keep') {
      return
    }

    lastResumeAt = now
    reconnectAttempt = 0
    clearReconnectTimer()

    if (action === 'ping') {
      void gw.request('gateway.ping', {}, 8_000).catch(() => {
        if (gw.socketReadyState === WebSocket.OPEN) {
          return
        }
        dropTransport()
        void ensureConnected().catch(() => {})
      })
      return
    }

    dropTransport()
    await ensureConnected().catch(() => {})
  }

  function bindLifecycle() {
    if (!import.meta.client || lifecycleBound) {
      return
    }

    lifecycleBound = true
    const onResume = (event?: Event) => {
      void resumeNow(event)
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        onResume()
      }
    })
    window.addEventListener('pageshow', onResume)
    window.addEventListener('online', onResume)
    document.addEventListener('resume', onResume)
  }

  function close() {
    wantOpen = false
    clearReconnectTimer()
    dropTransport()
    client = null
    connecting = null
    state.value = 'closed'
  }

  return {
    close,
    ensureConnected,
    lastError,
    on,
    request,
    resumeNow,
    state
  }
}
