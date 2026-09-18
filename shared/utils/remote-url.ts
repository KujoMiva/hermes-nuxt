/** Mirror of hermes-agent/apps/desktop/src/lib/remote-url.ts */
export function coerceRemoteUrlScheme(rawUrl: string): string {
  const value = String(rawUrl || '').trim()

  if (!value || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value
  }

  return `http://${value}`
}

/** Mirror of hermes-agent/apps/desktop/electron/connection-config.ts normalizeRemoteBaseUrl */
export function normalizeRemoteBaseUrl(rawUrl: string): string {
  const value = coerceRemoteUrlScheme(rawUrl)

  if (!value) {
    throw new Error('请输入远程网关 URL')
  }

  let parsed: URL

  try {
    parsed = new URL(value)
  } catch (error) {
    throw new Error(`网关 URL 无效：${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`网关 URL 必须是 http:// 或 https://，当前是 ${parsed.protocol}`)
  }

  parsed.hash = ''
  parsed.search = ''
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')

  return parsed.toString().replace(/\/+$/, '')
}

export function gatewayHostLabel(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl)
    return parsed.host + (parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '')
  } catch {
    return baseUrl
  }
}

export function buildGatewayWsUrl(baseUrl: string, auth: { name: string, value: string }): string {
  const parsed = new URL(baseUrl)
  const wsScheme = parsed.protocol === 'https:' ? 'wss' : 'ws'
  const prefix = parsed.pathname.replace(/\/+$/, '')
  const query = new URLSearchParams()
  query.set(auth.name, auth.value)

  return `${wsScheme}://${parsed.host}${prefix}/api/ws?${query.toString()}`
}
