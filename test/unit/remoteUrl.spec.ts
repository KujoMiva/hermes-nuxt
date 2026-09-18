import { describe, expect, it } from 'vitest'
import {
  buildGatewayWsUrl,
  coerceRemoteUrlScheme,
  gatewayHostLabel,
  normalizeRemoteBaseUrl
} from '#shared/utils/remote-url'

describe('coerceRemoteUrlScheme', () => {
  it('adds http when the scheme is missing', () => {
    expect(coerceRemoteUrlScheme('127.0.0.1:9119')).toBe('http://127.0.0.1:9119')
    expect(coerceRemoteUrlScheme('https://gw.example/p')).toBe('https://gw.example/p')
    expect(coerceRemoteUrlScheme('  ')).toBe('')
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
