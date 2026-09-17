const STORAGE_KEY = 'hermes-profile-display-names'

function storageId(id: string) {
  return id.trim() || 'default'
}

function readStore(): Record<string, string> {
  if (!import.meta.client) return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, value]) => typeof value === 'string' && value.trim())
    ) as Record<string, string>
  } catch {
    return {}
  }
}

function writeStore(map: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

function omit(map: Record<string, string>, key: string) {
  return Object.fromEntries(Object.entries(map).filter(([id]) => id !== key))
}

export function useProfileLabels() {
  const map = useState<Record<string, string>>('hermes-profile-display-names', () => readStore())

  onMounted(() => {
    const stored = readStore()
    if (Object.keys(stored).length) map.value = { ...stored, ...map.value }
  })

  function get(id: string, fallback = '') {
    return map.value[storageId(id)] || fallback
  }

  function set(id: string, name: string) {
    const text = name.trim()
    const next = text
      ? { ...map.value, [storageId(id)]: text }
      : omit(map.value, storageId(id))
    writeStore(next)
    map.value = next
  }

  function rename(fromId: string, toId: string) {
    const from = storageId(fromId)
    const to = storageId(toId)
    if (from === to || !map.value[from]) return
    const next = omit({ ...map.value, [to]: map.value[from] }, from)
    writeStore(next)
    map.value = next
  }

  function remove(id: string) {
    if (!map.value[storageId(id)]) return
    const next = omit(map.value, storageId(id))
    writeStore(next)
    map.value = next
  }

  return { map, get, set, rename, remove }
}
