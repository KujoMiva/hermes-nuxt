import { describe, expect, it } from 'vitest'
import { shouldReconnectOnResume } from '~/utils/gatewayReconnect'

const base = {
  connectingStartedAt: 0,
  connectionState: 'closed' as const,
  hidden: false,
  lastInboundAt: 0,
  now: 30_000,
  online: true,
  readyState: 3,
  wantOpen: true
}

describe('shouldReconnectOnResume', () => {
  it('reconnects a closed socket when the tab becomes visible', () => {
    expect(shouldReconnectOnResume(base)).toBe('reconnect')
  })

  it('keeps a fresh open socket and only pings', () => {
    expect(shouldReconnectOnResume({
      ...base,
      connectionState: 'open',
      lastInboundAt: 25_000,
      readyState: 1
    })).toBe('ping')
  })

  it('reconnects an open socket that went silent while frozen', () => {
    expect(shouldReconnectOnResume({
      ...base,
      connectionState: 'open',
      lastInboundAt: 1_000,
      readyState: 1
    })).toBe('reconnect')
  })

  it('does not stack a second connect onto a live handshake', () => {
    expect(shouldReconnectOnResume({
      ...base,
      connectingStartedAt: 28_000,
      connectionState: 'connecting',
      readyState: 0
    })).toBe('keep')
  })

  it('abandons a handshake that sat through a background freeze', () => {
    expect(shouldReconnectOnResume({
      ...base,
      connectingStartedAt: 1_000,
      connectionState: 'connecting',
      readyState: 0
    })).toBe('reconnect')
  })

  it('always reconnects pages restored from bfcache', () => {
    expect(shouldReconnectOnResume({
      ...base,
      connectionState: 'open',
      lastInboundAt: 29_000,
      persistedPageShow: true,
      readyState: 1
    })).toBe('reconnect')
  })

  it('stays idle while hidden or offline', () => {
    expect(shouldReconnectOnResume({ ...base, hidden: true })).toBe('keep')
    expect(shouldReconnectOnResume({ ...base, online: false })).toBe('keep')
    expect(shouldReconnectOnResume({ ...base, wantOpen: false })).toBe('keep')
  })
})
