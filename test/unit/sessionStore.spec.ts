import { describe, expect, it } from 'vitest'
import {
  parseSessionStore,
  parseStoredConnection,
  serializeSessionStore,
  SESSION_TTL_MS,
  toGatewayConnection
} from '~~/server/utils/session-store'

const now = 1_000_000

const oauth = {
  authMode: 'oauth' as const,
  baseUrl: 'http://127.0.0.1:9119',
  cookies: {},
  native: {
    accessToken: 'at',
    expiresAt: now + 3_600,
    provider: 'nous',
    refreshToken: 'rt',
    userId: 'u1'
  },
  updatedAt: now,
  user: { displayName: 'Ada' },
  version: '1.0'
}

describe('parseStoredConnection', () => {
  it('keeps a live oauth row', () => {
    expect(parseStoredConnection(oauth, now)?.baseUrl).toBe(oauth.baseUrl)
  })

  it('drops rows older than the cookie lifetime', () => {
    expect(parseStoredConnection({ ...oauth, updatedAt: now - SESSION_TTL_MS - 1 }, now)).toBeNull()
  })

  it('rejects oauth rows with neither tokens nor cookies', () => {
    expect(parseStoredConnection({
      ...oauth,
      cookies: {},
      native: undefined
    }, now)).toBeNull()
  })

  it('keeps password logins that only have cookies', () => {
    expect(parseStoredConnection({
      authMode: 'oauth',
      baseUrl: 'http://127.0.0.1:9119',
      cookies: { hermes_at: 'cookie' },
      updatedAt: now
    }, now)?.cookies.hermes_at).toBe('cookie')
  })
})

describe('parseSessionStore', () => {
  it('round-trips a map and skips junk keys', () => {
    const raw = serializeSessionStore(new Map([
      ['keep', toGatewayConnection(oauth)]
    ]), now)
    const parsed = JSON.parse(raw) as Record<string, unknown>
    parsed.bad = { authMode: 'oauth' }
    parsed[''] = oauth

    const map = parseSessionStore(JSON.stringify(parsed), now)
    expect([...map.keys()]).toEqual(['keep'])
    expect(map.get('keep')?.native?.refreshToken).toBe('rt')
  })

  it('returns an empty map for broken json', () => {
    expect(parseSessionStore('{', now).size).toBe(0)
  })
})
