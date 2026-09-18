import { describe, expect, it } from 'vitest'
import { chatMediaSrc, extractImageRefs, unwrapImageRefValue } from '~/utils/imageRefs'

describe('unwrapImageRefValue', () => {
  it('strips wrapping quotes', () => {
    expect(unwrapImageRefValue(' `https://x/a.png` ')).toBe('https://x/a.png')
    expect(unwrapImageRefValue('"https://x/a.png"')).toBe('https://x/a.png')
    expect(unwrapImageRefValue('plain')).toBe('plain')
  })
})

describe('extractImageRefs', () => {
  it('pulls @image lines and drops the screenshot marker', () => {
    const text = [
      'see this',
      '@image:https://cdn.example/a.png',
      '[screenshot]',
      '@image:`/tmp/local.png`',
      'after'
    ].join('\n')
    expect(extractImageRefs(text)).toEqual({
      cleanedText: 'see this\nafter',
      refs: ['https://cdn.example/a.png', '/tmp/local.png']
    })
  })
})

describe('chatMediaSrc', () => {
  it('only keeps http, data, and blob urls', () => {
    expect(chatMediaSrc('https://cdn.example/a.png')).toBe('https://cdn.example/a.png')
    expect(chatMediaSrc('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
    expect(chatMediaSrc('blob:https://app/1')).toBe('blob:https://app/1')
    expect(chatMediaSrc('/opt/data/cat.png')).toBe('')
    expect(chatMediaSrc('/api/media?path=x')).toBe('')
  })
})
