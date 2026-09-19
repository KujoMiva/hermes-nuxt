import type { HermesSession } from '~/types/hermes'
import { sourceLabel } from './format'
import { HIDDEN_SOURCES } from './sessionGroups'

export function stripFtsMarkers(snippet: string) {
  return snippet.replaceAll('>>>', '').replaceAll('<<<', '')
}

export function sessionMatchesSearch(session: HermesSession, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [
    session.id,
    session.parent_session_id || '',
    session.title || '',
    session.preview || '',
    session.model || '',
    session.source || '',
    sourceLabel(session.source)
  ].some(value => String(value).toLowerCase().includes(needle))
}

export function searchHitToSession(row: unknown): HermesSession | null {
  if (!row || typeof row !== 'object') return null
  const rec = row as Record<string, unknown>
  const id = String(rec.session_id || rec.id || '').trim()
  if (!id) return null
  const snippet = stripFtsMarkers(String(rec.snippet || '')).trim()
  const preview = snippet || (typeof rec.preview === 'string' ? rec.preview.trim() : '')
  const started = rec.session_started ?? rec.started_at ?? rec.last_active ?? 0
  const lineage = typeof rec.lineage_root === 'string' ? rec.lineage_root : ''
  const parent = typeof rec.parent_session_id === 'string' ? rec.parent_session_id : ''
  return {
    id,
    source: typeof rec.source === 'string' ? rec.source : '',
    model: typeof rec.model === 'string' ? rec.model : '',
    title: '',
    preview,
    started_at: started as number | string,
    last_active: (rec.last_active ?? started) as number | string,
    message_count: Number(rec.message_count || 0) || 0,
    parent_session_id: lineage && lineage !== id ? lineage : (parent || null),
    archived: Boolean(rec.archived),
    hidden: Boolean(rec.hidden),
    pinned: Boolean(rec.pinned)
  }
}

export function mergeSessionSearch(
  loaded: HermesSession[],
  hits: HermesSession[],
  query: string
) {
  const needle = query.trim()
  if (!needle) return []

  const pool = loaded.filter(item => !HIDDEN_SOURCES.has(item.source || ''))
  const byId = new Map(pool.map(item => [item.id, item]))
  const out = new Map<string, HermesSession>()

  for (const item of pool) {
    if (sessionMatchesSearch(item, needle)) out.set(item.id, item)
  }

  for (const hit of hits) {
    if (HIDDEN_SOURCES.has(hit.source || '') || out.has(hit.id)) continue
    out.set(hit.id, byId.get(hit.id) ?? hit)
  }

  return [...out.values()]
}
