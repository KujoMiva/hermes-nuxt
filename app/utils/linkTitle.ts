const TITLE_CACHE_LIMIT = 500
const TITLE_MAX_LENGTH = 240
const TITLE_ERROR_RE
  = /\b(?:access denied|attention required|captcha|error|forbidden|just a moment|not found|request blocked|too many requests)\b/i

const DOMAIN_RE = /^(?:www\.)?[a-z0-9](?:[a-z0-9-]*\.)+[a-z]{2,}(?::\d+)?(?:[/?#][^\s]*)?$/i
const SKIP_PROTO_RE = /^(?:file|data|mailto|javascript|blob|chrome|about|hermes):/i
const LOCAL_HOSTNAME_RE = /^(?:localhost|localhost\.localdomain)$/i
const LOCAL_HOST_SUFFIXES = ['.corp', '.home', '.internal', '.lan', '.local', '.localdomain']
const STATUS_PERMALINK_HOST_RE = /^(?:mobile\.)?(?:x|twitter)\.com$/i
const STATUS_PERMALINK_PATH_RE = /^\/[^/]+\/status\/\d+\/?$/i

const HTML_ENTITIES: Record<string, string> = {
  '#39': '\'',
  'amp': '&',
  'apos': '\'',
  'gt': '>',
  'lt': '<',
  'nbsp': ' ',
  'quot': '"'
}

const titleCache = new Map<string, string>()
const titleInflight = new Map<string, Promise<string>>()

export function normalizeExternalUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return trimmed
  return DOMAIN_RE.test(trimmed) ? `https://${trimmed}` : trimmed
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(normalizeExternalUrl(value))
  } catch {
    return null
  }
}

export function titleCacheKey(value: string): string {
  const url = parseUrl(value)
  if (!url) return normalizeExternalUrl(value)
  const host = url.hostname.replace(/^www\./i, '').toLowerCase()
  const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '') || '/'
  return `${host}${pathname}${url.search || ''}`
}

function cacheTitle(key: string, title: string) {
  if (titleCache.size >= TITLE_CACHE_LIMIT) {
    const oldest = titleCache.keys().next().value
    if (oldest) titleCache.delete(oldest)
  }
  titleCache.set(key, title)
}

export function hostPathLabel(value: string): string {
  const url = parseUrl(value)
  if (!url) return value
  const host = url.hostname.replace(/^www\./, '')
  const path = url.pathname && url.pathname !== '/' ? url.pathname.replace(/\/$/, '') : ''
  return `${host}${path}`
}

function cleanSlug(segment: string): string {
  try {
    return decodeURIComponent(segment)
      .replace(/\.a\d+\..*$/i, '')
      .replace(/\.(?:html?|php|aspx?)$/i, '')
      .replace(/(?:[-_.](?:[a-z]{1,3}\d{2,}|i\d{2,}))+$/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return ''
  }
}

export function urlSlugTitleLabel(value: string): string {
  const url = parseUrl(value)
  if (url && STATUS_PERMALINK_HOST_RE.test(url.hostname) && STATUS_PERMALINK_PATH_RE.test(url.pathname)) {
    return hostPathLabel(value)
  }
  for (const segment of url?.pathname.split('/').filter(Boolean).reverse() ?? []) {
    const cleaned = cleanSlug(segment)
    if (!cleaned || !/[a-z]/i.test(cleaned)) continue
    if (/^(?:[a-z]{1,3}\d+|\d+)$/i.test(cleaned.replace(/\s+/g, ''))) continue
    const titled = cleaned.replace(/\b[a-z]/g, char => char.toUpperCase())
    if (titled.length >= 4) return titled
  }
  return hostPathLabel(value)
}

function parseIpv4Octets(value: string): [number, number, number, number] | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const next = Number(part)
    if (!Number.isInteger(next) || next < 0 || next > 255) return null
    octets.push(next)
  }
  const a = octets[0]
  const b = octets[1]
  const c = octets[2]
  const d = octets[3]
  if (a == null || b == null || c == null || d == null) return null
  return [a, b, c, d]
}

