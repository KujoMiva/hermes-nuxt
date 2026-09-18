import type { HermesSession } from '~/types/hermes'

const PIN_STORE = 'hermes-pinned-ids'

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
    pinned: Boolean(rec.pinned)
  }
}

function readPins(): string[] {
  if (!import.meta.client) return []
  try {
    const parsed = JSON.parse(localStorage.getItem(PIN_STORE) || '[]') as unknown
    return Array.isArray(parsed) ? parsed.map(item => String(item)).filter(Boolean) : []
  } catch {
    return []
  }
}

function writePins(ids: string[]) {
  if (!import.meta.client) return
  localStorage.setItem(PIN_STORE, JSON.stringify(ids))
}

function recencyValue(item: HermesSession) {
  const raw = item.last_active ?? item.started_at
  if (raw == null || raw === '') return 0
  if (typeof raw === 'number') return raw > 1e12 ? raw : raw * 1000
  const parsed = Date.parse(String(raw))
  return Number.isNaN(parsed) ? 0 : parsed
}

function applyPins(list: HermesSession[], pins: string[]) {
  const set = new Set(pins)
  return [...list]
    .map(item => ({ ...item, pinned: set.has(item.id) }))
    .sort((left, right) => {
      const pin = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
      if (pin) return pin
      return recencyValue(right) - recencyValue(left)
    })
}

export function useSessions() {
  const gateway = useGateway()
  const { isConfigured } = useConnection()
  const toast = useToast()

  const items = useState<HermesSession[]>('hermes-sessions', () => [])
  const hits = useState<HermesSession[]>('hermes-session-hits', () => [])
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
  const pins = useState<string[]>('hermes-session-pins', () => [])

  const filtered = computed(() => {
    const needle = query.value.trim().toLowerCase()
    const rows = source.value
      ? items.value.filter(item => (item.source || '') === source.value)
      : items.value
    if (!needle) return rows
    return rows.filter(item =>
      [item.title, item.preview, item.id, item.model, item.source]
        .some(value => String(value || '').toLowerCase().includes(needle))
    )
  })

  const archivedFiltered = computed(() => {
    const needle = query.value.trim().toLowerCase()
    if (!needle) return archivedItems.value
    return archivedItems.value.filter(item =>
      [item.title, item.preview, item.id].some(value => String(value || '').toLowerCase().includes(needle))
    )
  })

  function find(id: string) {
    return items.value.find(item => item.id === id)
      || archivedItems.value.find(item => item.id === id)
      || null
  }

  async function refresh() {
    if (!isConfigured.value) {
      items.value = []
      loading.value = false
      return
    }
    if (!pins.value.length) pins.value = readPins()
    loading.value = true
    try {
      const payload = await gateway.request<{ sessions?: unknown[] }>('session.list', { limit: 200 })
      items.value = applyPins((payload.sessions || []).map(asSession).filter((row): row is HermesSession => Boolean(row)), pins.value)
      hasMore.value = (payload.sessions || []).length >= 200
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
      const payload = await gateway.request<{ sessions?: unknown[] }>('session.list', {
        limit: 200,
        include_hidden: true
      })
      const visibleIds = new Set(items.value.map(item => item.id))
      archivedItems.value = applyPins(
        (payload.sessions || [])
          .map(asSession)
          .filter((row): row is HermesSession => Boolean(row && (row.hidden || row.archived || (!visibleIds.has(row.id) && row.hidden))))
          .filter(row => !visibleIds.has(row.id) || Boolean(row.hidden || row.archived)),
        pins.value
      )
      archiveHasMore.value = false
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
  }

  async function archive(id: string, hidden = true) {
    await gateway.request('session.set_hidden', { session_id: id, hidden })
    await refresh()
    if (hidden || query.value) await loadArchived()
  }

  async function pin(id: string, next: boolean) {
    const set = new Set(pins.value)
    if (next) set.add(id)
    else set.delete(id)
    pins.value = [...set]
    writePins(pins.value)
    items.value = applyPins(items.value, pins.value)
    archivedItems.value = applyPins(archivedItems.value, pins.value)
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
    else items.value = applyPins([row, ...items.value], pins.value)
  }

  watch(query, (value) => {
    hitsQuery.value = value
    hits.value = filtered.value
    searching.value = false
  })

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
