import type { HermesSession } from '~/types/hermes'
import { compactNumber, relativeTime, sourceLabel } from './format'

export const CHAT_SOURCES = new Set(['', 'api_server', 'cli', 'api', 'web', 'webui', 'tui', 'desktop'])
export const HIDDEN_SOURCES = new Set(['tool', 'subagent', 'cron'])

export type SessionWorkspace = {
  id: string
  label: string
  hint: string
  icon: string
  sessions: HermesSession[]
}

export function workspaceIcon(id: string) {
  if (id === 'home') return 'i-lucide-folder'
  if (id === 'cron') return 'i-lucide-timer'
  if (id === 'telegram') return 'i-lucide-send'
  if (id === 'feishu') return 'i-lucide-messages-square'
  if (id === 'discord') return 'i-lucide-messages-square'
  if (id === 'slack') return 'i-lucide-hash'
  if (id === 'email') return 'i-lucide-mail'
  return 'i-lucide-folder'
}

export function sessionMeta(item: HermesSession) {
  const time = relativeTime(item.last_active || item.started_at) || '刚刚'
  if (String(item.end_reason || '').toLowerCase() === 'branched') return `${time} · 已分支`
  const messages = Number(item.message_count || 0)
  if (messages > 0) return `${time} · ${compactNumber(messages)} 条`
  return time
}

export function sessionRecency(item: HermesSession) {
  const raw = item.last_active ?? item.started_at
  if (raw == null || raw === '') return 0
  if (typeof raw === 'number') return raw > 1e12 ? raw : raw * 1000
  const parsed = Date.parse(String(raw))
  return Number.isNaN(parsed) ? 0 : parsed
}

/** Pinned first (server `sessions.pinned`), then most recently active. */
export function sortSessions(list: HermesSession[]) {
  return [...list].sort((left, right) => {
    const pin = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
    if (pin) return pin
    return sessionRecency(right) - sessionRecency(left)
  })
}

/** Overlay REST `pinned` onto a gateway `session.list` page and keep pinned rows the window missed. */
export function overlayPinnedSessions(listed: HermesSession[], remote: HermesSession[]) {
  const byId = new Map(remote.map(item => [item.id, item]))
  const seen = new Set<string>()
  const out: HermesSession[] = []

  for (const item of listed) {
    seen.add(item.id)
    const extra = byId.get(item.id)
    out.push(extra ? { ...item, pinned: Boolean(extra.pinned) } : item)
  }

  for (const item of remote) {
    if (!item.pinned || seen.has(item.id) || item.archived || item.hidden) continue
    if (HIDDEN_SOURCES.has(item.source || '')) continue
    out.push(item)
    seen.add(item.id)
  }

  return sortSessions(out)
}

export function visibleChatSessions(list: HermesSession[]) {
  return list.filter((item) => {
    if (item.hidden || item.archived) return false
    if (HIDDEN_SOURCES.has(item.source || '')) return false
    return true
  })
}

export function visibleArchivedSessions(list: HermesSession[]) {
  return list.filter(item => !HIDDEN_SOURCES.has(item.source || ''))
}

/** REST `archived=only` rows plus sessions previously tucked away with `hidden`. */
export function mergeArchivedSessions(
  flagged: HermesSession[],
  listedWithHidden: HermesSession[],
  visibleIds: Iterable<string>
) {
  const visible = new Set(visibleIds)
  const out = new Map<string, HermesSession>()
  for (const item of flagged) {
    out.set(item.id, { ...item, archived: true })
  }
  for (const item of listedWithHidden) {
    if (out.has(item.id) || visible.has(item.id)) continue
    out.set(item.id, { ...item, archived: true, hidden: item.hidden ?? true })
  }
  return visibleArchivedSessions([...out.values()])
}

export function groupChatSessions(
  list: HermesSession[],
  home: { label: string, hint: string }
): SessionWorkspace[] {
  const groups = new Map<string, HermesSession[]>()
  for (const item of visibleChatSessions(list)) {
    const source = item.source || ''
    const key = CHAT_SOURCES.has(source) ? 'home' : source
    const rows = groups.get(key) || []
    rows.push(item)
    groups.set(key, rows)
  }

  const rows: SessionWorkspace[] = [{
    id: 'home',
    label: home.label,
    hint: home.hint,
    icon: workspaceIcon('home'),
    sessions: sortSessions(groups.get('home') || [])
  }]

  for (const [id, sessions] of groups) {
    if (id === 'home') continue
    rows.push({
      id,
      label: sourceLabel(id),
      hint: '频道',
      icon: workspaceIcon(id),
      sessions: sortSessions(sessions)
    })
  }
  return rows
}
