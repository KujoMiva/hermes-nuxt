import type { Capabilities, ConnectionConfig, ReasoningEffort } from '~/types/hermes'
import { displayHermesEndpoint } from '~/utils/hermesEndpoint'

const COOKIE_OPTS = {
  path: '/',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 365
}

export function useConnection() {
  const { logout: clearSession, session } = useSessionInfo()
  const gateway = useGateway()
  const toast = useToast()

  const profileCookie = useCookie('hermes-profile', { ...COOKIE_OPTS, default: () => '' })
  const systemPromptCookie = useCookie('hermes-system-prompt', { ...COOKIE_OPTS, default: () => '' })
  const modelCookie = useCookie('hermes-model', { ...COOKIE_OPTS, default: () => '' })
  const providerCookie = useCookie('hermes-provider', { ...COOKIE_OPTS, default: () => '' })
  const reasoningCookie = useCookie<ReasoningEffort>('hermes-reasoning', {
    ...COOKIE_OPTS,
    default: () => ''
  })

  const lastError = computed(() => gateway.lastError.value)
  const isConfigured = computed(() => session.value.loggedIn)
  const connected = computed(() => gateway.state.value === 'open')
  const connecting = computed(() => gateway.state.value === 'connecting')
  const baseUrl = computed(() => session.value.baseUrl || session.value.host || '')
  const profile = computed({
    get: () => profileCookie.value || '',
    set: (value: string) => {
      profileCookie.value = value
    }
  })
  const systemPrompt = computed({
    get: () => systemPromptCookie.value || '',
    set: (value: string) => {
      systemPromptCookie.value = value
    }
  })
  const model = computed({
    get: () => modelCookie.value || '',
    set: (value: string) => {
      modelCookie.value = value
    }
  })
  const provider = computed({
    get: () => providerCookie.value || '',
    set: (value: string) => {
      providerCookie.value = value
    }
  })
  const reasoningEffort = computed({
    get: () => reasoningCookie.value || '',
    set: (value: ReasoningEffort) => {
      reasoningCookie.value = value
    }
  })
  const serverModel = computed(() => model.value)
  const capabilities = useState<Capabilities | null>('hermes-capabilities', () => null)
  const endpointHref = computed(() => displayHermesEndpoint(baseUrl.value, profile.value))

  async function testConnection() {
    if (!isConfigured.value) {
      throw new Error('尚未登录远程网关')
    }

    await gateway.ensureConnected()
    await gateway.request('gateway.ping')
    capabilities.value = {
      platform: 'remote-gateway',
      version: session.value.version || undefined,
      features: {
        sessions: true,
        jobs: true,
        skills: true,
        tools: true,
        models: true
      }
    }
  }

  async function logout() {
    gateway.close()
    await clearSession()
  }

  function applyLocal(partial: Partial<ConnectionConfig>) {
    if (partial.profile != null) profile.value = partial.profile
    if (partial.systemPrompt != null) systemPrompt.value = partial.systemPrompt
    if (partial.model != null) model.value = partial.model
    if (partial.provider != null) provider.value = partial.provider
    if (partial.reasoningEffort != null) reasoningEffort.value = partial.reasoningEffort
  }

  function apply(partial: Partial<ConnectionConfig>) {
    applyLocal(partial)
  }

  return {
    apply,
    applyLocal,
    baseUrl,
    capabilities,
    connected,
    connecting,
    endpointHref,
    isConfigured,
    lastError,
    logout,
    model,
    profile,
    provider,
    reasoningEffort,
    serverModel,
    session,
    systemPrompt,
    testConnection,
    toast
  }
}
