export type ResumeReconnectAction = 'keep' | 'ping' | 'reconnect'

export const RESUME_RECONNECT_THROTTLE_MS = 1_000
export const CONNECTING_STALE_MS = 8_000
export const OPEN_STALE_MS = 20_000

const WS_CONNECTING = 0
const WS_OPEN = 1

export interface ResumeReconnectInput {
  connectingStartedAt: number
  connectionState: 'idle' | 'connecting' | 'open' | 'closed' | 'error'
  hidden: boolean
  lastInboundAt: number
  now: number
  online: boolean
  persistedPageShow?: boolean
  readyState: number | null
  wantOpen: boolean
}

export function shouldReconnectOnResume(input: ResumeReconnectInput): ResumeReconnectAction {
  if (!input.wantOpen || input.hidden || !input.online) {
    return 'keep'
  }

  if (input.persistedPageShow) {
    return 'reconnect'
  }

  if (input.readyState === WS_OPEN && input.connectionState === 'open') {
    return input.now - input.lastInboundAt >= OPEN_STALE_MS ? 'ping' : 'keep'
  }

  if (input.connectionState === 'connecting' || input.readyState === WS_CONNECTING) {
    return input.now - input.connectingStartedAt >= CONNECTING_STALE_MS ? 'reconnect' : 'keep'
  }

  return 'reconnect'
}

export function shouldReplaceTranscriptOnRebind(status: string) {
  return status !== 'submitted' && status !== 'streaming'
}
