import {
  JsonRpcGatewayClient,
  type ConnectionState,
  type GatewayEvent
} from '~/utils/gateway-client'

let client: JsonRpcGatewayClient | null = null
let connecting: Promise<JsonRpcGatewayClient> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempt = 0
let wantOpen = false

function gatewayWsUrl() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/gateway-ws`
}

export function useGateway() {
  const state = useState<ConnectionState>('gateway-connection', () => 'idle')
  const lastError = useState('gateway-last-error', () => '')

  function getClient() {
    if (!import.meta.client) {
      throw new Error('网关仅在浏览器中连接')
    }

    if (!client) {
      client = new JsonRpcGatewayClient()
      client.onState((next) => {
        state.value = next
        if (next === 'closed' && wantOpen) {
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
    if (!import.meta.client || reconnectTimer || !wantOpen) {
      return
    }

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
    const gw = getClient()
    if (gw.connectionState === 'open') {
      reconnectAttempt = 0
      return gw
    }

    if (connecting) {
      return connecting
    }

    connecting = gw.connect(gatewayWsUrl())
      .then(() => {
        reconnectAttempt = 0
        lastError.value = ''
        return gw
      })
      .catch((error) => {
        lastError.value = error instanceof Error ? error.message : String(error)
        throw error
      })
      .finally(() => {
        connecting = null
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

  function close() {
    wantOpen = false
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    client?.close()
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
    state
  }
}
