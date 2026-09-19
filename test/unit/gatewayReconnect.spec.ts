import { describe, expect, it } from 'vitest'
import { shouldReconnectOnResume, shouldReplaceTranscriptOnRebind } from '~/utils/gatewayReconnect'

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

  it('keeps a fresh open socket', () => {
    expect(shouldReconnectOnResume({
      ...base,
      connectionState: 'open',
      lastInboundAt: 25_000,
      readyState: 1
    })).toBe('keep')
  })

  it('pings an open socket that went silent, and does not tear it down', () => {
    expect(shouldReconnectOnResume({
      ...base,
      connectionState: 'open',
      lastInboundAt: 1_000,
      readyState: 1
    })).toBe('ping')
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

describe('shouldReplaceTranscriptOnRebind', () => {
  it('keeps the live transcript while a turn is in flight', () => {
    expect(shouldReplaceTranscriptOnRebind('submitted')).toBe(false)
    expect(shouldReplaceTranscriptOnRebind('streaming')).toBe(false)
  })

  it('reloads history after a finished turn', () => {
    expect(shouldReplaceTranscriptOnRebind('ready')).toBe(true)
  })
})
