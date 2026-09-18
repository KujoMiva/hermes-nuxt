import type {
  AuxiliaryModelsResponse,
  AuxiliaryTaskAssignment,
  CustomEndpoint,
  CustomEndpointsResponse,
  CustomEndpointUpdate,
  ModelAssignmentRequest,
  ModelAssignmentResponse,
  ModelProvider,
  StaleAuxAssignment
} from '~/types/hermes'
import { DashboardApiError } from '~/composables/useDashboardApi'
import {
  AUX_TASKS,
  auxTaskLabel,
  isApiKeyAuth,
  isFastTier,
  isProviderReady,
  nestedGet,
  providerMatches,
  sparsePatch,
  staleAuxAssignments
} from '~/utils/modelSettings'

function asConfig(value: unknown) {
  if (!value || typeof value !== 'object') return {}
  const rec = value as Record<string, unknown>
  if (rec.config && typeof rec.config === 'object' && rec.agent == null && rec.model == null) {
    return rec.config as Record<string, unknown>
  }
  return rec
}

export function useModelSettings() {
  const catalog = useModelCatalog()
  const dashboard = useDashboardApi()
  const gateway = useGateway()
  const connection = useConnection()
  const toast = useToast()

  const hydrating = useState('hermes-model-settings-hydrating', () => false)
  const applying = useState('hermes-model-settings-applying', () => false)
  const activating = useState('hermes-model-settings-activating', () => false)
  const selectedProvider = useState('hermes-model-settings-provider', () => '')
  const selectedModel = useState('hermes-model-settings-model', () => '')
  const apiKeyDraft = useState('hermes-model-settings-key', () => '')
  const reasoningEffort = useState('hermes-model-settings-effort', () => 'medium')
  const fastOn = useState('hermes-model-settings-fast', () => false)
  const auxiliary = useState<AuxiliaryTaskAssignment[]>('hermes-model-settings-aux', () => [])
  const endpoints = useState<CustomEndpoint[]>('hermes-model-settings-endpoints', () => [])
  const restAvailable = useState('hermes-model-settings-rest', () => true)
  const errorText = useState('hermes-model-settings-error', () => '')
  const switchStaleAux = useState<StaleAuxAssignment[]>('hermes-model-settings-stale', () => [])
  const confirmOpen = useState('hermes-model-settings-confirm', () => false)
  const confirmMessage = useState('hermes-model-settings-confirm-msg', () => '')
  const pendingAssignment = useState<ModelAssignmentRequest | null>('hermes-model-settings-pending', () => null)
  const editingAuxTask = useState('hermes-model-settings-aux-edit', () => '')
  const auxDraftProvider = useState('hermes-model-settings-aux-provider', () => '')
  const auxDraftModel = useState('hermes-model-settings-aux-model', () => '')

  const selectedProviderRow = computed(() =>
    catalog.providers.value.find(item => providerMatches(item, selectedProvider.value))
  )
  const needsSetup = computed(() => !isProviderReady(selectedProviderRow.value))
  const setupIsApiKey = computed(() => isApiKeyAuth(selectedProviderRow.value))
  const selectedModels = computed(() => (selectedProviderRow.value?.models || []).map(item => item.id))
  const mainCaps = computed(() => {
    const row = selectedProviderRow.value
    return selectedModel.value ? row?.capabilities?.[selectedModel.value] : undefined
  })
  const reasoningSupported = computed(() => mainCaps.value?.reasoning !== false)
  const fastSupported = computed(() => Boolean(mainCaps.value?.fast))
  const persistentStaleAux = computed(() =>
    staleAuxAssignments(auxiliary.value, catalog.serverProvider.value)
  )
  const providerItems = computed(() => {
    const items = catalog.providers.value.map(item => ({
      label: item.authenticated === false && !item.models?.length
        ? `${item.name || item.id} · 未配置`
        : (item.name || item.id),
      value: item.id
    }))
    if (selectedProvider.value && !items.some(item => item.value === selectedProvider.value)) {
      items.unshift({ label: selectedProvider.value, value: selectedProvider.value })
    }
    return items.length ? items : [{ label: '暂无供应商', value: '' }]
  })
  const modelItems = computed(() => {
    const ids = selectedModel.value && !selectedModels.value.includes(selectedModel.value)
      ? [selectedModel.value, ...selectedModels.value]
      : selectedModels.value
    return ids.map(id => ({ label: id, value: id }))
  })
  const readyProviderItems = computed(() =>
    catalog.providers.value
      .filter(item => isProviderReady(item))
      .map(item => ({ label: item.name || item.id, value: item.id }))
  )

  function findProvider(slug: string) {
    return catalog.providers.value.find(item => providerMatches(item, slug))
  }

  function applySelection(provider: string, model: string) {
    selectedProvider.value = provider
    selectedModel.value = model
    const row = findProvider(provider)
    if (row && !selectedModelsHas(row, model)) {
      selectedModel.value = row.models?.[0]?.id || model
    }
  }

  function selectedModelsHas(row: ModelProvider, model: string) {
    return (row.models || []).some(item => item.id === model)
  }

  function syncCookies(provider: string, model: string) {
    catalog.serverProvider.value = provider
    catalog.serverDefault.value = model
    connection.apply({ provider, model })
  }

  async function loadRest<T>(path: string, options?: Parameters<typeof dashboard.request>[1]) {
    return dashboard.request<T>(path, options)
  }

  async function loadConfigDefaults() {
    try {
      const config = asConfig(await loadRest('/config'))
      const rawEffort = String(nestedGet(config, 'agent.reasoning_effort') ?? '').trim().toLowerCase()
      reasoningEffort.value = rawEffort === 'false' || rawEffort === 'disabled' ? 'none' : (rawEffort || 'medium')
      fastOn.value = isFastTier(nestedGet(config, 'agent.service_tier'))
      restAvailable.value = true
      return
    } catch {
      // fall through to RPC
    }
    try {
      const reasoning = await gateway.request<{ value?: string }>('config.get', { key: 'reasoning' })
      reasoningEffort.value = String(reasoning.value || 'medium')
      const fast = await gateway.request<{ value?: string }>('config.get', { key: 'fast' })
      fastOn.value = String(fast.value || '') === 'fast'
    } catch {
      // keep previous
    }
  }

  async function hydrate(force = false) {
    if (!connection.isConfigured.value) return
    hydrating.value = true
    errorText.value = ''
    try {
      await catalog.refresh(force)
      const [infoResult, auxResult, endpointResult] = await Promise.allSettled([
        loadRest<{ model?: string, provider?: string, effective_context_length?: number }>('/model/info'),
        loadRest<AuxiliaryModelsResponse>('/model/auxiliary'),
        loadRest<CustomEndpointsResponse>('/providers/custom-endpoints')
      ])

      if (infoResult.status === 'fulfilled') {
        restAvailable.value = true
        const info = infoResult.value
        if (info.model) catalog.serverDefault.value = info.model
        if (info.provider) catalog.serverProvider.value = info.provider
        if (info.effective_context_length) catalog.contextLength.value = info.effective_context_length
      } else if (infoResult.reason instanceof DashboardApiError && infoResult.reason.statusCode === 404) {
        restAvailable.value = false
      }

      if (auxResult.status === 'fulfilled') {
        auxiliary.value = auxResult.value.tasks || []
        if (!catalog.serverDefault.value && auxResult.value.main?.model) {
          catalog.serverDefault.value = auxResult.value.main.model
          catalog.serverProvider.value = auxResult.value.main.provider || catalog.serverProvider.value
        }
      }

      if (endpointResult.status === 'fulfilled') {
        endpoints.value = endpointResult.value.endpoints || []
      }

      await loadConfigDefaults()

      const provider = catalog.serverProvider.value || catalog.providers.value.find(item => item.isCurrent)?.id || catalog.providers.value[0]?.id || ''
      const model = catalog.serverDefault.value || findProvider(provider)?.models?.[0]?.id || ''
      applySelection(provider, model)
      switchStaleAux.value = []
    } catch (error) {
      errorText.value = error instanceof Error ? error.message : String(error)
    } finally {
      hydrating.value = false
    }
  }

  async function submitAssignment(body: ModelAssignmentRequest): Promise<ModelAssignmentResponse | null> {
    try {
      return await loadRest<ModelAssignmentResponse>('/model/set', {
        method: 'POST',
        body,
        timeout: 45_000
      })
    } catch (error) {
      if (error instanceof DashboardApiError && error.statusCode === 404) {
        restAvailable.value = false
        throw new Error('当前网关没有 /api/model/set。请使用 hermes serve 控制台接口来写入默认模型。', { cause: error })
      }
      throw error
    }
  }

  async function applyAssignment(body: ModelAssignmentRequest) {
    applying.value = true
    errorText.value = ''
    try {
      const result = await submitAssignment(body)
      if (!result) return
      if (result.confirm_required) {
        pendingAssignment.value = { ...body, confirm_expensive_model: true }
        confirmMessage.value = result.confirm_message || '该模型费用较高，确认设为默认？'
        confirmOpen.value = true
        return
      }
      if (body.scope === 'main') {
        const provider = result.provider || body.provider
        const model = result.model || body.model
        syncCookies(provider, model)
        applySelection(provider, model)
        switchStaleAux.value = result.stale_aux || []
        toast.add({ title: '已设为默认模型', description: '新对话会使用这个组合。', color: 'success' })
      } else {
        toast.add({ title: '辅助模型已更新', color: 'success' })
      }
      await hydrate(true)
    } catch (error) {
      errorText.value = error instanceof Error ? error.message : String(error)
      toast.add({
        title: '无法保存模型',
        description: errorText.value,
        color: 'error'
      })
    } finally {
      applying.value = false
    }
  }

  async function applyMainModel() {
    if (!selectedProvider.value || !selectedModel.value) return
    await applyAssignment({
      scope: 'main',
      provider: selectedProvider.value,
      model: selectedModel.value,
      ...(selectedProviderRow.value?.apiUrl ? { base_url: selectedProviderRow.value.apiUrl } : {})
    })
  }

  async function confirmExpensive() {
    const pending = pendingAssignment.value
    confirmOpen.value = false
    pendingAssignment.value = null
    if (!pending) return
    await applyAssignment(pending)
  }

  async function activateApiKey() {
    const slug = selectedProviderRow.value?.id
    const key = apiKeyDraft.value.trim()
    if (!slug || !key) return
    activating.value = true
    errorText.value = ''
    try {
      await gateway.request('model.save_key', { slug, api_key: key })
      apiKeyDraft.value = ''
      try {
        const rec = await loadRest<{ model?: string }>('/model/recommended-default', {
          query: { provider: slug }
        })
        if (rec.model) selectedModel.value = rec.model
      } catch {
        // refresh below
      }
      await catalog.refresh(true)
      const row = findProvider(slug)
      if (row && (!selectedModel.value || !selectedModelsHas(row, selectedModel.value))) {
        selectedModel.value = row.models?.[0]?.id || selectedModel.value
      }
      toast.add({ title: '密钥已保存', description: '选择模型后点应用，即可写入默认配置。', color: 'success' })
    } catch (error) {
      errorText.value = error instanceof Error ? error.message : String(error)
      toast.add({ title: '无法保存密钥', description: errorText.value, color: 'error' })
    } finally {
      activating.value = false
    }
  }

  async function disconnectProvider() {
    const slug = selectedProviderRow.value?.id
    if (!slug) return
    applying.value = true
    try {
      await gateway.request('model.disconnect', { slug })
      await catalog.refresh(true)
      toast.add({ title: '已断开该供应商', color: 'success' })
    } catch (error) {
      toast.add({
        title: '无法断开',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    } finally {
      applying.value = false
    }
  }

  async function writeAgentDefault(path: string, value: string) {
    try {
      await loadRest('/config', {
        method: 'PUT',
        body: { config: sparsePatch(path, value) }
      })
      restAvailable.value = true
    } catch {
      if (path === 'agent.reasoning_effort') {
        await gateway.request('config.set', { key: 'reasoning', value, scope: 'global' })
      } else if (path === 'agent.service_tier') {
        await gateway.request('config.set', { key: 'fast', value: isFastTier(value) ? 'fast' : 'normal' })
      } else {
        throw new Error('无法写入配置')
      }
    }
  }

  async function setReasoning(value: string) {
    const previous = reasoningEffort.value
    reasoningEffort.value = value
    try {
      await writeAgentDefault('agent.reasoning_effort', value)
      toast.add({ title: '默认思考强度已更新', color: 'success' })
    } catch (error) {
      reasoningEffort.value = previous
      toast.add({
        title: '无法保存思考强度',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    }
  }

  async function setFast(value: boolean) {
    const previous = fastOn.value
    fastOn.value = value
    try {
      await writeAgentDefault('agent.service_tier', value ? 'fast' : 'normal')
      toast.add({ title: value ? '已开启 Fast' : '已关闭 Fast', color: 'success' })
    } catch (error) {
      fastOn.value = previous
      toast.add({
        title: '无法保存 Fast',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    }
  }

  function beginAuxiliaryEdit(task: string) {
    const current = auxiliary.value.find(item => item.task === task)
    auxDraftProvider.value = current?.provider && current.provider !== 'auto'
      ? current.provider
      : (catalog.serverProvider.value || '')
    const row = findProvider(auxDraftProvider.value)
    auxDraftModel.value = current?.model || catalog.serverDefault.value || row?.models?.[0]?.id || ''
    editingAuxTask.value = task
  }

  async function applyAuxiliaryDraft() {
    if (!editingAuxTask.value || !auxDraftProvider.value || !auxDraftModel.value) return
    const row = findProvider(auxDraftProvider.value)
    await applyAssignment({
      scope: 'auxiliary',
      task: editingAuxTask.value,
      provider: auxDraftProvider.value,
      model: auxDraftModel.value,
      ...(row?.apiUrl ? { base_url: row.apiUrl } : {})
    })
    editingAuxTask.value = ''
  }

  async function setAuxiliaryToMain(task: string) {
    if (!catalog.serverProvider.value || !catalog.serverDefault.value) return
    const row = findProvider(catalog.serverProvider.value)
    await applyAssignment({
      scope: 'auxiliary',
      task,
      provider: catalog.serverProvider.value,
      model: catalog.serverDefault.value,
      ...(row?.apiUrl ? { base_url: row.apiUrl } : {})
    })
  }

  async function resetAuxiliaryModels() {
    if (!catalog.serverProvider.value || !catalog.serverDefault.value) return
    await applyAssignment({
      scope: 'auxiliary',
      task: '__reset__',
      provider: catalog.serverProvider.value,
      model: catalog.serverDefault.value
    })
    switchStaleAux.value = []
  }

  async function saveEndpoint(payload: CustomEndpointUpdate) {
    applying.value = true
    try {
      const result = await loadRest<CustomEndpointsResponse>('/providers/custom-endpoints', {
        method: 'POST',
        body: payload
      })
      endpoints.value = result.endpoints || []
      toast.add({ title: payload.id ? '端点已更新' : '端点已保存', color: 'success' })
      if (payload.make_default) await hydrate(true)
      else await catalog.refresh(true)
    } catch (error) {
      toast.add({
        title: '无法保存端点',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
      throw error
    } finally {
      applying.value = false
    }
  }

  async function activateEndpoint(id: string) {
    applying.value = true
    try {
      const result = await loadRest<{ provider?: string, model?: string }>(
        `/providers/custom-endpoints/${encodeURIComponent(id)}/activate`,
        { method: 'POST' }
      )
      if (result.provider && result.model) syncCookies(result.provider, result.model)
      toast.add({ title: '已设为默认端点', color: 'success' })
      await hydrate(true)
    } catch (error) {
      toast.add({
        title: '无法激活端点',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    } finally {
      applying.value = false
    }
  }

  async function deleteEndpoint(id: string) {
    applying.value = true
    try {
      const result = await loadRest<CustomEndpointsResponse>(
        `/providers/custom-endpoints/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      )
      endpoints.value = result.endpoints || []
      toast.add({ title: '端点已删除', color: 'success' })
      await catalog.refresh(true)
    } catch (error) {
      toast.add({
        title: '无法删除端点',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    } finally {
      applying.value = false
    }
  }

  function onProviderChange(slug: string) {
    selectedProvider.value = slug
    const row = findProvider(slug)
    const current = catalog.serverProvider.value === slug ? catalog.serverDefault.value : ''
    selectedModel.value = current && row && selectedModelsHas(row, current)
      ? current
      : (row?.models?.[0]?.id || '')
    apiKeyDraft.value = ''
  }

  return {
    AUX_TASKS,
    activateApiKey,
    activateEndpoint,
    applying,
    auxDraftModel,
    auxDraftProvider,
    auxModelsForDraft: computed(() => {
      const row = findProvider(auxDraftProvider.value)
      const ids = (row?.models || []).map(item => item.id)
      return (auxDraftModel.value && !ids.includes(auxDraftModel.value) ? [auxDraftModel.value, ...ids] : ids)
        .map(id => ({ label: id, value: id }))
    }),
    auxTaskLabel,
    activating,
    apiKeyDraft,
    applyAuxiliaryDraft,
    applyMainModel,
    auxiliary,
    beginAuxiliaryEdit,
    catalog,
    confirmExpensive,
    confirmMessage,
    confirmOpen,
    deleteEndpoint,
    disconnectProvider,
    editingAuxTask,
    endpoints,
    errorText,
    fastOn,
    fastSupported,
    hydrate,
    hydrating,
    modelItems,
    needsSetup,
    onProviderChange,
    persistentStaleAux,
    providerItems,
    readyProviderItems,
    reasoningEffort,
    reasoningSupported,
    resetAuxiliaryModels,
    restAvailable,
    saveEndpoint,
    selectedModel,
    selectedProvider,
    selectedProviderRow,
    setAuxiliaryToMain,
    setFast,
    setReasoning,
    setupIsApiKey,
    switchStaleAux
  }
}
