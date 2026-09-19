import { describe, expect, it } from 'vitest'
import {
  shouldDropSocketAfterPingFailure,
  shouldReconnectOnResume,
  shouldReplaceTranscriptOnRebind,
  shouldVerifyOpenSocket
} from '~/utils/gatewayReconnect'

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

  it('keeps a socket that just received traffic', () => {
    expect(shouldReconnectOnResume({
      ...base,
      connectionState: 'open',
      lastInboundAt: 29_500,
      readyState: 1
    })).toBe('keep')
  })

  it('pings an open socket after a short background freeze', () => {
    expect(shouldReconnectOnResume({
      ...base,
      connectionState: 'open',
      lastInboundAt: 25_000,
      readyState: 1
    })).toBe('ping')
  })

  it('pings an open socket that went silent', () => {
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

describe('shouldDropSocketAfterPingFailure', () => {
  it('drops zombie sockets that still report OPEN', () => {
    expect(shouldDropSocketAfterPingFailure(1)).toBe(true)
    expect(shouldDropSocketAfterPingFailure(3)).toBe(true)
  })
})

describe('shouldVerifyOpenSocket', () => {
  it('pings before using a socket that went quiet', () => {
    expect(shouldVerifyOpenSocket(22_000, 30_000)).toBe(true)
    expect(shouldVerifyOpenSocket(29_000, 30_000)).toBe(false)
  })
})

describe('shouldReplaceTranscriptOnRebind', () => {
  it('reloads resume history after a dropped socket, even mid-turn', () => {
    expect(shouldReplaceTranscriptOnRebind('submitted', true)).toBe(true)
    expect(shouldReplaceTranscriptOnRebind('streaming', true)).toBe(true)
    expect(shouldReplaceTranscriptOnRebind('streaming', false)).toBe(true)
    expect(shouldReplaceTranscriptOnRebind('ready')).toBe(true)
  })
})
