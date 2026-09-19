import type { HermesSession } from '~/types/hermes'
import {
  mergeArchivedSessions,
  overlayPinnedSessions,
  sortSessions,
  visibleArchivedSessions,
  visibleChatSessions
} from '~/utils/sessionGroups'
import { mergeSessionSearch, searchHitToSession } from '~/utils/sessionSearch'

const SEARCH_DEBOUNCE_MS = 200

let searchWatchBound = false

function asSession(row: unknown): HermesSession | null {
  if (!row || typeof row !== 'object') return null
  const rec = row as Record<string, unknown>
  const id = String(rec.id || rec.session_id || rec.session_key || '').trim()
  if (!id) return null
  return {
    id,
    source: typeof rec.source === 'string' ? rec.source : '',
    title: typeof rec.title === 'string' ? rec.title : '',
    preview: typeof rec.preview === 'string' ? rec.preview : '',
    started_at: (rec.started_at as number | string | undefined) || 0,
    last_active: (rec.last_active as number | string | undefined) || rec.started_at as number | string | undefined,
    message_count: Number(rec.message_count || 0) || 0,
    model: typeof rec.model === 'string' ? rec.model : '',
    parent_session_id: typeof rec.parent_session_id === 'string' ? rec.parent_session_id : null,
    hidden: Boolean(rec.hidden),
    archived: Boolean(rec.archived || rec.hidden),
    pinned: rec.pinned === true || rec.pinned === 1 || rec.pinned === '1'
  }
}

