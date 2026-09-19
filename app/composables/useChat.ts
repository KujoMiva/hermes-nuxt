import type { ChatApproval, ChatClarify, ChatStatus, ChatStopKind, ChatSudo, ChatThreadMessage, ChatToolEvent, ReasoningEffort, SessionRuntimeInfo } from '~/types/hermes'
import {
  appendStreamPart,
  appendToolPart,
  applyCompleteReasoning,
  applyCompleteText,
  markLastStreamPartLive,
  messageParts,
  patchToolPart,
  sealOpenParts,
  sliceAfterLastTool,
  withAppendedTools,
  withParts
} from '~/utils/assistantParts'
import { branchCountThrough } from '~/utils/chatBranch'
import {
  applySurvivorRowIdMap,
  asRowId,
  freezeInterruptedMessages,
  isSessionBusyError,
  reattachSessionImages,
  resolveDurableRowId,
  truncateSubmitParams,
  visibleUserOrdinal
} from '~/utils/chatEdit'
import { chatUid, sleep } from '~/utils/chatRun'
import { asJsonRpcParams } from '~/utils/jsonRpc'
import { applyOpenPrompt, parseApprovalRequest, parseClarifyRequest, parseSudoRequest, type GatewayOpenRequest } from '~/utils/serverPrompt'
import { isGenericModel } from '~/composables/useModelCatalog'
import { isBusySessionModelSwitch, sessionModelSetValue } from '~/utils/modelSettings'
import { asSessionReasoningEffort } from '~/utils/reasoning'
import { isSubagentTool, isToolResultFailed } from '~/utils/toolRun'
import { mapSessionMessage, mergeAssistantMessages, mergeAssistantTurns } from '~/utils/sessionMessages'
import {
  asReasoningText,
  coerceThinkingText,
  finalizeAssistantText,
  mergeReasoningAvailable,
  providerWaitText,
  splitReasoning
} from '~/utils/thinking'

function revokeBlobImages(rows: ChatThreadMessage[]) {
  for (const row of rows) {
    for (const src of row.images || []) {
      if (src.startsWith('blob:')) URL.revokeObjectURL(src)
    }
  }
}

let eventsBound = false
let historyLoad = 0

export function usePendingPrompt() {
  return useState<{ text: string, images: string[] } | null>('hermes-pending-prompt', () => null)
}

function asSessionModel(id?: string | null) {
  const value = id?.trim() || ''
  return isGenericModel(value) ? '' : value
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('无法读取图片'))
    reader.readAsDataURL(file)
  })
}

function mapHistoryMessages(raw: unknown[]): ChatThreadMessage[] {
  const rows: ChatThreadMessage[] = []
  let pendingTools: ChatToolEvent[] = []

  function attachTools(target: ChatThreadMessage, extra: ChatToolEvent[]) {
    if (!extra.length) return
    Object.assign(target, withAppendedTools(target, extra))
  }

  function takeAssistant(rec: Record<string, unknown>, createdAt: number): ChatThreadMessage {
    const fromCalls: ChatToolEvent[] = []
    const calls = rec.tool_calls
    if (Array.isArray(calls)) {
      for (const [index, call] of calls.entries()) {
        if (!call || typeof call !== 'object') continue
        const row = call as Record<string, unknown>
        const fn = row.function && typeof row.function === 'object'
          ? row.function as Record<string, unknown>
          : null
        const name = String(fn?.name || row.name || 'tool')
        fromCalls.push({
          id: String(row.id || `${rec.row_id || 'tool'}-${index}`),
          name,
          kind: isSubagentTool({ name, kind: 'tool' }) ? 'subagent' : 'tool',
          status: 'completed',
          args: fn?.arguments ?? row.arguments,
          startedAt: createdAt,
          endedAt: createdAt
        })
      }
    }
    const rowId = asRowId(rec.row_id)
    const rawContent = String(rec.text || rec.content || '')
    const split = splitReasoning(rawContent)
    const next: ChatThreadMessage = {
      id: String(rowId ?? rec.row_id ?? rec.id ?? chatUid('a')),
      role: 'assistant',
      rowId,
      content: split.text || rawContent,
      reasoning: asReasoningText(rec.reasoning || rec.reasoning_content || rec.reasoning_details) || split.reasoning,
      tools: fromCalls,
      createdAt
    }
    return withParts(next, messageParts(next))
  }

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const role = rec.role
    const createdAt = typeof rec.timestamp === 'number'
      ? (rec.timestamp > 1e12 ? rec.timestamp : rec.timestamp * 1000)
      : Date.now()

    if (role === 'tool') {
      const name = String(rec.name || rec.tool_name || 'tool')
      const tool: ChatToolEvent = {
        id: String(rec.tool_id || rec.tool_call_id || rec.id || chatUid('tool')),
        name,
        kind: isSubagentTool({ name, kind: 'tool' }) ? 'subagent' : 'tool',
        status: isToolResultFailed(rec.result) ? 'failed' : 'completed',
        preview: String(rec.context || rec.summary || rec.text || ''),
        args: rec.args,
        result: rec.result,
        resultText: typeof rec.result_text === 'string' ? rec.result_text : undefined,
        startedAt: createdAt,
        endedAt: createdAt
      }
      const last = rows.at(-1)
      if (last?.role === 'assistant') attachTools(last, [tool])
      else pendingTools.push(tool)
      continue
    }

    if (role !== 'user' && role !== 'assistant' && role !== 'system') continue

    if (role === 'assistant') {
      const next = takeAssistant(rec, createdAt)
      attachTools(next, pendingTools)
      pendingTools = []
      const last = rows.at(-1)
      if (last?.role === 'assistant' && !last.content.trim()) {
        rows[rows.length - 1] = mergeAssistantMessages(last, next)
        continue
      }
      rows.push(next)
      continue
    }

    const mapped = mapSessionMessage({
      id: typeof rec.row_id === 'string' || typeof rec.row_id === 'number'
        ? rec.row_id
        : typeof rec.id === 'string' || typeof rec.id === 'number'
          ? rec.id
          : chatUid(role === 'user' ? 'u' : 's'),
      role,
      content: rec.text ?? rec.content ?? '',
      timestamp: typeof rec.timestamp === 'number' || typeof rec.timestamp === 'string'
        ? rec.timestamp
        : undefined,
      reasoning: typeof rec.reasoning === 'string' ? rec.reasoning : undefined,
      reasoning_content: typeof rec.reasoning_content === 'string' ? rec.reasoning_content : undefined
    })
    if (mapped) rows.push(mapped)
  }

  const last = rows.at(-1)
  if (last?.role === 'assistant') attachTools(last, pendingTools)
  else if (pendingTools.length) {
    const orphan: ChatThreadMessage = {
      id: chatUid('a'),
      role: 'assistant',
      content: '',
      tools: pendingTools,
      createdAt: pendingTools[0]?.startedAt || Date.now()
    }
    rows.push(withParts(orphan, messageParts(orphan)))
  }

  return mergeAssistantTurns(rows)
}

