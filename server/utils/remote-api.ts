import { createError, getCookie, getQuery, getRouterParam, readBody, type H3Event } from 'h3'
import { GatewayHttpError, gatewayFetch } from './gateway'
import { getConnectionForEvent } from './session'

const DEFAULT_TIMEOUT_MS = 20_000

const ALLOWED: Array<{ method: string, pattern: RegExp, timeoutMs?: number }> = [
  { method: 'GET', pattern: /^\/api\/model\/info$/ },
  { method: 'GET', pattern: /^\/api\/model\/options$/, timeoutMs: 60_000 },
  { method: 'GET', pattern: /^\/api\/model\/recommended-default$/ },
  { method: 'GET', pattern: /^\/api\/model\/auxiliary$/ },
  { method: 'GET', pattern: /^\/api\/model\/moa$/ },
  { method: 'PUT', pattern: /^\/api\/model\/moa$/ },
  { method: 'POST', pattern: /^\/api\/model\/set$/, timeoutMs: 45_000 },
  { method: 'GET', pattern: /^\/api\/config$/ },
  { method: 'PUT', pattern: /^\/api\/config$/ },
  { method: 'GET', pattern: /^\/api\/env$/ },
  { method: 'PUT', pattern: /^\/api\/env$/ },
  { method: 'DELETE', pattern: /^\/api\/env$/ },
  { method: 'POST', pattern: /^\/api\/env\/reveal$/ },
  { method: 'GET', pattern: /^\/api\/sessions\/search$/ },
  { method: 'GET', pattern: /^\/api\/providers\/custom-endpoints$/ },
  { method: 'POST', pattern: /^\/api\/providers\/custom-endpoints$/ },
  { method: 'POST', pattern: /^\/api\/providers\/custom-endpoints\/validate$/, timeoutMs: 20_000 },
  { method: 'POST', pattern: /^\/api\/providers\/custom-endpoints\/[^/]+\/activate$/ },
  { method: 'DELETE', pattern: /^\/api\/providers\/custom-endpoints\/[^/]+$/ }
]

function slugFromEvent(event: H3Event) {
  const raw = getRouterParam(event, 'path') ?? event.context.params?.path
  if (Array.isArray(raw)) return raw.join('/')
  return String(raw || '').replace(/^\/+/, '')
}

function remotePathFromSlug(slug: string) {
  if (!slug || slug.includes('..') || slug.includes('//')) {
    throw createError({ statusCode: 400, message: '无效的网关路径' })
  }
  return `/api/${slug}`
}

function matchRule(method: string, path: string) {
  return ALLOWED.find(rule => rule.method === method && rule.pattern.test(path))
}

function queryRecord(event: H3Event) {
  const query = getQuery(event)
  const record: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue
    record[key] = Array.isArray(value) ? String(value[0] ?? '') : String(value)
  }
  return record
}

function withProfile(event: H3Event, query: Record<string, string>) {
  if (query.profile) return query
  const profile = getCookie(event, 'hermes-profile')?.trim()
  if (profile) query.profile = profile
  return query
}

function pathWithQuery(path: string, query: Record<string, string>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== '') params.set(key, value)
  }
  const suffix = params.toString()
  return suffix ? `${path}?${suffix}` : path
}

function detailMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== 'object') return fallback
  const record = body as { detail?: unknown, error?: unknown, message?: unknown }
  if (typeof record.detail === 'string' && record.detail.trim()) return record.detail
  if (Array.isArray(record.detail)) {
    const parts = record.detail.map((item) => {
      if (item && typeof item === 'object' && 'msg' in item) return String((item as { msg?: unknown }).msg || '')
      return typeof item === 'string' ? item : ''
    }).filter(Boolean)
    if (parts.length) return parts.join('；')
  }
  if (typeof record.message === 'string' && record.message.trim()) return record.message
  if (typeof record.error === 'string' && record.error.trim()) return record.error
  return fallback
}

function parseJson(text: string) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function proxyDashboardRequest(event: H3Event) {
  const connection = getConnectionForEvent(event)
  if (!connection) {
    throw createError({ statusCode: 401, statusMessage: '未登录，或服务已重启，请重新连接网关', message: '未登录，或服务已重启，请重新连接网关' })
  }

  const method = event.method.toUpperCase()
  const path = remotePathFromSlug(slugFromEvent(event))
  const rule = matchRule(method, path)
  if (!rule) {
    throw createError({ statusCode: 404, message: `不允许转发：${method} ${path}` })
  }

  const query = withProfile(event, queryRecord(event))
  let body: unknown
  if (method !== 'GET' && method !== 'HEAD') {
    body = await readBody(event).catch(() => undefined)
  }

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'

  try {
    const response = await gatewayFetch(
      connection,
      pathWithQuery(path, query),
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      },
      rule.timeoutMs ?? DEFAULT_TIMEOUT_MS
    )
    const text = await response.text()
    const parsed = parseJson(text)

    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        statusMessage: detailMessage(parsed, `网关返回 HTTP ${response.status}`),
        message: detailMessage(parsed, `网关返回 HTTP ${response.status}`)
      })
    }

    return parsed
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    if (error instanceof GatewayHttpError) {
      throw createError({
        statusCode: error.statusCode,
        message: error.message
      })
    }
    throw createError({
      statusCode: 502,
      message: error instanceof Error ? error.message : '转发网关请求失败'
    })
  }
}