function uniqueSessions(rows: HermesSession[]) {
  const seen = new Set<string>()
  const out: HermesSession[] = []
  for (const item of rows) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

function mapSessions(rows: unknown[]) {
  return rows.map(asSession).filter((row): row is HermesSession => Boolean(row))
}

export function useSessions() {
  const gateway = useGateway()
  const dashboard = useDashboardApi()
  const { isConfigured, profile } = useConnection()
  const toast = useToast()

  const items = useState<HermesSession[]>('hermes-sessions', () => [])
  const serverHits = useState<HermesSession[]>('hermes-session-server-hits', () => [])
  const hitsQuery = useState('hermes-session-hits-query', () => '')
  const loading = useState('hermes-sessions-loading', () => false)
  const loadingMore = useState('hermes-sessions-loading-more', () => false)
  const searching = useState('hermes-sessions-searching', () => false)
  const hasMore = useState('hermes-sessions-has-more', () => false)
  const query = useState('hermes-sessions-query', () => '')
  const source = useState('hermes-sessions-source', () => '')
  const archivedItems = useState<HermesSession[]>('hermes-sessions-archived', () => [])
  const loadingArchived = useState('hermes-sessions-archived-loading', () => false)
  const loadingMoreArchived = useState('hermes-sessions-archived-loading-more', () => false)
  const archiveHasMore = useState('hermes-sessions-archived-has-more', () => false)
  const archiveFromApi = useState('hermes-sessions-archived-from-api', () => true)

  const searchPool = computed(() => uniqueSessions([
    ...visibleChatSessions(items.value),
    ...visibleArchivedSessions(archivedItems.value)
  ]))

  const filtered = computed(() => {
    const needle = query.value.trim()
    const rows = needle
      ? mergeSessionSearch(searchPool.value, serverHits.value, needle)
      : source.value
        ? items.value.filter(item => (item.source || '') === source.value)
        : items.value
    return sortSessions(rows)
  })

  const archivedFiltered = computed(() => {
    if (query.value.trim()) return []
    return archivedItems.value
  })

  const hits = computed(() => query.value.trim() ? filtered.value : [])

  function find(id: string) {
    return items.value.find(item => item.id === id)
      || archivedItems.value.find(item => item.id === id)
      || serverHits.value.find(item => item.id === id)
      || null
  }

  function profileBody(extra: Record<string, boolean | string> = {}) {
    const profileId = profile.value.trim()
    return profileId ? { ...extra, profile: profileId } : extra
  }

  async function overlayRemotePins() {
    try {
      const payload = await dashboard.request<{ sessions?: unknown[] }>('sessions', {
        query: { archived: 'exclude', order: 'recent', limit: 100 }
      })
      items.value = overlayPinnedSessions(items.value, mapSessions(payload.sessions || []))
    } catch {
      // session.list stays visible if the REST pin flags are unavailable
    }
  }

  async function refresh() {
    if (!isConfigured.value) {
      items.value = []
      serverHits.value = []
      searching.value = false
      loading.value = false
      return
    }
    loading.value = true
    try {
      const payload = await gateway.request<{ sessions?: unknown[] }>('session.list', { limit: 200 })
      items.value = sortSessions(mapSessions(payload.sessions || []))
      hasMore.value = (payload.sessions || []).length >= 200
      void overlayRemotePins()
    } catch (error) {
      toast.add({
        title: '无法加载会话',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    loadingMore.value = false
  }

  async function loadArchived() {
    if (!isConfigured.value) {
      archivedItems.value = []
      return
    }
    loadingArchived.value = true
    try {
      let flagged: HermesSession[] = []
      let hiddenListed: HermesSession[] = []
      let restError: unknown
      let hiddenError: unknown

      try {
        const payload = await dashboard.request<{ sessions?: unknown[] }>('sessions', {
          query: { archived: 'only', order: 'recent', limit: 100 }
        })
        flagged = mapSessions(payload.sessions || [])
        archiveFromApi.value = true
        archiveHasMore.value = (payload.sessions || []).length >= 100
      } catch (error) {
        restError = error
        archiveFromApi.value = false
        archiveHasMore.value = false
      }

      let visibleIds = items.value.map(item => item.id)
      try {
        const [visiblePayload, hiddenPayload] = await Promise.all([
          gateway.request<{ sessions?: unknown[] }>('session.list', { limit: 200 }),
          gateway.request<{ sessions?: unknown[] }>('session.list', {
            limit: 200,
            include_hidden: true
          })
        ])
        visibleIds = mapSessions(visiblePayload.sessions || []).map(item => item.id)
        hiddenListed = mapSessions(hiddenPayload.sessions || [])
      } catch (error) {
        hiddenError = error
      }

      if (restError && hiddenError) {
        throw restError
      }

      archivedItems.value = sortSessions(
        mergeArchivedSessions(flagged, hiddenListed, visibleIds)
      )

      const flaggedIds = new Set(flagged.map(item => item.id))
      const extras = archivedItems.value.filter(item => !flaggedIds.has(item.id))
      for (const extra of extras.slice(0, 20)) {
        void dashboard.request(`sessions/${encodeURIComponent(extra.id)}`, {
          method: 'PATCH',
          body: {
            archived: true,
            hidden: false,
            ...(profile.value.trim() ? { profile: profile.value.trim() } : {})
          }
        }).catch(() => {})
      }
    } catch (error) {
      toast.add({
        title: '无法加载归档',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    } finally {
      loadingArchived.value = false
    }
  }

  async function loadMoreArchived() {
    loadingMoreArchived.value = false
  }

  async function resumeRuntime(id: string, omitMessages = true) {
    const resumed = await gateway.request<{ session_id?: string, session_key?: string }>('session.resume', {
      session_id: id,
      omit_messages: omitMessages
    })
    return resumed.session_id || id
  }

  async function rename(id: string, title: string) {
    const chat = useChatController()
    const sid = chat.isActiveId(id) ? (chat.sessionId.value || id) : await resumeRuntime(id)
    await gateway.request('session.title', { session_id: sid, title })
    const row = find(id)
    if (row) row.title = title
  }

  async function remove(id: string) {
    const chat = useChatController()
    if (chat.isActiveId(id) && chat.sessionId.value) {
      await gateway.request('session.close', { session_id: chat.sessionId.value }).catch(() => {})
    }
    await gateway.request('session.delete', { session_id: id })
    items.value = items.value.filter(item => item.id !== id)
    archivedItems.value = archivedItems.value.filter(item => item.id !== id)
    serverHits.value = serverHits.value.filter(item => item.id !== id)
  }

  function applyArchiveLocal(id: string, archived: boolean) {
    const row = find(id)
    if (archived) {
      items.value = items.value.filter(item => item.id !== id)
      if (row) {
        archivedItems.value = sortSessions([
          { ...row, archived: true, hidden: false },
          ...archivedItems.value.filter(item => item.id !== id)
        ])
      }
      return
    }
    archivedItems.value = archivedItems.value.filter(item => item.id !== id)
    if (row) {
      items.value = sortSessions([
        { ...row, archived: false, hidden: false },
        ...items.value.filter(item => item.id !== id)
      ])
    }
  }

  async function archive(id: string, archived = true) {
    try {
      await dashboard.request(`sessions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: profileBody({ archived, hidden: false })
      })
    } catch {
      await gateway.request('session.set_hidden', { session_id: id, hidden: archived })
    }
    applyArchiveLocal(id, archived)
    await refresh()
    await loadArchived()
  }

  function applyPinLocal(id: string, pinned: boolean) {
    const patch = (list: HermesSession[]) => sortSessions(
      list.map(item => item.id === id ? { ...item, pinned } : item)
    )
    items.value = patch(items.value)
    archivedItems.value = patch(archivedItems.value)
    serverHits.value = patch(serverHits.value)
  }

  async function pin(id: string, next: boolean) {
    const previous = Boolean(find(id)?.pinned)
    applyPinLocal(id, next)
    try {
      await dashboard.request(`sessions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: profileBody({ pinned: next })
      })
    } catch (error) {
      applyPinLocal(id, previous)
      throw error
    }
  }

  async function fork(id: string, count?: number) {
    const chat = useChatController()
    const sid = chat.isActiveId(id)
      ? (chat.sessionId.value || id)
      : await resumeRuntime(id, false)
    const payload = await gateway.request<{ session_id?: string, stored_session_id?: string, title?: string }>('session.branch', {
      session_id: sid,
      ...(typeof count === 'number' && count > 0 ? { count } : {})
    })
    const childId = payload.stored_session_id || payload.session_id || ''
    if (!childId) throw new Error('分支未返回会话 id')
    await refresh()
    return find(childId) || { id: childId, title: payload.title || '分支' }
  }

  function upsert(row: HermesSession) {
    const index = items.value.findIndex(item => item.id === row.id)
    if (index >= 0) items.value[index] = { ...items.value[index], ...row }
    items.value = sortSessions(index >= 0 ? items.value : [row, ...items.value])
  }

  if (import.meta.client && !searchWatchBound) {
    searchWatchBound = true
    let timer = 0
    let token = 0

    watch(query, (value) => {
      const needle = value.trim()
      hitsQuery.value = needle
      window.clearTimeout(timer)
      if (!needle) {
        token += 1
        serverHits.value = []
        searching.value = false
        return
      }
      searching.value = true
      timer = window.setTimeout(() => {
        const requestToken = ++token
        void (async () => {
          if (!isConfigured.value) {
            if (requestToken === token) {
              serverHits.value = []
              searching.value = false
            }
            return
          }
          try {
            const payload = await dashboard.request<{ results?: unknown[] }>('sessions/search', {
              query: { q: needle, limit: 20 }
            })
            if (requestToken !== token) return
            serverHits.value = (payload.results || [])
              .map(searchHitToSession)
              .filter((row): row is HermesSession => Boolean(row))
          } catch {
            if (requestToken !== token) return
            serverHits.value = []
          } finally {
            if (requestToken === token) searching.value = false
          }
        })()
      }, SEARCH_DEBOUNCE_MS)
    })
  }

  return {
    archive,
    archiveFromApi,
    archiveHasMore,
    archivedFiltered,
    archivedItems,
    filtered,
    find,
    fork,
    hasMore,
    hits,
    hitsQuery,
    items,
    loadArchived,
    loadMore,
    loadMoreArchived,
    loading,
    loadingArchived,
    loadingMore,
    loadingMoreArchived,
    pin,
    query,
    refresh,
    remove,
    rename,
    searching,
    source,
    upsert
  }
}
