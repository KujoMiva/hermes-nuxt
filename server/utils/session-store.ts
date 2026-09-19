import type { GatewayAuthMode } from '#shared/types/gateway'
import type { GatewayConnection, NativeTokenSet } from './session'

export const SESSION_TTL_MS = 60 * 60 * 24 * 7 * 1000

export type StoredSessionRecord = GatewayConnection & { updatedAt: number }

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function asStringMap(value: unknown): Record<string, string> {
  const record = asRecord(value)
  if (!record) {
    return {}
  }

  const cookies: Record<string, string> = {}
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === 'string') {
      cookies[key] = item
    }
  }
  return cookies
}

function asNative(value: unknown): NativeTokenSet | undefined {
  const record = asRecord(value)
  if (!record) {
    return undefined
  }

  const accessToken = String(record.accessToken || '')
  const refreshToken = String(record.refreshToken || '')
  const expiresAt = Number(record.expiresAt)

  if (!accessToken || !refreshToken || !Number.isFinite(expiresAt)) {
    return undefined
  }

  return {
    accessToken,
    expiresAt,
    provider: String(record.provider || ''),
    refreshToken,
    userId: String(record.userId || '')
  }
}

function asUser(value: unknown): GatewayConnection['user'] {
  const record = asRecord(value)
  if (!record) {
    return undefined
  }

  return {
    displayName: typeof record.displayName === 'string' ? record.displayName : undefined,
    email: typeof record.email === 'string' ? record.email : undefined,
    provider: typeof record.provider === 'string' ? record.provider : undefined
  }
}

export function parseStoredConnection(value: unknown, now = Date.now()): StoredSessionRecord | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const updatedAt = Number(record.updatedAt)
  if (!Number.isFinite(updatedAt) || now - updatedAt > SESSION_TTL_MS) {
    return null
  }

  const authMode = record.authMode
  if (authMode !== 'oauth' && authMode !== 'token') {
    return null
  }

  const baseUrl = String(record.baseUrl || '')
  if (!baseUrl) {
    return null
  }

  const native = asNative(record.native)
  const token = typeof record.token === 'string' ? record.token : undefined

  if (authMode === 'token' && !token) {
    return null
  }

  if (authMode === 'oauth' && !native && Object.keys(asStringMap(record.cookies)).length === 0) {
    return null
  }

  return {
    authMode: authMode as Exclude<GatewayAuthMode, 'unknown'>,
    baseUrl,
    cookies: asStringMap(record.cookies),
    native,
    token,
    updatedAt,
    user: asUser(record.user),
    version: typeof record.version === 'string' || record.version === null ? record.version : undefined
  }
}

export function parseSessionStore(raw: string, now = Date.now()): Map<string, StoredSessionRecord> {
  const map = new Map<string, StoredSessionRecord>()
  const parsed = asRecord((() => {
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return null
    }
  })())

  if (!parsed) {
    return map
  }

  for (const [id, value] of Object.entries(parsed)) {
    if (!id) {
      continue
    }

    const row = parseStoredConnection(value, now)
    if (row) {
      map.set(id, row)
    }
  }

  return map
}

export function serializeSessionStore(rows: Map<string, GatewayConnection>, now = Date.now()): string {
  const payload: Record<string, StoredSessionRecord> = {}

  for (const [id, connection] of rows) {
    payload[id] = { ...connection, updatedAt: now }
  }

  return JSON.stringify(payload)
}

export function toGatewayConnection(row: StoredSessionRecord): GatewayConnection {
  const { updatedAt: _updatedAt, ...connection } = row
  return connection
}
