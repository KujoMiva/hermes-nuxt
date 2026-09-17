const IMAGE_REF_LINE_RE = /^@image:([^\n]*)\n?/gm
const SCREENSHOT_LINE_RE = /^\[screenshot\]\n?/gm

export function unwrapImageRefValue(raw: string) {
  const value = raw.trim()
  if (!value) return ''
  const quoted = value.match(/^(`|"|')([\s\S]*)\1$/)
  return (quoted?.[2] ?? value).trim()
}

export function wrapImageRefValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/[\s]/.test(trimmed)) return `\`${trimmed.replace(/`/g, '')}\``
  return trimmed
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

export function composeImageMessage(text: string, refs: string[] = []) {
  const unique = [...new Set(refs.map(item => item.trim()).filter(Boolean))]
  const lines = unique.map(ref => `@image:${wrapImageRefValue(ref)}`)
  const caption = text.trim()
  if (!lines.length) return caption
  return caption ? `${caption}\n${lines.join('\n')}` : lines.join('\n')
}

export function isDirectImageSrc(src: string) {
  return /^(?:https?:|data:|blob:)/i.test(src) || src.startsWith('/api/media')
}

export function chatMediaSrc(src: string) {
  const value = src.trim()
  if (!value) return ''
  if (isDirectImageSrc(value)) return value
  return `/api/media?path=${encodeURIComponent(value)}`
}
