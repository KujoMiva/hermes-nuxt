import type { AuthProvider, ProbeResult } from '#shared/types/gateway'
import { buildGatewayWsUrl, normalizeRemoteBaseUrl } from '#shared/utils/remote-url'
import type { GatewayConnection, NativeTokenSet } from './session'

const STATUS_TIMEOUT_MS = 8_000
const NATIVE_SKEW_SECONDS = 60

export class GatewayHttpError extends Error {
  statusCode: number
  body: string

  constructor(statusCode: number, message: string, body = '') {
    super(message)
    this.name = 'GatewayHttpError'
    this.statusCode = statusCode
    this.body = body
  }
}

function serializeCookies(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

export function applySetCookie(cookies: Record<string, string>, response: Response): void {
  const lines = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []

  for (const line of lines) {
    const [pair, ...attrs] = line.split(';')
    if (!pair) {
      continue
    }

    const eq = pair.indexOf('=')

    if (eq < 0) {
      continue
    }

    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    const maxAge = attrs.find(attr => attr.trim().toLowerCase().startsWith('max-age='))
    const maxAgeValue = maxAge ? Number(maxAge.split('=')[1]) : NaN

    if (!name) {
      continue
    }

    if (!value || maxAgeValue === 0) {
      Reflect.deleteProperty(cookies, name)
    } else {
      cookies[name] = value
    }
  }
}

function parseJson(text: string): unknown {
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function readErrorDetail(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') {
    return fallback
  }

  const record = body as { detail?: unknown, error?: unknown, message?: unknown }

  if (typeof record.detail === 'string' && record.detail.trim()) {
    return record.detail
  }

  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message
  }

  if (typeof record.error === 'string' && record.error.trim()) {
    return record.error
  }

  return fallback
}

function formatProbeError(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined
  const code
    = cause && typeof cause === 'object' && 'code' in cause ? String((cause as { code?: unknown }).code || '') : ''

  if (code === 'ECONNREFUSED') {
    return '无法连接到该 Hermes 网关（连接被拒绝）'
  }

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return '无法解析网关主机名'
  }

  const raw = error instanceof Error ? error.message : String(error)

  if (/timeout|aborted/i.test(raw)) {
    return '连接网关超时'
  }

  if (raw === 'fetch failed') {
    return '无法连接到该 Hermes 网关'
  }

  return raw
}

async function publicFetch(url: string, init: RequestInit = {}, timeoutMs = STATUS_TIMEOUT_MS): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs)
  })
}

export async function probeGateway(rawUrl: string): Promise<ProbeResult> {
  const baseUrl = normalizeRemoteBaseUrl(rawUrl)

  let status: Record<string, unknown>

  try {
    const response = await publicFetch(`${baseUrl}/api/status`)

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return {
        authFlows: [],
        authMode: 'unknown',
        baseUrl,
        error: `网关返回 HTTP ${response.status}${text ? `：${text.slice(0, 180)}` : ''}`,
        providers: [],
        reachable: false,
        version: null
      }
    }

    const body = parseJson(await response.text())
    status = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch (error) {
    return {
      authFlows: [],
      authMode: 'unknown',
      baseUrl,
      error: formatProbeError(error),
      providers: [],
      reachable: false,
      version: null
    }
  }

  const authRequired = Boolean(status.auth_required)
  const authFlows = Array.isArray(status.auth_flows)
    ? status.auth_flows.filter((flow): flow is string => typeof flow === 'string')
    : []
  const providers: AuthProvider[] = []

  if (authRequired) {
    try {
      const response = await publicFetch(`${baseUrl}/api/auth/providers`)
      const body = parseJson(await response.text()) as { providers?: unknown } | null

      if (response.ok && Array.isArray(body?.providers)) {
        for (const provider of body.providers) {
          if (!provider || typeof provider !== 'object') {
            continue
          }

          const raw = provider as {
            display_name?: unknown
            name?: unknown
            supports_password?: unknown
          }
          const name = String(raw.name || '').trim()

          if (!name) {
            continue
          }

          providers.push({
            displayName: String(raw.display_name || name),
            name,
            supportsPassword: Boolean(raw.supports_password) || name === 'basic'
          })
        }
      }
    } catch {
      // Provider listing is optional; auth mode is already known.
    }
  }

  return {
    authFlows,
    authMode: authRequired ? 'oauth' : 'token',
    baseUrl,
    error: null,
    providers,
    reachable: true,
    version: typeof status.version === 'string' ? status.version : null
  }
}

export function deriveLoginKind(probe: ProbeResult): 'oauth' | 'password' | 'token' {
  if (probe.authMode !== 'oauth') {
    return 'token'
  }

  if (probe.providers.length > 0 && probe.providers.every(provider => provider.supportsPassword)) {
    return 'password'
  }

  return 'oauth'
}

