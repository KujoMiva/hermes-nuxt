import { createError, defineEventHandler, getCookie, getQuery, setHeader } from 'h3'
import { GatewayHttpError, gatewayFetch } from '../utils/gateway'
import { getConnectionForEvent } from '../utils/session'

const MEDIA_TIMEOUT_MS = 45_000
const ALLOWED_MIME = new Set([
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/x-icon'
])

function queryValue(raw: unknown) {
  if (Array.isArray(raw)) return String(raw[0] || '').trim()
  return String(raw || '').trim()
}

function decodeDataUrl(raw: string) {
  const match = /^data:(image\/[\w.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/i.exec(raw.trim())
  if (!match?.[1] || !match[2]) return null
  const mime = match[1].toLowerCase()
  if (!ALLOWED_MIME.has(mime)) return null
  try {
    return { mime, bytes: Buffer.from(match[2], 'base64') }
  } catch {
    return null
  }
}

function detailMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== 'object') return fallback
  const record = body as { detail?: unknown, error?: unknown, message?: unknown }
  if (typeof record.detail === 'string' && record.detail.trim()) return record.detail
  if (typeof record.message === 'string' && record.message.trim()) return record.message
  if (typeof record.error === 'string' && record.error.trim()) return record.error
  return fallback
}

export default defineEventHandler(async (event) => {
  const connection = getConnectionForEvent(event)
  if (!connection) {
    throw createError({
      statusCode: 401,
      statusMessage: '未登录，或服务已重启，请重新连接网关',
      message: '未登录，或服务已重启，请重新连接网关'
    })
  }

  const path = queryValue(getQuery(event).path)
  if (!path || path.length > 4096 || path.includes('\0') || /^(?:https?:|data:|javascript:|blob:)/i.test(path)) {
    throw createError({ statusCode: 400, message: '无效的图片路径' })
  }

  const query = new URLSearchParams({ path })
  const profile = getCookie(event, 'hermes-profile')?.trim()
  if (profile) query.set('profile', profile)

  try {
    const response = await gatewayFetch(
      connection,
      `/api/media?${query.toString()}`,
      {},
      MEDIA_TIMEOUT_MS
    )
    const contentType = (response.headers.get('content-type') || '').split(';')[0]?.trim().toLowerCase() || ''

    if (contentType.startsWith('image/')) {
      if (!ALLOWED_MIME.has(contentType)) {
        throw createError({ statusCode: 415, message: '不支持的图片类型' })
      }
      if (!response.ok) {
        throw createError({ statusCode: response.status, message: `网关返回 HTTP ${response.status}` })
      }
      setHeader(event, 'content-type', contentType)
      setHeader(event, 'cache-control', 'private, max-age=3600')
      setHeader(event, 'x-content-type-options', 'nosniff')
      return Buffer.from(await response.arrayBuffer())
    }

    const text = await response.text()
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = null
    }

    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        message: detailMessage(parsed, `网关返回 HTTP ${response.status}`)
      })
    }

    const dataUrl = parsed && typeof parsed === 'object'
      ? String((parsed as { data_url?: unknown }).data_url || '')
      : ''
    const decoded = decodeDataUrl(dataUrl)
    if (!decoded) {
      throw createError({ statusCode: 415, message: '网关未返回可用图片' })
    }

    setHeader(event, 'content-type', decoded.mime)
    setHeader(event, 'cache-control', 'private, max-age=3600')
    setHeader(event, 'x-content-type-options', 'nosniff')
    return decoded.bytes
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
      message: error instanceof Error ? error.message : '读取网关图片失败'
    })
  }
})
