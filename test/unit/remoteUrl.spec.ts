import { describe, expect, it } from 'vitest'
import {
  buildGatewayWsUrl,
  coerceRemoteUrlScheme,
  gatewayHostLabel,
  joinRemoteUrl,
  normalizeRemoteBaseUrl,
  splitRemoteUrl
} from '#shared/utils/remote-url'

describe('coerceRemoteUrlScheme', () => {
  it('adds http when the scheme is missing', () => {
    expect(coerceRemoteUrlScheme('127.0.0.1:9119')).toBe('http://127.0.0.1:9119')
    expect(coerceRemoteUrlScheme('https://gw.example/p')).toBe('https://gw.example/p')
    expect(coerceRemoteUrlScheme('  ')).toBe('')
  })
})

describe('splitRemoteUrl', () => {
  it('reads http and https from a full url', () => {
    expect(splitRemoteUrl('https://gw.example/p')).toEqual({ host: 'gw.example/p', scheme: 'https' })
    expect(splitRemoteUrl('HTTP://127.0.0.1:9119')).toEqual({ host: '127.0.0.1:9119', scheme: 'http' })
  })

  it('defaults to http when the scheme is missing', () => {
    expect(splitRemoteUrl('127.0.0.1:9119')).toEqual({ host: '127.0.0.1:9119', scheme: 'http' })
    expect(splitRemoteUrl('  ')).toEqual({ host: '', scheme: 'http' })
  })
})

describe('joinRemoteUrl', () => {
  it('combines the selected scheme with a host', () => {
    expect(joinRemoteUrl('https', 'gw.example/p')).toBe('https://gw.example/p')
    expect(joinRemoteUrl('http', ' 127.0.0.1:9119 ')).toBe('http://127.0.0.1:9119')
  })

  it('prefers a scheme pasted into the host field', () => {
    expect(joinRemoteUrl('http', 'https://gw.example')).toBe('https://gw.example')
  })

  it('returns empty when the host is blank', () => {
    expect(joinRemoteUrl('https', '  ')).toBe('')
  })
})

describe('normalizeRemoteBaseUrl', () => {
  it('strips trailing slashes, hash, and query', () => {
    expect(normalizeRemoteBaseUrl('https://gw.example/prefix/?x=1#h')).toBe('https://gw.example/prefix')
  })

  it('rejects empty and non-http schemes', () => {
    expect(() => normalizeRemoteBaseUrl('')).toThrow('请输入远程网关 URL')
    expect(() => normalizeRemoteBaseUrl('ftp://gw.example')).toThrow(/必须是 http/)
  })
})

describe('gatewayHostLabel', () => {
  it('shows host plus path prefix', () => {
    expect(gatewayHostLabel('http://127.0.0.1:19120')).toBe('127.0.0.1:19120')
    expect(gatewayHostLabel('https://gw.example/prefix')).toBe('gw.example/prefix')
  })
})

describe('buildGatewayWsUrl', () => {
  it('uses wss and the path prefix for the websocket', () => {
    expect(buildGatewayWsUrl('https://gw.example/prefix', { name: 'token', value: 'abc' }))
      .toBe('wss://gw.example/prefix/api/ws?token=abc')
  })
})