export function useChatController() {
  const gateway = useGateway()
  const { model, provider, reasoningEffort, isConfigured } = useConnection()
  const catalog = useModelCatalog()
  const sessions = useSessions()
  const toast = useToast()

  const sessionId = useState('hermes-active-session', () => '')
  const storedSessionId = useState('hermes-stored-session', () => '')
  const sessionModel = useState('hermes-session-model', () => '')
  const sessionProvider = useState('hermes-session-provider', () => '')
  const sessionReasoningEffort = useState<ReasoningEffort>('hermes-session-reasoning', () => '')
  const sessionReasoningKnown = useState('hermes-session-reasoning-known', () => false)
  const serverReasoningEffort = useState<ReasoningEffort>('hermes-server-reasoning', () => '')
  const messages = useState<ChatThreadMessage[]>('hermes-messages', () => [])
  const status = useState<ChatStatus>('hermes-chat-status', () => 'ready')
  const errorText = useState('hermes-chat-error', () => '')
  const approval = useState<ChatApproval | null>('hermes-approval', () => null)
  const clarify = useState<ChatClarify | null>('hermes-clarify', () => null)
  const sudo = useState<ChatSudo | null>('hermes-sudo', () => null)
  const pendingSteer = useState('hermes-pending-steer', () => '')
  const pendingApproval = useState<ChatApproval | null>('hermes-pending-approval', () => null)
  const pendingClarify = useState<ChatClarify | null>('hermes-pending-clarify', () => null)
  const pendingSudo = useState<ChatSudo | null>('hermes-pending-sudo', () => null)
  const loadingHistory = useState('hermes-history-loading', () => false)
  const liveHint = useState('hermes-live-hint', () => '')
  const providerWait = useState('hermes-provider-wait', () => '')
  const userStopped = useState('hermes-user-stopped', () => false)
  const turnStopKind = useState<ChatStopKind | ''>('hermes-turn-stop-kind', () => '')
  const assistantId = useState('hermes-assistant-id', () => '')

  const busy = computed(() => status.value === 'submitted' || status.value === 'streaming')
  const stopping = computed(() => userStopped.value && busy.value)
  const thread = computed(() => mergeAssistantTurns(messages.value))

  const activeModel = computed(() => asSessionModel(sessionModel.value) || asSessionModel(model.value))
  const activeProvider = computed(() => sessionProvider.value.trim() || provider.value.trim())
  const activeReasoningEffort = computed(() => {
    if (sessionReasoningKnown.value) {
      return asSessionReasoningEffort(sessionReasoningEffort.value)
        || asSessionReasoningEffort(serverReasoningEffort.value)
    }
    if (storedSessionId.value) {
      return asSessionReasoningEffort(sessionReasoningEffort.value)
        || asSessionReasoningEffort(serverReasoningEffort.value)
    }
    return asSessionReasoningEffort(reasoningEffort.value)
      || asSessionReasoningEffort(serverReasoningEffort.value)
  })

  function inferProvider(modelId: string) {
    for (const group of catalog.providers.value) {
      if ((group.models || []).some(item => item.id === modelId)) return group.id
    }
    return ''
  }

  function applySessionSelection(nextModel = '', nextProvider = '') {
    sessionModel.value = asSessionModel(nextModel)
    sessionProvider.value = nextProvider.trim()
    if (sessionModel.value && !sessionProvider.value) {
      sessionProvider.value = inferProvider(sessionModel.value)
    }
  }

  function applySessionRuntime(info?: SessionRuntimeInfo | null) {
    if (!info) return
    if (info.model) applySessionSelection(info.model, info.provider || '')
    if (typeof info.reasoning_effort !== 'string') return
    const effort = asSessionReasoningEffort(info.reasoning_effort)
    if (!effort) return
    sessionReasoningEffort.value = effort
    sessionReasoningKnown.value = true
  }

  async function hydrateReasoningFromConfig() {
    if (sessionReasoningKnown.value && asSessionReasoningEffort(sessionReasoningEffort.value)) return
    if (!sessionId.value && asSessionReasoningEffort(serverReasoningEffort.value)) return
    try {
      const got = await gateway.request<{ value?: string }>('config.get', {
        key: 'reasoning',
        ...(sessionId.value ? { session_id: sessionId.value } : {})
      })
      const effort = asSessionReasoningEffort(got?.value)
      if (!effort) return
      if (sessionId.value) {
        sessionReasoningEffort.value = effort
        sessionReasoningKnown.value = true
        return
      }
      serverReasoningEffort.value = effort
    } catch {
      // older gateways may not expose this key
    }
  }

  function clearSessionRuntime() {
    sessionModel.value = ''
    sessionProvider.value = ''
    sessionReasoningEffort.value = ''
    sessionReasoningKnown.value = false
  }

  function sameSession(eventSession?: string) {
    if (!eventSession || !sessionId.value) return true
    return eventSession === sessionId.value || eventSession === storedSessionId.value
  }

  function requestSessionId(params: unknown) {
    const session = asJsonRpcParams(params).session_id
    return typeof session === 'string' ? session : ''
  }

  function samePromptSession(params: unknown) {
    return sameSession(requestSessionId(params) || undefined)
  }

  function promptHandlers() {
    return {
      approval: (value: ChatApproval) => {
        approval.value = { ...approval.value, ...value }
      },
      clarify: (value: ChatClarify) => {
        clarify.value = value
      },
      sudo: (value: ChatSudo) => {
        sudo.value = value
      }
    }
  }

  function applyOpenRequests(rows?: GatewayOpenRequest[]) {
    if (!Array.isArray(rows)) return
    clarify.value = null
    sudo.value = null
    for (const entry of rows) {
      if (entry.id != null) gateway.acceptRequest(entry.id)
      applyOpenPrompt(entry, promptHandlers())
    }
  }

  function isActiveId(id?: string | null) {
    const value = id?.trim() || ''
    if (!value) return false
    return value === sessionId.value || value === storedSessionId.value
  }

  function appendAssistant() {
    const last = messages.value.at(-1)
    if (last?.role === 'assistant') {
      assistantId.value = last.id
      if (!last.streaming) patchAssistant(last.id, { streaming: true })
      return last
    }
    const message: ChatThreadMessage = {
      id: chatUid('asst'),
      role: 'assistant',
      content: '',
      tools: [],
      parts: [],
      streaming: true,
      createdAt: Date.now()
    }
    messages.value = [...messages.value, message]
    assistantId.value = message.id
    return message
  }

  function patchAssistant(id: string, patch: Partial<ChatThreadMessage>) {
    messages.value = messages.value.map(item => item.id === id ? { ...item, ...patch } : item)
  }

  function clearProviderWait() {
    if (providerWait.value) providerWait.value = ''
  }

  function patchParts(
    current: ChatThreadMessage,
    parts: ChatThreadMessage['parts'],
    extra: Partial<ChatThreadMessage> = {}
  ) {
    patchAssistant(current.id, {
      ...withParts(current, parts || []),
      ...extra
    })
  }

  function applyReasoning(text: string, replace: boolean) {
    const delta = coerceThinkingText(text)
    if (!delta) return
    const current = messages.value.find(item => item.id === assistantId.value) || appendAssistant()
    const parts = [...messageParts(current)]
    const round = sliceAfterLastTool(parts)
    const roundText = round.some(part => part.type === 'text' && part.text.trim())
    const roundReasoning = round.findLast(part => part.type === 'reasoning')
    if (replace) {
      if (roundText && !(roundReasoning?.text || '').trim()) return
      const base = roundReasoning?.text || ''
      const next = mergeReasoningAvailable(base, delta)
      if (next === base) return
      if (roundReasoning) {
        patchParts(current, parts.map(part => (
          part === roundReasoning
            ? { ...part, text: next, live: true, startedAt: part.startedAt || Date.now() }
            : part
        )), { streaming: true })
        return
      }
      patchParts(current, appendStreamPart(parts, 'reasoning', next), { streaming: true })
      return
    }
    patchParts(current, appendStreamPart(parts, 'reasoning', delta), { streaming: true })
  }

  function bindEvents() {
    if (eventsBound || !import.meta.client) return
    eventsBound = true

    gateway.on('message.start', (event) => {
      if (!sameSession(event.session_id)) return
      status.value = 'streaming'
      userStopped.value = false
      turnStopKind.value = ''
      clearProviderWait()
      const current = appendAssistant()
      patchParts(current, sealOpenParts(messageParts(current)), { streaming: true })
    })

    gateway.on<{ text?: string }>('message.delta', (event) => {
      if (!sameSession(event.session_id)) return
      const text = event.payload?.text
      if (typeof text !== 'string' || !text) return
      status.value = 'streaming'
      clearProviderWait()
      const current = messages.value.find(item => item.id === assistantId.value) || appendAssistant()
      patchParts(current, appendStreamPart(messageParts(current), 'text', text), { streaming: true })
    })

    gateway.on<{ text?: string, error?: string, status?: string, reasoning?: string }>('message.complete', (event) => {
      if (!sameSession(event.session_id)) return
      status.value = 'ready'
      clearProviderWait()
      const current = messages.value.find(item => item.id === assistantId.value)
      if (current) {
        const lastText = [...messageParts(current)].reverse().find(part => part.type === 'text')
        const lastReasoning = [...messageParts(current)].reverse().find(part => part.type === 'reasoning')
        const finalized = finalizeAssistantText({
          content: lastText?.text || '',
          payloadText: event.payload?.text,
          payloadReasoning: event.payload?.reasoning,
          streamedReasoning: lastReasoning?.text
        })
        const completed = applyCompleteReasoning(
          applyCompleteText(messageParts(current), finalized.content),
          finalized.reasoning
        ).map(part => (
          part.type === 'tool' && part.tool.status === 'running'
            ? { type: 'tool' as const, tool: { ...part.tool, status: 'completed' as const, endedAt: Date.now() } }
            : part
        ))
        patchParts(current, completed, {
          streaming: false,
          stopKind: userStopped.value ? 'user_stop' : undefined
        })
      }
      if (event.payload?.status === 'error' && event.payload.error) {
        errorText.value = event.payload.error
      }
      void sessions.refresh()
    })

    gateway.on<{
      name?: string
      summary?: string
      context?: string
      preview?: string
      tool_id?: string
      args?: unknown
    }>('tool.start', (event) => {
      if (!sameSession(event.session_id)) return
      clearProviderWait()
      const current = messages.value.find(item => item.id === assistantId.value) || appendAssistant()
      const name = event.payload?.name || 'tool'
      patchParts(current, appendToolPart(messageParts(current), {
        id: String(event.payload?.tool_id || chatUid('tool')),
        name,
        kind: isSubagentTool({ name, kind: 'tool' }) ? 'subagent' as const : 'tool' as const,
        status: 'running',
        preview: event.payload?.summary || event.payload?.context || event.payload?.preview || '',
        args: event.payload?.args,
        startedAt: Date.now()
      }), { streaming: true })
    })

    gateway.on<{
      tool_id?: string
      name?: string
      summary?: string
      result?: unknown
      args?: unknown
      result_text?: string
      inline_diff?: string
      duration_s?: number
    }>('tool.complete', (event) => {
      if (!sameSession(event.session_id)) return
      const current = messages.value.find(item => item.id === assistantId.value)
      if (!current) return
      const toolId = event.payload?.tool_id
      const toolName = event.payload?.name
      let matched = false
      patchParts(current, patchToolPart(
        messageParts(current),
        (tool) => {
          if (matched || tool.status !== 'running') return false
          if (toolId && tool.id !== String(toolId) && tool.name !== toolName) return false
          if (!toolId && toolName && tool.name !== toolName) return false
          matched = true
          return true
        },
        (tool) => {
          const durationMs = typeof event.payload?.duration_s === 'number'
            ? Math.round(event.payload.duration_s * 1000)
            : undefined
          const endedAt = Date.now()
          return {
            ...tool,
            status: isToolResultFailed(event.payload?.result) ? 'failed' as const : 'completed' as const,
            preview: event.payload?.summary || tool.preview,
            args: event.payload?.args ?? tool.args,
            result: event.payload?.result,
            resultText: event.payload?.result_text || tool.resultText,
            inlineDiff: event.payload?.inline_diff || tool.inlineDiff,
            endedAt: durationMs != null && tool.startedAt
              ? tool.startedAt + durationMs
              : endedAt
          }
        }
      ))
    })

    gateway.on<{ text?: string }>('reasoning.delta', (event) => {
      if (!sameSession(event.session_id)) return
      if (typeof event.payload?.text !== 'string' || !event.payload.text) return
      clearProviderWait()
      status.value = 'streaming'
      applyReasoning(event.payload.text, false)
    })

    gateway.on<{ text?: string }>('reasoning.available', (event) => {
      if (!sameSession(event.session_id)) return
      if (typeof event.payload?.text !== 'string' || !event.payload.text) return
      clearProviderWait()
      status.value = 'streaming'
      applyReasoning(event.payload.text, true)
    })

    gateway.on<{ text?: string }>('thinking.delta', (event) => {
      if (!sameSession(event.session_id)) return
      const wait = providerWaitText(String(event.payload?.text || ''))
      if (wait) providerWait.value = wait
    })

    gateway.on<{ text?: string, already_streamed?: boolean }>('message.interim', (event) => {
      if (!sameSession(event.session_id)) return
      const text = event.payload?.text
      if (typeof text !== 'string' || !text) return
      clearProviderWait()
      const current = messages.value.find(item => item.id === assistantId.value) || appendAssistant()
      const parts = messageParts(current)
      if (event.payload?.already_streamed) {
        patchParts(current, sealOpenParts(parts), { streaming: true })
        return
      }
      const sealed = sealOpenParts(parts)
      const last = sealed.at(-1)
      const next = last?.type === 'text'
        ? sealed.map((part, index) => index === sealed.length - 1 && part.type === 'text'
            ? { ...part, text, live: false }
            : part)
        : [...sealed, { type: 'text' as const, text, live: false }]
      patchParts(current, next, { streaming: true })
    })

    gateway.on<ChatApproval>('approval.request', (event) => {
      if (!sameSession(event.session_id)) return
      approval.value = { ...approval.value, ...event.payload }
    })

    gateway.on<{ id?: string | number, method?: string }>('request.cancel', (event) => {
      const id = event.payload?.id
      const method = event.payload?.method
      if (id == null) return
      if (method === 'clarify' && String(clarify.value?.requestId) === String(id)) clarify.value = null
      if (method === 'sudo' && String(sudo.value?.requestId) === String(id)) sudo.value = null
      if (method === 'approval' && (
        String(approval.value?.server_request_id) === String(id)
        || approval.value?.request_id === id
      )) {
        approval.value = null
      }
    })

    gateway.onRequest((request) => {
      if (!samePromptSession(request.params)) return false
      if (request.method === 'clarify') {
        const parsed = parseClarifyRequest(request.id, request.params)
        if (!parsed) return false
        clarify.value = parsed
        return true
      }
      if (request.method === 'sudo') {
        sudo.value = parseSudoRequest(request.id, request.params)
        return true
      }
      if (request.method === 'approval') {
        approval.value = { ...approval.value, ...parseApprovalRequest(request.id, request.params) }
        return true
      }
      return false
    })

    gateway.on<{ session_id?: string, title?: string }>('session.title', (event) => {
      const id = event.payload?.session_id || event.session_id || storedSessionId.value
      if (!id) return
      const title = event.payload?.title
      if (title) sessions.upsert({ id, title })
    })

    gateway.on<SessionRuntimeInfo>('session.info', (event) => {
      const id = event.session_id || event.payload?.stored_session_id
      if (!sameSession(id)) return
      applySessionRuntime(event.payload)
      void hydrateReasoningFromConfig()
    })
  }

  async function ensureDraft() {
    if (sessionId.value) return sessionId.value
    const draftEffort = asSessionReasoningEffort(reasoningEffort.value)
    const created = await gateway.request<{ session_id: string, stored_session_id?: string, info?: SessionRuntimeInfo }>('session.create', {
      source: 'webui',
      close_on_disconnect: false,
      ...(activeModel.value ? { model: activeModel.value } : {}),
      ...(activeProvider.value ? { provider: activeProvider.value } : {}),
      ...(draftEffort ? { reasoning_effort: draftEffort } : {})
    })
    sessionId.value = created.session_id
    storedSessionId.value = created.stored_session_id || created.session_id
    applySessionRuntime(created.info)
    void hydrateReasoningFromConfig()
    return sessionId.value
  }

  function applyResume(id: string, resumed: {
    info?: SessionRuntimeInfo
    messages?: unknown[]
    open_requests?: GatewayOpenRequest[]
    pending_approval?: ChatApproval
    running?: boolean
    session_id?: string
    session_key?: string
  }, replaceMessages: boolean) {
    sessionId.value = resumed.session_id || id
    storedSessionId.value = resumed.session_key || id
    if (replaceMessages) {
      revokeBlobImages(messages.value)
      messages.value = mapHistoryMessages(resumed.messages || [])
    }
    applySessionRuntime(resumed.info)
    void hydrateReasoningFromConfig()
    if (resumed.pending_approval) approval.value = { ...approval.value, ...resumed.pending_approval }
    applyOpenRequests(resumed.open_requests)
    if (resumed.running) {
      status.value = 'streaming'
      const last = messages.value.at(-1)
      if (last?.role === 'assistant') {
        assistantId.value = last.id
        patchParts(last, markLastStreamPartLive(messageParts(last)), { streaming: true })
      } else {
        appendAssistant()
      }
    } else {
      if (!replaceMessages && (status.value === 'streaming' || status.value === 'submitted')) {
        messages.value = freezeInterruptedMessages(messages.value)
      }
      status.value = 'ready'
      assistantId.value = ''
    }
  }

  async function loadSession(id: string) {
    const token = ++historyLoad
    sessionId.value = ''
    storedSessionId.value = id
    clearSessionRuntime()
    revokeBlobImages(messages.value)
    messages.value = []
    approval.value = null
    clarify.value = null
    sudo.value = null
    pendingSteer.value = ''
    errorText.value = ''
    liveHint.value = ''
    providerWait.value = ''
    status.value = 'ready'
    loadingHistory.value = true
    bindEvents()
    try {
      await gateway.ensureConnected()
      const resumed = await gateway.request<{
        session_id?: string
        session_key?: string
        messages?: unknown[]
        running?: boolean
        info?: SessionRuntimeInfo
        pending_approval?: ChatApproval
        open_requests?: GatewayOpenRequest[]
      }>('session.resume', { session_id: id })
      if (token !== historyLoad) return
      applyResume(id, resumed, true)
    } catch (error) {
      if (token !== historyLoad) return
      errorText.value = error instanceof Error ? error.message : '无法加载会话'
    } finally {
      if (token === historyLoad) loadingHistory.value = false
    }
  }

  async function resumeIfActive(id: string) {
    if (sessionId.value === id || storedSessionId.value === id) return
    await loadSession(id)
  }

  async function rebindAfterReconnect() {
    const id = storedSessionId.value
    if (!id) return
    const token = historyLoad
    try {
      const resumed = await gateway.request<{
        session_id?: string
        session_key?: string
        messages?: unknown[]
        running?: boolean
        info?: SessionRuntimeInfo
        pending_approval?: ChatApproval
        open_requests?: GatewayOpenRequest[]
      }>('session.resume', { session_id: id })
      if (token !== historyLoad || storedSessionId.value !== id) return
      errorText.value = ''
      liveHint.value = ''
      providerWait.value = ''
      applyResume(id, resumed, shouldReplaceTranscriptOnRebind(status.value, resumed.running))
    } catch {
      // keep the on-screen transcript if the rebound RPC fails
    }
  }

  async function attachImage(file: File, onProgress?: (progress: { percent: number, loaded: number, total: number }) => void) {
    const sid = await ensureDraft()
    onProgress?.({ percent: 30, loaded: 0, total: file.size })
    const content_base64 = await fileToBase64(file)
    onProgress?.({ percent: 70, loaded: file.size, total: file.size })
    const attached = await gateway.request<{ path?: string, name?: string }>('image.attach_bytes', {
      session_id: sid,
      content_base64,
      filename: file.name
    })
    onProgress?.({ percent: 100, loaded: file.size, total: file.size })
    return { ref: attached?.path || attached?.name || file.name }
  }

  async function send(text: string, images: string[] = []) {
    if (!isConfigured.value) {
      await navigateTo('/login')
      return
    }
    const trimmed = text.trim()
    const imageSrcs = images.filter(Boolean)
    if (!trimmed && !imageSrcs.length) return
    errorText.value = ''
    userStopped.value = false
    turnStopKind.value = ''
    let queued = false
    try {
      const sid = await ensureDraft()
      messages.value = [...messages.value, {
        id: chatUid('u'),
        role: 'user',
        content: trimmed,
        ...(imageSrcs.length ? { images: imageSrcs } : {}),
        createdAt: Date.now()
      }]
      queued = true
      status.value = 'submitted'
      bindEvents()
      const submitted = gateway.request('prompt.submit', { session_id: sid, text: trimmed })
      await openStoredChat()
      await submitted
    } catch (error) {
      if (queued) {
        status.value = 'ready'
        errorText.value = error instanceof Error ? error.message : '发送失败'
        return
      }
      errorText.value = error instanceof Error ? error.message : '无法创建会话'
      throw error
    }
  }

  async function openStoredChat() {
    const stored = storedSessionId.value
    if (stored && useRoute().path === '/') {
      void sessions.refresh()
      await navigateTo(`/chat/${stored}`)
    }
  }

  async function interruptSession(sid: string) {
    try {
      await gateway.request('session.interrupt', { session_id: sid })
    } catch {
      // best-effort; submit still gates on gateway busy
    }
  }

  async function submitPrompt(sid: string, text: string, extra: Record<string, unknown> = {}) {
    const run = () => gateway.request<{ survivor_row_id_map?: unknown }>('prompt.submit', {
      session_id: sid,
      text,
      ...extra
    })
    try {
      return await run()
    } catch (error) {
      if (!isSessionBusyError(error)) throw error
      await interruptSession(sid)
      const deadline = Date.now() + 8_000
      while (Date.now() < deadline) {
        await sleep(200)
        try {
          return await run()
        } catch (retryError) {
          if (!isSessionBusyError(retryError) || Date.now() >= deadline) throw retryError
        }
      }
      throw error
    }
  }

  async function editMessage(id: string, text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    if (!isConfigured.value) {
      await navigateTo('/login')
      return
    }

    const index = messages.value.findIndex(item => item.id === id)
    const source = messages.value[index]
    if (!source || source.role !== 'user') return
    if (source.content.trim() === trimmed) return

    const snapshot = freezeInterruptedMessages(messages.value)
    const sourceText = source.content.trim()
    const expectedOrdinal = visibleUserOrdinal(messages.value, index)
    const interruptFirst = busy.value
    errorText.value = ''
    userStopped.value = false
    turnStopKind.value = ''
    liveHint.value = ''
    providerWait.value = ''
    assistantId.value = ''
    messages.value = [
      ...messages.value.slice(0, index),
      { ...source, content: trimmed, rowId: undefined }
    ]
    status.value = 'submitted'
    bindEvents()

    try {
      const sid = await ensureDraft()
      if (interruptFirst) await interruptSession(sid)

      let rowId = source.rowId
      if (typeof rowId !== 'number') {
        rowId = await resolveDurableRowId(gateway.request, sid, sourceText, expectedOrdinal)
      }

      const trunc = truncateSubmitParams(rowId)
      if (!Object.keys(trunc).length) {
        let lastUser = -1
        for (let i = snapshot.length - 1; i >= 0; i -= 1) {
          if (snapshot[i]?.role === 'user') {
            lastUser = i
            break
          }
        }
        if (index !== lastUser || index < snapshot.length - 1) {
          throw new Error('无法定位这条消息，请刷新后再试')
        }
      }

      await reattachSessionImages(gateway.request, sid, source.images)
      const result = await submitPrompt(sid, trimmed, trunc)
      messages.value = applySurvivorRowIdMap(messages.value, result?.survivor_row_id_map)
      await openStoredChat()
    } catch (error) {
      messages.value = snapshot
      status.value = 'ready'
      errorText.value = error instanceof Error ? error.message : '无法编辑消息'
      toast.add({
        title: '无法编辑消息',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    }
  }

  async function branchFromMessage(id: string) {
    if (busy.value) {
      toast.add({
        title: '无法创建分支',
        description: '请先停止当前回复。',
        color: 'warning'
      })
      return
    }
    const source = messages.value.find(item => item.id === id)
    if (source?.role !== 'assistant' || !source.content.trim()) {
      toast.add({
        title: '无法创建分支',
        description: '只能从助手回复创建分支。',
        color: 'warning'
      })
      return
    }
    const count = branchCountThrough(messages.value, id)
    if (!count) {
      toast.add({
        title: '无法创建分支',
        description: '这条消息没有可复制的内容。',
        color: 'warning'
      })
      return
    }
    const parentId = storedSessionId.value || sessionId.value
    if (!parentId) {
      toast.add({
        title: '无法创建分支',
        description: '请先发送一条消息。',
        color: 'warning'
      })
      return
    }
    const forked = await sessions.fork(parentId, count)
    toast.add({
      title: '已创建分支',
      description: '原会话还在，请在新会话里继续。',
      color: 'success'
    })
    await navigateTo(`/chat/${forked.id}`)
  }

  async function steer(text: string) {
    const sid = sessionId.value
    if (!sid || !text.trim()) return
    pendingSteer.value = text.trim()
    try {
      await gateway.request('session.steer', { session_id: sid, text: text.trim() })
    } catch (error) {
      pendingSteer.value = ''
      toast.add({
        title: '无法发送引导',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    }
  }

  function clearPendingSteer() {
    const text = pendingSteer.value
    pendingSteer.value = ''
    return text
  }

  async function stop() {
    const sid = sessionId.value
    if (!sid) return
    userStopped.value = true
    turnStopKind.value = 'stopping'
    try {
      await gateway.request('session.interrupt', { session_id: sid })
    } catch (error) {
      toast.add({
        title: '无法停止',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    }
  }

  async function resolveApproval(choice: string) {
    const sid = sessionId.value
    if (!sid || !approval.value) return
    pendingApproval.value = approval.value
    try {
      const serverId = approval.value.server_request_id
      if (serverId != null && gateway.respond(serverId, { choice })) {
        approval.value = null
        return
      }
      await gateway.request('approval.respond', {
        session_id: sid,
        choice,
        request_id: approval.value.request_id
      })
      approval.value = null
    } catch (error) {
      toast.add({
        title: '无法处理审批',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    } finally {
      pendingApproval.value = null
    }
  }

  async function resolveClarify(result: { answer?: string, answers?: Record<string, string> } = {}) {
    const req = clarify.value
    if (!req) return
    pendingClarify.value = req
    try {
      if (!gateway.respond(req.requestId, result)) {
        throw new Error('这条提问已经失效')
      }
      clarify.value = null
    } catch (error) {
      toast.add({
        title: '无法提交选择',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    } finally {
      pendingClarify.value = null
    }
  }

  async function lockClarify(answers: Record<string, string>) {
    const req = clarify.value
    const questions = req?.questions
    if (!req || !questions?.length) return
    pendingClarify.value = req
    try {
      for (const question of questions) {
        const locked = await gateway.request<{ remaining?: string[] | null, status?: string }>('clarify.lock', {
          request_id: String(req.requestId),
          question_id: question.qid,
          answer: answers[question.qid] ?? ''
        })
        if (locked.status === 'expired') break
      }
      gateway.forgetRequest(req.requestId)
      clarify.value = null
    } catch (error) {
      toast.add({
        title: '无法提交选择',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    } finally {
      pendingClarify.value = null
    }
  }

  async function resolveSudo(value: string) {
    const req = sudo.value
    if (!req) return
    pendingSudo.value = req
    try {
      if (!gateway.respond(req.requestId, { value })) {
        throw new Error('这条命令提问已经失效')
      }
      sudo.value = null
    } catch (error) {
      toast.add({
        title: '无法提交密码',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    } finally {
      pendingSudo.value = null
    }
  }

  async function setSessionModel(
    nextModel: string,
    nextProvider = '',
    options: { confirmExpensiveModel?: boolean } = {}
  ) {
    const previousModel = sessionModel.value
    const previousProvider = sessionProvider.value
    applySessionSelection(nextModel, nextProvider)
    if (!sessionId.value) return true

    const value = sessionModelSetValue(sessionModel.value, sessionProvider.value)
    if (!value) {
      applySessionSelection(previousModel, previousProvider)
      return false
    }

    try {
      const result = await gateway.request<{
        confirm_message?: string
        confirm_required?: boolean
        warning?: string
      }>('config.set', {
        key: 'model',
        value,
        session_id: sessionId.value,
        ...(options.confirmExpensiveModel ? { confirm_expensive_model: true } : {})
      })
      if (result?.confirm_required) {
        applySessionSelection(previousModel, previousProvider)
        return {
          confirmRequired: true as const,
          confirmMessage: result.confirm_message || result.warning || '该模型费用较高，确认切换？'
        }
      }
      return true
    } catch (error) {
      if (isBusySessionModelSwitch(error)) return true
      applySessionSelection(previousModel, previousProvider)
      toast.add({
        title: '无法切换会话模型',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
      return false
    }
  }

  async function persistRuntimeOptions() {
    const value = activeReasoningEffort.value
    if (!sessionId.value || !value) return
    try {
      await gateway.request('config.set', {
        key: 'reasoning',
        value,
        session_id: sessionId.value
      })
    } catch {
      // older gateways may not accept this key
    }
  }

  async function setSessionReasoningEffort(value: ReasoningEffort) {
    const effort = asSessionReasoningEffort(value)
    if (!effort) return
    sessionReasoningEffort.value = effort
    sessionReasoningKnown.value = true
    if (!sessionId.value) {
      reasoningEffort.value = effort
      return
    }
    await persistRuntimeOptions()
  }

  function resetLocal() {
    historyLoad += 1
    sessionId.value = ''
    storedSessionId.value = ''
    clearSessionRuntime()
    revokeBlobImages(messages.value)
    messages.value = []
    approval.value = null
    clarify.value = null
    sudo.value = null
    pendingSteer.value = ''
    errorText.value = ''
    liveHint.value = ''
    providerWait.value = ''
    status.value = 'ready'
    assistantId.value = ''
    userStopped.value = false
    turnStopKind.value = ''
  }

  if (import.meta.client) bindEvents()

  return {
    activeModel,
    activeProvider,
    activeReasoningEffort,
    approval,
    attachImage,
    branchFromMessage,
    busy,
    clarify,
    clearPendingSteer,
    editMessage,
    errorText,
    hydrateReasoningFromConfig,
    isActiveId,
    liveHint,
    providerWait,
    loadSession,
    loadingHistory,
    messages: thread,
    pendingApproval,
    pendingClarify,
    pendingSteer,
    pendingSudo,
    persistRuntimeOptions,
    rebindAfterReconnect,
    resetLocal,
    lockClarify,
    resolveApproval,
    resolveClarify,
    resolveSudo,
    resumeIfActive,
    send,
    sessionId,
    sessionModel,
    sessionProvider,
    sessionReasoningEffort,
    setSessionModel,
    setSessionReasoningEffort,
    status,
    steer,
    stop,
    stopping,
    storedSessionId,
    sudo
  }
}
