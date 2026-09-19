import { describe, expect, it } from 'vitest'
import { isIgnorableNetworkError } from '#shared/utils/networkErrors'
import { GATEWAY_UNAUTHORIZED_CLOSE, websocketCloseCode } from '#shared/utils/wsCloseCode'

describe('isIgnorableNetworkError', () => {
  it('swallows TCP resets that would otherwise kill the Nuxt process', () => {
    expect(isIgnorableNetworkError(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }))).toBe(true)
    expect(isIgnorableNetworkError(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))).toBe(true)
    expect(isIgnorableNetworkError({ cause: { code: 'ECONNRESET' } })).toBe(true)
    expect(isIgnorableNetworkError(new Error('session not found'))).toBe(false)
  })
})

describe('websocketCloseCode', () => {
  it('does not forward reserved 1006 codes that crash the local socket', () => {
    expect(websocketCloseCode(1006)).toBe(1000)
    expect(websocketCloseCode(1005, 1011)).toBe(1011)
    expect(websocketCloseCode(GATEWAY_UNAUTHORIZED_CLOSE)).toBe(4401)
    expect(websocketCloseCode(1000)).toBe(1000)
    expect(websocketCloseCode(1011)).toBe(1011)
  })
})
