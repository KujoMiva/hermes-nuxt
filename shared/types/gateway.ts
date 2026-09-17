export type GatewayAuthMode = 'oauth' | 'token' | 'unknown'

export interface AuthProvider {
  name: string
  displayName: string
  supportsPassword: boolean
}

export interface ProbeResult {
  authFlows: string[]
  authMode: GatewayAuthMode
  baseUrl: string
  error: string | null
  providers: AuthProvider[]
  reachable: boolean
  version: string | null
}

export interface PublicSession {
  authMode?: Exclude<GatewayAuthMode, 'unknown'>
  baseUrl?: string
  host?: string
  loggedIn: boolean
  user?: {
    displayName?: string
    email?: string
    provider?: string
  }
  version?: string | null
}
