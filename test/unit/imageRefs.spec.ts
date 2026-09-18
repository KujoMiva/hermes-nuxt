import { describe, expect, it } from 'vitest'
import { chatMediaSrc, extractImageRefs, isGatewayImagePath, unwrapImageRefValue } from '~/utils/imageRefs'

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

  it('unwraps quoted windows upload paths', () => {
    const path = String.raw`C:\Users\KujoMiva\AppData\Local\hermes\images\upload_1.jpg`
    expect(extractImageRefs(`测试一下识图\n@image:\`${path}\``)).toEqual({
      cleanedText: '测试一下识图',
      refs: [path]
    })
  })
})

describe('chatMediaSrc', () => {
  it('keeps browser-safe urls and proxies gateway-local files', () => {
    expect(chatMediaSrc('https://cdn.example/a.png')).toBe('https://cdn.example/a.png')
    expect(chatMediaSrc('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
    expect(chatMediaSrc('blob:https://app/1')).toBe('blob:https://app/1')
    expect(chatMediaSrc('/api/media?path=x')).toBe('/api/media?path=x')
    expect(chatMediaSrc('/opt/data/cat.png')).toBe(`/api/media?path=${encodeURIComponent('/opt/data/cat.png')}`)
    expect(chatMediaSrc(String.raw`C:\Users\me\hermes\images\a.jpg`)).toBe(
      `/api/media?path=${encodeURIComponent(String.raw`C:\Users\me\hermes\images\a.jpg`)}`
    )
    expect(chatMediaSrc('relative.png')).toBe('')
    expect(isGatewayImagePath('/opt/data/cat.png')).toBe(true)
    expect(isGatewayImagePath('https://cdn.example/a.png')).toBe(false)
  })
})
