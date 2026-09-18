import { describe, expect, it } from 'vitest'
import {
  buildNativeAuthorizeUrl,
  generatePkcePair,
  nativeCallbackRedirectUri,
  nativeRefreshUrl,
  nativeTokenUrl
} from '~~/server/utils/pkce'

describe('generatePkcePair', () => {
  it('returns an S256 challenge pair', () => {
    const pair = generatePkcePair()
    expect(pair.method).toBe('S256')
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(pair.challenge).not.toBe(pair.verifier)
  })
})

describe('native oauth urls', () => {
  it('keeps the gateway path prefix', () => {
    expect(nativeTokenUrl('https://gw.example/prefix')).toBe('https://gw.example/prefix/auth/native/token')
    expect(nativeRefreshUrl('https://gw.example/prefix')).toBe('https://gw.example/prefix/auth/native/refresh')
    expect(buildNativeAuthorizeUrl('https://gw.example/prefix', {
      challenge: 'abc',
      redirectUri: 'http://127.0.0.1:3000/api/oauth/callback',
      state: 'st',
      provider: 'github'
    })).toContain('/auth/native/authorize?')
  })

  it('pins the callback to loopback on the request port', () => {
    expect(nativeCallbackRedirectUri(new URL('http://localhost:3002/login')))
      .toBe('http://127.0.0.1:3002/api/oauth/callback')
  })
})
