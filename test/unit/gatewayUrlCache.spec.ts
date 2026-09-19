import { afterEach, describe, expect, it } from 'vitest'
import { readCachedGatewayUrl, writeCachedGatewayUrl } from '~/utils/gatewayUrlCache'

const STORAGE_KEY = 'hermes-gateway-url'

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('gatewayUrlCache', () => {
  it('returns empty when storage is unavailable', () => {
    expect(readCachedGatewayUrl()).toBe('')
  })

  it('writes and reads a trimmed url', () => {
    const store = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value)
        }
      }
    })

    writeCachedGatewayUrl('  http://127.0.0.1:9119/  ')
    expect(store.get(STORAGE_KEY)).toBe('http://127.0.0.1:9119/')
    expect(readCachedGatewayUrl()).toBe('http://127.0.0.1:9119/')
  })

  it('ignores blank writes', () => {
    const store = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value)
        }
      }
    })

    writeCachedGatewayUrl('   ')
    expect(store.get(STORAGE_KEY)).toBeUndefined()
  })
})
