import type { HermesModel, ModelOption, ModelProvider } from '~/types/hermes'

const GENERIC_MODELS = new Set(['', 'hermes-agent', 'hermes'])
let catalogRefresh: Promise<void> | null = null

function asModel(entry: unknown, provider?: string): ModelOption | null {
  if (typeof entry === 'string' && entry.trim()) {
    return { id: entry.trim(), name: entry.trim(), provider }
  }
  if (!entry || typeof entry !== 'object') return null
  const rec = entry as Record<string, unknown>
  const id = String(rec.id || rec.model || rec.name || '').trim()
  if (!id) return null
  return {
    id,
    name: String(rec.name || rec.id || id),
    provider,
    description: typeof rec.description === 'string' ? rec.description : undefined,
    context: Number(rec.context_length || rec.context || rec.max_input_tokens || rec.max_model_len || 0) || undefined
  }
}

function asStringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(item => String(item || '').trim()).filter(Boolean)
}

function asCapabilities(value: unknown) {
  if (!value || typeof value !== 'object') return undefined
  const rec = value as Record<string, unknown>
  const result: ModelProvider['capabilities'] = {}
  for (const [modelId, caps] of Object.entries(rec)) {
    if (!caps || typeof caps !== 'object') continue
    const row = caps as Record<string, unknown>
    result[modelId] = {
      fast: Boolean(row.fast),
      reasoning: row.reasoning !== false,
      can_disable_reasoning: typeof row.can_disable_reasoning === 'boolean' ? row.can_disable_reasoning : null
    }
  }
  return Object.keys(result).length ? result : undefined
}

function normalizeProviders(payload: unknown): ModelProvider[] {
  if (!payload || typeof payload !== 'object') return []
  const rec = payload as Record<string, unknown>
  const list = rec.providers || rec.data || rec.items
  if (!Array.isArray(list)) return []
  return list.map((item) => {
    const row = item as Record<string, unknown>
    const id = String(row.slug || row.id || row.provider || '').trim()
    const modelsList = (row.models || row.items || []) as unknown[]
    return {
      id,
      name: String(row.name || row.label || id),
      authenticated: Boolean(row.authenticated ?? row.configured ?? true),
      isUserDefined: Boolean(row.is_user_defined),
      isCurrent: Boolean(row.is_current),
      authType: typeof row.auth_type === 'string' ? row.auth_type : undefined,
      keyEnv: typeof row.key_env === 'string' ? row.key_env : undefined,
      apiUrl: typeof row.api_url === 'string' ? row.api_url : undefined,
      warning: typeof row.warning === 'string' ? row.warning : undefined,
      aliases: asStringList(row.aliases),
      models: modelsList.map(modelRow => asModel(modelRow, id)).filter((row): row is ModelOption => Boolean(row)),
      capabilities: asCapabilities(row.capabilities)
    }
  }).filter(item => item.id)
}

export function isGenericModel(id?: string | null) {
  return !id?.trim() || GENERIC_MODELS.has(id.trim())
}

export function isCustomRuntimeProvider(id?: string | null, providers: ModelProvider[] = []) {
  const slug = id?.trim().toLowerCase() || ''
  if (!slug) return false
  if (slug === 'custom' || slug.startsWith('custom:')) return true
  const row = providers.find(item => item.id.toLowerCase() === slug)
  if (!row) return true
  return Boolean(row.isUserDefined)
}

export function useModelCatalog() {
  const gateway = useGateway()
  const { model, provider, isConfigured } = useConnection()
  const toast = useToast()

  const aliases = useState<HermesModel[]>('hermes-model-aliases', () => [])
  const providers = useState<ModelProvider[]>('hermes-model-providers', () => [])
  const serverDefault = useState('hermes-model-server-default', () => '')
  const serverProvider = useState('hermes-model-server-provider', () => '')
  const contextLength = useState('hermes-model-context-length', () => 0)
  const loading = useState('hermes-model-catalog-loading', () => false)
  const loaded = useState('hermes-model-catalog-loaded', () => false)

  const groups = computed(() => providers.value.filter(item => item.models?.length))
  const currentLabel = computed(() => {
    const id = model.value.trim()
    if (!id) return serverDefault.value || '默认模型'
    for (const group of providers.value) {
      const hit = (group.models || []).find(item => item.id === id)
      if (hit) return hit.name || hit.id
    }
    return id
  })

  async function refresh(force = false) {
    if (!isConfigured.value) {
      loading.value = false
      return
    }
    if (catalogRefresh) return catalogRefresh
    if (loaded.value && !force) return

    catalogRefresh = (async () => {
      loading.value = true
      try {
        const payload = await gateway.request<Record<string, unknown>>('model.options', {
          refresh: force,
          include_unconfigured: true
        })
        providers.value = normalizeProviders(payload)
        const rec = payload as Record<string, unknown>
        serverDefault.value = String(rec.current_model || rec.default || rec.model || model.value || '')
        serverProvider.value = String(rec.current_provider || rec.provider || provider.value || '')
        contextLength.value = Number(rec.context_length || rec.context || 0) || 0
        const aliasRows = rec.models || rec.aliases
        aliases.value = Array.isArray(aliasRows)
          ? aliasRows.map((item) => {
            const row = item as Record<string, unknown>
            const id = String(row.id || row.model || item || '')
            return { id, owned_by: String(row.owned_by || row.provider || '') }
          }).filter(item => item.id)
          : []
        loaded.value = true
      } catch (error) {
        toast.add({
          title: '无法加载模型目录',
          description: error instanceof Error ? error.message : String(error),
          color: 'error'
        })
      } finally {
        loading.value = false
        catalogRefresh = null
      }
    })()

    return catalogRefresh
  }

  const currentContext = computed(() => contextLength.value)

  return {
    aliases,
    contextLength,
    currentContext,
    currentLabel,
    groups,
    loaded,
    loading,
    providers,
    refresh,
    serverDefault,
    serverProvider
  }
}
