import type { ChatApproval, ChatStopKind } from '~/types/hermes'

export const RUN_STORE = 'hermes-session-runs'
export const POLL_MS = 1500
export const TERMINAL_RUN = new Set(['completed', 'failed', 'cancelled', 'interrupted'])

export type HermesRun = {
  run_id?: string
  id?: string
  status?: string
  session_id?: string
  input?: unknown
  output?: unknown
  error?: unknown
  approval?: ChatApproval | null
  pending_steer?: unknown
}

export function chatUid(prefix = 'msg') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function stopKindLabel(kind?: ChatStopKind | '') {
  if (kind === 'stopping') return '正在停止'
  if (kind === 'user_stop') return '已停止'
  if (kind === 'cancelled') return '已取消'
  if (kind === 'interrupted') return '已中断'
  if (kind === 'disconnected') return '连接已断开'
  return ''
}

export function isTerminalRun(status?: string | null) {
  return TERMINAL_RUN.has(String(status || ''))
}

export function isActiveRun(status?: string | null) {
  const st = String(status || '')
  return Boolean(st) && !isTerminalRun(st)
}

export function runOutput(row: HermesRun | null | undefined) {
  return typeof row?.output === 'string' ? row.output : ''
}

export function runError(row: HermesRun | null | undefined) {
  if (typeof row?.error === 'string' && row.error) return row.error
  if (row?.error && typeof row.error === 'object') {
    const message = (row.error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return ''
}

export function asApproval(value: unknown): ChatApproval | null {
  if (!value || typeof value !== 'object') return null
  return value as ChatApproval
}

export function asSteerText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!value || typeof value !== 'object') return ''
  const rec = value as Record<string, unknown>
  for (const key of ['input', 'text', 'content', 'message']) {
    if (typeof rec[key] === 'string' && rec[key].trim()) return rec[key].trim()
  }
  return ''
}

export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

export function readRunStore(storage?: Storage | null): Record<string, string> {
  if (!storage) return {}
  try {
    const raw = storage.getItem(RUN_STORE)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const next: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value) next[key] = value
    }
    return next
  } catch {
    return {}
  }
}

function clientStore() {
  return import.meta.client ? sessionStorage : null
}

export function rememberedRun(sessionId: string, storage = clientStore()) {
  return readRunStore(storage)[sessionId] || ''
}

export function rememberRun(sessionId: string, id: string, storage = clientStore()) {
  if (!storage || !sessionId || !id) return
  const next = readRunStore(storage)
  next[sessionId] = id
  storage.setItem(RUN_STORE, JSON.stringify(next))
}

export function forgetRun(sessionId: string, storage = clientStore()) {
  if (!storage || !sessionId) return
  const stored = readRunStore(storage)
  if (!(sessionId in stored)) return
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(stored)) {
    if (key !== sessionId) next[key] = value
  }
  if (Object.keys(next).length) storage.setItem(RUN_STORE, JSON.stringify(next))
  else storage.removeItem(RUN_STORE)
}
