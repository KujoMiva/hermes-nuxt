const IMAGE_REF_LINE_RE = /^@image:([^\n]*)\n?/gm
const SCREENSHOT_LINE_RE = /^\[screenshot\]\n?/gm
const FILE_URL_RE = /^file:\/\//i
const GATEWAY_PATH_RE = /^(?:[a-zA-Z]:[\\/]|\\\\|~\/|\/)/
const NEEDS_QUOTING = /[\s()[\]{}<>"'`]/

export function unwrapImageRefValue(raw: string) {
  const value = raw.trim()
  if (!value) return ''
  const quoted = value.match(/^(`|"|')([\s\S]*)\1$/)
  return (quoted?.[2] ?? value).trim()
}

export function extractImageRefs(text: string) {
  const refs: string[] = []
  if (!text) return { cleanedText: '', refs }

  let cleanedText = text.replace(IMAGE_REF_LINE_RE, (line) => {
    const value = unwrapImageRefValue(line.slice('@image:'.length))
    if (value) refs.push(value)
    return ''
  })

  if (refs.length) cleanedText = cleanedText.replace(SCREENSHOT_LINE_RE, '')

  return { cleanedText: cleanedText.trim(), refs }
}

export function durableUserCaption(text: string) {
  return extractImageRefs(text).cleanedText.trim()
}

export function formatImageRefValue(value: string) {
  if (!NEEDS_QUOTING.test(value)) return value
  for (const quote of ['`', '"', '\''] as const) {
    if (!value.includes(quote)) return `${quote}${value}${quote}`
  }
  return value
}

export function isDirectImageSrc(src: string) {
  return /^(?:https?:|data:|blob:)/i.test(src)
}

export function filePathFromMediaSrc(src: string) {
  const raw = unwrapImageRefValue(src.startsWith('@image:') ? src.slice('@image:'.length) : src)
  if (!raw) return ''
  if (raw.startsWith('/api/media?')) {
    try {
      return decodeURIComponent(new URL(raw, 'http://local.invalid').searchParams.get('path') || '')
    } catch {
      return ''
    }
  }
  if (!FILE_URL_RE.test(raw)) return raw
  try {
    const url = new URL(raw)
    let pathname = decodeURIComponent(url.pathname)
    if (/^\/[a-zA-Z]:/.test(pathname)) pathname = pathname.slice(1)
    return pathname
  } catch {
    return raw.replace(FILE_URL_RE, '')
  }
}

export function isGatewayImagePath(src: string) {
  const value = filePathFromMediaSrc(src)
  if (!value || isDirectImageSrc(value) || value.startsWith('/api/')) return false
  return GATEWAY_PATH_RE.test(value)
}

export function gatewayImagePaths(images?: string[]) {
  const paths: string[] = []
  for (const raw of images || []) {
    const value = filePathFromMediaSrc(raw)
    if (isGatewayImagePath(value)) paths.push(value)
  }
  return [...new Set(paths)]
}

export function persistUserMessageText(text: string, images?: string[]) {
  const caption = text.trim()
  const refs = gatewayImagePaths(images).map(path => `@image:${formatImageRefValue(path)}`)
  if (!refs.length) return caption
  return caption ? `${caption}\n${refs.join('\n')}` : refs.join('\n')
}

export function chatMediaSrc(src: string) {
  const raw = unwrapImageRefValue(src.startsWith('@image:') ? src.slice('@image:'.length) : src)
  if (!raw) return ''
  if (isDirectImageSrc(raw) || raw.startsWith('/api/media?')) return raw
  const value = filePathFromMediaSrc(raw)
  if (isGatewayImagePath(value)) return `/api/media?path=${encodeURIComponent(value)}`
  return ''
}