function tokenNeedsRefresh(tokens: NativeTokenSet, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!Number.isFinite(tokens.expiresAt) || tokens.expiresAt <= 0) {
    return true
  }

  return nowSeconds >= tokens.expiresAt - NATIVE_SKEW_SECONDS
}

function parseNativeTokens(body: unknown): NativeTokenSet {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const accessToken = String(record.access_token || '')

  if (!accessToken) {
    throw new Error('网关未返回 access_token')
  }

  const expiresAt = Number(record.expires_at)

  return {
    accessToken,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    provider: String(record.provider || ''),
    refreshToken: String(record.refresh_token || ''),
    userId: String(record.user_id || '')
  }
}

export async function refreshNativeTokens(connection: GatewayConnection): Promise<void> {
  const native = connection.native

  if (!native?.refreshToken || !tokenNeedsRefresh(native)) {
    return
  }

  const response = await publicFetch(nativeRefreshUrl(connection.baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: native.provider,
      refresh_token: native.refreshToken
    })
  })
  const text = await response.text()
  const body = parseJson(text)

  if (!response.ok) {
    throw new GatewayHttpError(response.status, readErrorDetail(body, '远程会话已过期，请重新登录'), text)
  }

  connection.native = parseNativeTokens(body)
}

function nativeRefreshUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl)
  const prefix = parsed.pathname.replace(/\/+$/, '')
  return `${parsed.protocol}//${parsed.host}${prefix}/auth/native/refresh`
}

export async function gatewayFetch(
  connection: GatewayConnection,
  path: string,
  init: RequestInit = {},
  timeoutMs = STATUS_TIMEOUT_MS
): Promise<Response> {
  if (connection.native) {
    await refreshNativeTokens(connection)
  }

  const headers = new Headers(init.headers)

  if (connection.native?.accessToken) {
    headers.set('Authorization', `Bearer ${connection.native.accessToken}`)
  } else if (connection.token) {
    headers.set('X-Hermes-Session-Token', connection.token)
  }

  if (Object.keys(connection.cookies).length > 0) {
    headers.set('Cookie', serializeCookies(connection.cookies))
  }

  const response = await fetch(`${connection.baseUrl}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(timeoutMs)
  })

  applySetCookie(connection.cookies, response)
  return response
}

export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  const body = parseJson(text)

  if (!response.ok) {
    throw new GatewayHttpError(response.status, readErrorDetail(body, `网关返回 HTTP ${response.status}`), text)
  }

  return body as T
}

export async function passwordLogin(
  baseUrl: string,
  input: { password: string, provider: string, username: string }
): Promise<GatewayConnection> {
  const cookies: Record<string, string> = {}
  const response = await publicFetch(`${baseUrl}/auth/password-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      password: input.password,
      provider: input.provider,
      username: input.username
    })
  })

  applySetCookie(cookies, response)
  await readJson(response)

  const connection: GatewayConnection = {
    authMode: 'oauth',
    baseUrl,
    cookies
  }

  await attachIdentity(connection)
  return connection
}

export async function tokenLogin(baseUrl: string, token: string, version?: string | null): Promise<GatewayConnection> {
  const connection: GatewayConnection = {
    authMode: 'token',
    baseUrl,
    cookies: {},
    token,
    version
  }

  const response = await gatewayFetch(connection, '/api/sessions')
  await readJson(response)
  return connection
}

export async function redeemNativeLogin(
  baseUrl: string,
  input: { code: string, verifier: string }
): Promise<GatewayConnection> {
  const parsed = new URL(baseUrl)
  const prefix = parsed.pathname.replace(/\/+$/, '')
  const response = await publicFetch(`${parsed.protocol}//${parsed.host}${prefix}/auth/native/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: input.code,
      code_verifier: input.verifier
    })
  })
  const native = parseNativeTokens(await readJson(response))
  const connection: GatewayConnection = {
    authMode: 'oauth',
    baseUrl,
    cookies: {},
    native
  }

  await attachIdentity(connection)
  return connection
}

async function attachIdentity(connection: GatewayConnection): Promise<void> {
  const response = await gatewayFetch(connection, '/api/auth/me')
  const me = await readJson<{
    display_name?: string
    email?: string
    provider?: string
  }>(response)

  connection.user = {
    displayName: me.display_name || me.email || me.provider || '已登录',
    email: me.email,
    provider: me.provider
  }
}

export async function mintGatewayWsUrl(connection: GatewayConnection): Promise<string> {
  if (connection.authMode === 'oauth') {
    const response = await gatewayFetch(connection, '/api/auth/ws-ticket', { method: 'POST' })
    const body = await readJson<{ ticket?: string }>(response)
    const ticket = String(body.ticket || '')

    if (!ticket) {
      throw new Error('网关未返回 WebSocket ticket')
    }

    return buildGatewayWsUrl(connection.baseUrl, { name: 'ticket', value: ticket })
  }

  if (!connection.token) {
    throw new Error('缺少会话令牌')
  }

  return buildGatewayWsUrl(connection.baseUrl, { name: 'token', value: connection.token })
}
