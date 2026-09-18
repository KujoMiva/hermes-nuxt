const IMAGE_REF_LINE_RE = /^@image:([^\n]*)\n?/gm
const SCREENSHOT_LINE_RE = /^\[screenshot\]\n?/gm
const FILE_URL_RE = /^file:\/\//i
const GATEWAY_PATH_RE = /^(?:[a-zA-Z]:[\\/]|\\\\|~\/|\/)/

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

export function isDirectImageSrc(src: string) {
  return /^(?:https?:|data:|blob:)/i.test(src)
}

export function filePathFromMediaSrc(src: string) {
  const raw = unwrapImageRefValue(src.startsWith('@image:') ? src.slice('@image:'.length) : src)
  if (!raw) return ''
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

export function chatMediaSrc(src: string) {
  const value = filePathFromMediaSrc(src)
  if (!value) return ''
  if (isDirectImageSrc(value) || value.startsWith('/api/media?')) return value
  if (isGatewayImagePath(value)) return `/api/media?path=${encodeURIComponent(value)}`
  return ''
}
