import { describe, expect, it } from 'vitest'
import {
  isBlockedResolvedAddress,
  isPrivateOrLocalHost,
  isTitleFetchable
} from '~/utils/linkTitle'

describe('isPrivateOrLocalHost', () => {
  it('blocks loopback, LAN suffixes and dotted private IPv4', () => {
    expect(isPrivateOrLocalHost('localhost')).toBe(true)
    expect(isPrivateOrLocalHost('intranet.internal')).toBe(true)
    expect(isPrivateOrLocalHost('127.0.0.1')).toBe(true)
    expect(isPrivateOrLocalHost('10.0.0.8')).toBe(true)
    expect(isPrivateOrLocalHost('192.168.1.1')).toBe(true)
    expect(isPrivateOrLocalHost('169.254.169.254')).toBe(true)
    expect(isPrivateOrLocalHost('::1')).toBe(true)
  })

  it('allows ordinary public hostnames', () => {
    expect(isPrivateOrLocalHost('example.com')).toBe(false)
    expect(isPrivateOrLocalHost('8.8.8.8')).toBe(false)
  })
})

describe('isBlockedResolvedAddress', () => {
  it('blocks private and loopback answers, including IPv4-mapped IPv6', () => {
    expect(isBlockedResolvedAddress('127.0.0.1')).toBe(true)
    expect(isBlockedResolvedAddress('10.1.2.3')).toBe(true)
    expect(isBlockedResolvedAddress('::1')).toBe(true)
    expect(isBlockedResolvedAddress('fd12:3456::1')).toBe(true)
    expect(isBlockedResolvedAddress('::ffff:192.168.0.1')).toBe(true)
  })

  it('allows public addresses and rejects unknown shapes', () => {
    expect(isBlockedResolvedAddress('8.8.8.8')).toBe(false)
    expect(isBlockedResolvedAddress('2001:4860:4860::8888')).toBe(false)
    expect(isBlockedResolvedAddress('not-an-ip')).toBe(true)
  })
})

describe('isTitleFetchable', () => {
  it('only allows http(s) to non-local hostnames', () => {
    expect(isTitleFetchable('https://example.com/a')).toBe(true)
    expect(isTitleFetchable('http://127.0.0.1/')).toBe(false)
    expect(isTitleFetchable('http://169.254.169.254/latest')).toBe(false)
    expect(isTitleFetchable('file:///etc/passwd')).toBe(false)
  })
})
