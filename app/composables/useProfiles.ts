export interface HermesProfileOption {
  id: string
  localId: string
  name: string
  slug: string
  handle: string
  isDefault: boolean
  baseUrl: string
  isActive: boolean
}

export interface ProfileDraft {
  localId?: string
  name: string
  slug: string
  baseUrl?: string
  apiKey?: string
}

export const PROFILE_NAV = [
  { tab: 'models', icon: 'i-lucide-cpu', label: '模型' },
  { tab: 'skills', icon: 'i-lucide-wand-sparkles', label: '技能' },
  { tab: 'tools', icon: 'i-lucide-hammer', label: '工具' }
] as const

export function useProfiles() {
  const connection = useConnection()
  const gateway = useGateway()
  const toast = useToast()
  const labels = useProfileLabels()

  const identities = useState<HermesProfileOption[]>('hermes-gateway-profiles', () => [])
  const loadingState = useState('hermes-profiles-loading', () => false)

  const items = computed(() => identities.value)
  const current = computed(() =>
    items.value.find(item => item.isActive)
    || items.value.find(item => item.id === connection.profile.value)
    || items.value[0]
    || null
  )
  const currentId = computed(() => current.value?.id || connection.profile.value || '')
  const currentName = computed(() => current.value?.name || connection.profile.value || 'Default')
  const currentLabel = computed(() => current.value?.handle || `@${connection.profile.value || 'default'}`)
  const loading = computed(() => loadingState.value)

  async function refresh() {
    if (!connection.isConfigured.value) {
      identities.value = []
      return
    }
    loadingState.value = true
    try {
      const payload = await gateway.request<{ profiles?: Array<{
        name?: string
        display_name?: string
        is_default?: boolean
        path?: string
      }> }>('profiles.list', { include_sessions: false })
      const rows = payload.profiles || []
      identities.value = rows.map((row) => {
        const slug = row.name === 'default' ? '' : String(row.name || '')
        return {
          id: slug,
          localId: String(row.name || 'default'),
          name: labels.get(String(row.name || 'default'), row.display_name || row.name || 'Default'),
          slug: slug || 'default',
          handle: `@${slug || 'default'}`,
          isDefault: Boolean(row.is_default) || !slug,
          baseUrl: connection.baseUrl.value,
          isActive: (connection.profile.value || '') === slug
        }
      })
      if (!identities.value.length) {
        identities.value = [{
          id: '',
          localId: 'default',
          name: 'Default',
          slug: 'default',
          handle: '@default',
          isDefault: true,
          baseUrl: connection.baseUrl.value,
          isActive: true
        }]
      }
    } catch {
      identities.value = [{
        id: connection.profile.value || '',
        localId: connection.profile.value || 'default',
        name: connection.profile.value || 'Default',
        slug: connection.profile.value || 'default',
        handle: `@${connection.profile.value || 'default'}`,
        isDefault: !connection.profile.value,
        baseUrl: connection.baseUrl.value,
        isActive: true
      }]
    } finally {
      loadingState.value = false
    }
  }

  async function select(localId: string) {
    const row = identities.value.find(item => item.localId === localId)
    if (!row) return
    connection.profile.value = row.id
    identities.value = identities.value.map(item => ({
      ...item,
      isActive: item.localId === localId
    }))
    await Promise.allSettled([
      useSessions().refresh(),
      useJobs().refresh()
    ])
  }

  async function save(draft: ProfileDraft) {
    const name = draft.slug.trim() || draft.name.trim()
    if (!name) throw new Error('请填写 Profile 名称')
    await gateway.request('profiles.create', { name, description: draft.name.trim() || name })
    labels.set(name, draft.name.trim() || name)
    await refresh()
    toast.add({ title: '已创建 Profile', color: 'success' })
  }

  async function remove(_localId: string) {
    toast.add({
      title: '远程网关不从本控制台删除 Profile',
      color: 'warning'
    })
  }

  return {
    current,
    currentId,
    currentLabel,
    currentName,
    items,
    loading,
    refresh,
    remove,
    save,
    select
  }
}