function isPrivateIpv4(value: string): boolean {
  const octets = parseIpv4Octets(value)
  if (!octets) return false
  const [a, b] = octets
  return (
    a === 0
    || a === 10
    || a === 127
    || a === 255
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
  )
}

function isPrivateIpv6(value: string): boolean {
  const normalized = value.toLowerCase()
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (
    normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb')
  ) return true
  if (normalized.startsWith('::ffff:')) return isPrivateIpv4(normalized.slice('::ffff:'.length))
  return false
}

function normalizeHostname(value: string): string {
  const withoutBrackets = value.replace(/^\[/, '').replace(/\]$/, '')
  const withoutZoneId = withoutBrackets.split('%', 1)[0] || ''
  return withoutZoneId.replace(/\.$/, '').toLowerCase()
}

export function isPrivateOrLocalHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname)
  if (!normalized) return true
  if (LOCAL_HOSTNAME_RE.test(normalized)) return true
  if (LOCAL_HOST_SUFFIXES.some(suffix => normalized.endsWith(suffix))) return true
  if (parseIpv4Octets(normalized)) return isPrivateIpv4(normalized)
  if (normalized.includes(':')) return isPrivateIpv6(normalized)
  return !normalized.includes('.')
}

/** DNS 解析结果：未知格式按私网处理（失败关闭）。 */
export function isBlockedResolvedAddress(address: string): boolean {
  const normalized = normalizeHostname(address)
  if (!normalized) return true
  if (parseIpv4Octets(normalized)) return isPrivateIpv4(normalized)
  if (normalized.includes(':')) return isPrivateIpv6(normalized)
  return true
}

export function isTitleFetchable(value: string): boolean {
  if (!value || SKIP_PROTO_RE.test(value)) return false
  const url = parseUrl(value)
  return Boolean(url && /^https?:$/.test(url.protocol) && !isPrivateOrLocalHost(url.hostname))
}

export function pickAuthoredLabel(label: string | undefined, target: string): string | undefined {
  const trimmed = label?.trim()
  return trimmed && normalizeExternalUrl(trimmed) !== target ? trimmed : undefined
}

export function usableTitle(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean && !TITLE_ERROR_RE.test(clean) ? clean.slice(0, TITLE_MAX_LENGTH) : ''
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/gi, (_match, key: string) => HTML_ENTITIES[key.toLowerCase()] ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16) || 32))
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10) || 32))
}

export function parseHtmlTitle(html: string): string {
  const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return raw ? decodeHtmlEntities(raw).replace(/\s+/g, ' ').trim() : ''
}

export function peekCachedLinkTitle(url: string): string | undefined {
  const key = titleCacheKey(normalizeExternalUrl(url))
  return titleCache.has(key) ? titleCache.get(key) : undefined
}

export function cachedLinkTitle(url: string): string {
  return peekCachedLinkTitle(url) ?? ''
}

export async function fetchLinkTitle(url: string): Promise<string> {
  const normalizedUrl = normalizeExternalUrl(url)
  const key = titleCacheKey(normalizedUrl)
  if (!isTitleFetchable(normalizedUrl)) return ''
  if (titleCache.has(key)) return titleCache.get(key) ?? ''
  const pending = titleInflight.get(key)
  if (pending) return pending

  const promise = fetch(`/api/link-title?url=${encodeURIComponent(normalizedUrl)}`)
    .then(async (response) => {
      if (!response.ok) return { title: '', store: false }
      const payload = await response.json().catch(() => null) as { title?: unknown } | null
      return {
        title: usableTitle(typeof payload?.title === 'string' ? payload.title : ''),
        store: true
      }
    })
    .catch(() => ({ title: '', store: false }))
    .then((result) => {
      if (result.store) cacheTitle(key, result.title)
      return result.title
    })
    .finally(() => {
      titleInflight.delete(key)
    })

  titleInflight.set(key, promise)
  return promise
}
