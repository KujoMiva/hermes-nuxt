import { createHash, randomBytes } from 'node:crypto'

export interface PkcePair {
  challenge: string
  method: 'S256'
  verifier: string
}

function b64url(raw: Buffer): string {
  return raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generatePkcePair(): PkcePair {
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier, 'ascii').digest())

  return { verifier, challenge, method: 'S256' }
}

export function generateOauthState(): string {
  return b64url(randomBytes(24))
}

export function buildNativeAuthorizeUrl(
  baseUrl: string,
  params: { challenge: string, redirectUri: string, state: string, provider?: string }
): string {
  const parsed = new URL(baseUrl)
  const prefix = parsed.pathname.replace(/\/+$/, '')
  const query = new URLSearchParams({
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
    redirect_uri: params.redirectUri,
    state: params.state
  })

  if (params.provider) {
    query.set('provider', params.provider)
  }

  return `${parsed.protocol}//${parsed.host}${prefix}/auth/native/authorize?${query.toString()}`
}

export function nativeTokenUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl)
  const prefix = parsed.pathname.replace(/\/+$/, '')
  return `${parsed.protocol}//${parsed.host}${prefix}/auth/native/token`
}

export function nativeRefreshUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl)
  const prefix = parsed.pathname.replace(/\/+$/, '')
  return `${parsed.protocol}//${parsed.host}${prefix}/auth/native/refresh`
}

export function nativeCallbackRedirectUri(requestUrl: URL): string {
  const port = requestUrl.port || (requestUrl.protocol === 'https:' ? '443' : '80')
  return `http://127.0.0.1:${port}/api/oauth/callback`
}
