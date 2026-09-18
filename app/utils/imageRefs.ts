const IMAGE_REF_LINE_RE = /^@image:([^\n]*)\n?/gm
const SCREENSHOT_LINE_RE = /^\[screenshot\]\n?/gm

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

export function chatMediaSrc(src: string) {
  const value = src.trim()
  if (!value) return ''
  return isDirectImageSrc(value) ? value : ''
}
