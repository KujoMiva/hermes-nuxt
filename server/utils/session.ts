import { randomUUID } from 'node:crypto'
import { deleteCookie, getCookie, setCookie, type H3Event } from 'h3'
import type { GatewayAuthMode } from '#shared/types/gateway'

export const SESSION_COOKIE = 'hermes-nuxt'

export interface NativeTokenSet {
  accessToken: string
  expiresAt: number
  provider: string
  refreshToken: string
  userId: string
}

export interface GatewayConnection {
  authMode: Exclude<GatewayAuthMode, 'unknown'>
  baseUrl: string
  cookies: Record<string, string>
  native?: NativeTokenSet
  token?: string
  user?: {
    displayName?: string
    email?: string
    provider?: string
  }
  version?: string | null
}

export interface PendingOauth {
  baseUrl: string
  expiresAt: number
  verifier: string
}

const connections = new Map<string, GatewayConnection>()
const pendingOauth = new Map<string, PendingOauth>()

function cookieOptions() {
  return {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
    sameSite: 'lax' as const
  }
}

export function readSessionId(event: H3Event): string | null {
  return getCookie(event, SESSION_COOKIE) || null
}

export function readSessionIdFromCookieHeader(header: string | null | undefined): string | null {
  if (!header) {
    return null
  }

  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (!trimmed.startsWith(`${SESSION_COOKIE}=`)) {
      continue
    }

    return decodeURIComponent(trimmed.slice(SESSION_COOKIE.length + 1)) || null
  }

  return null
}

export function getConnection(id: string | null | undefined): GatewayConnection | null {
  if (!id) {
    return null
  }

  return connections.get(id) ?? null
}

export function getConnectionForEvent(event: H3Event): GatewayConnection | null {
  return getConnection(readSessionId(event))
}

export function persistConnection(event: H3Event, connection: GatewayConnection): string {
  let id = readSessionId(event)

  if (!id) {
    id = randomUUID()
    setCookie(event, SESSION_COOKIE, id, cookieOptions())
  }

  connections.set(id, connection)
  return id
}

export function clearConnection(event: H3Event): void {
  const id = readSessionId(event)

  if (id) {
    connections.delete(id)
  }

  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

export function rememberPendingOauth(state: string, pending: PendingOauth): void {
  pendingOauth.set(state, pending)
}

export function takePendingOauth(state: string): PendingOauth | null {
  const pending = pendingOauth.get(state) ?? null

  if (pending) {
    pendingOauth.delete(state)
  }

  if (pending && pending.expiresAt < Date.now()) {
    return null
  }

  return pending
}

export function getConnectionFromUpgradeRequest(request: Request): GatewayConnection | null {
  return getConnection(readSessionIdFromCookieHeader(request.headers.get('cookie')))
}
