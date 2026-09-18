import { formatShortDuration } from './format'

const THINKING_STATUS_PREFIX_RE =
  /^\s*(?:(?:[^\s.]{1,16})\s+)?(?:processing|thinking|reasoning|analyzing|pondering|contemplating|musing|cogitating|ruminating|deliberating|mulling|reflecting|computing|synthesizing|formulating|brainstorming)\.\.\.\s*/i

const EMPTY_THINKING_PLACEHOLDER_RE =
  /\b(?:current rewritten thinking|next thinking to process|provide the thinking content|don't see any .*thinking)\b/i

export const REASONING_CHAR_CAP = 80_000

export function asReasoningText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map(part => asReasoningText(part)).filter(Boolean).join('')
  }
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    if (typeof rec.text === 'string') return rec.text
    if (typeof rec.reasoning === 'string') return rec.reasoning
  }
  return ''
}

export function coerceGatewayText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  return String(value)
}

export function coerceThinkingText(value: unknown): string {
  const raw = coerceGatewayText(value).replace(THINKING_STATUS_PREFIX_RE, '')
  return EMPTY_THINKING_PLACEHOLDER_RE.test(raw) ? '' : raw
}

export function providerWaitText(text: string): string {
  const value = text.trim()
  return /^(?:⏳|⚠|↻|⚙)\s*(?:waiting on|loading|processing prompt|no (?:output|response)|model returned)/i.test(value)
    ? value
    : ''
}

export function appendReasoning(current: string, delta: string): string {
  const next = `${current}${delta}`
  return next.length > REASONING_CHAR_CAP ? next.slice(-60_000) : next
}

export function mergeReasoningAvailable(current: string, incoming: string): string {
  if (!incoming) return current
  if (!current) return incoming
  if (incoming.startsWith(current) || current.startsWith(incoming)) {
    return incoming.length >= current.length ? incoming : current
  }
  return incoming
}

export function thoughtLabel(pending: boolean, durationMs?: number | null): string {
  if (pending) return '思考中'
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) return '已思考'
  if (durationMs < 1000) return '思考片刻'
  return `思考了 ${formatShortDuration(durationMs)}`
}
