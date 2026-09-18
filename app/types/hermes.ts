export type ReasoningEffort = '' | 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra'

export interface ConnectionConfig {
  baseUrl: string
  apiKey: string
  profile: string
  systemPrompt: string
  model: string
  provider: string
  reasoningEffort: ReasoningEffort
}

export interface HermesSession {
  id: string
  source?: string
  user_id?: string
  model?: string
  title?: string
  started_at?: string | number
  ended_at?: string | number | null
  end_reason?: string | null
  message_count?: number
  tool_call_count?: number
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  cache_write_tokens?: number
  reasoning_tokens?: number
  api_call_count?: number
  estimated_cost_usd?: number
  actual_cost_usd?: number
  parent_session_id?: string | null
  last_active?: string | number
  preview?: string
  pinned?: boolean
  archived?: boolean
  hidden?: boolean
}

export interface HermesToolCall {
  id?: string
  type?: string
  function?: {
    name?: string
    arguments?: string
  }
  name?: string
  arguments?: unknown
}

export interface HermesMessage {
  id?: string | number
  session_id?: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content?: unknown
  tool_call_id?: string
  tool_calls?: HermesToolCall[]
  tool_name?: string
  timestamp?: string | number
  token_count?: number
  finish_reason?: string
  reasoning?: string
  reasoning_content?: string
}

export interface ChatToolEvent {
  id: string
  name: string
  status: 'running' | 'completed' | 'failed'
  kind?: 'tool' | 'thinking' | 'subagent'
  preview?: string
  args?: unknown
  result?: unknown
  resultText?: string
  inlineDiff?: string
  goal?: string
  summary?: string
  childSessionId?: string
  taskIndex?: number
  taskCount?: number
  startedAt?: number
  endedAt?: number
}

export interface ChatApproval {
  request_id?: string
  command?: string
  tool_name?: string
  choices?: string[]
  smart_denied?: boolean
  [key: string]: unknown
}

export type ChatStopKind = 'stopping' | 'user_stop' | 'cancelled' | 'interrupted' | 'disconnected'

export interface ChatThreadMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  /** Durable transcript row id from the gateway; used for rewind/edit. */
  rowId?: number
  content: string
  images?: string[]
  reasoning?: string
  reasoningLive?: boolean
  reasoningStartedAt?: number
  reasoningEndedAt?: number
  tools?: ChatToolEvent[]
  streaming?: boolean
  stopKind?: ChatStopKind
  createdAt: number
}

export interface HermesJobSchedule {
  kind?: string
  expr?: string
  run_at?: string
  minutes?: number
  display?: string
}

export interface HermesJob {
  id: string
  name?: string
  prompt?: string
  schedule?: string | HermesJobSchedule
  schedule_display?: string
  deliver?: string
  skill?: string | null
  skills?: string[]
  enabled?: boolean
  paused?: boolean
  state?: string
  profile?: string | null
  profile_name?: string | null
  next_run_at?: string | number | null
  last_run_at?: string | number | null
  last_status?: string | null
  last_error?: string | null
  last_output?: string | null
  latest_execution?: {
    id?: string
    status?: string
    claimed_at?: string
    finished_at?: string
    error?: string | null
  } | null
  repeat?: number | null | { times?: number | null, completed?: number }
  _profile?: string
  _profileName?: string
  [key: string]: unknown
}

export interface HermesSkill {
  name: string
  description?: string
  category?: string
  enabled?: boolean
  [key: string]: unknown
}

export interface HermesToolset {
  name: string
  label?: string
  description?: string
  enabled?: boolean
  configured?: boolean
  tools?: string[]
  [key: string]: unknown
}

export interface HermesModel {
  id: string
  object?: string
  owned_by?: string
  root?: string
}

export interface ModelOption {
  id: string
  name?: string
  provider?: string
  description?: string
  context?: number
  pricing?: unknown
}

export interface ModelCapabilities {
  fast?: boolean
  reasoning?: boolean
  can_disable_reasoning?: boolean | null
}

export interface ModelProvider {
  id: string
  name?: string
  authenticated?: boolean
  isUserDefined?: boolean
  isCurrent?: boolean
  authType?: string
  keyEnv?: string
  apiUrl?: string
  warning?: string
  aliases?: string[]
  models?: ModelOption[]
  capabilities?: Record<string, ModelCapabilities>
}

export interface ModelAssignmentRequest {
  scope: 'main' | 'auxiliary'
  provider: string
  model: string
  task?: string
  reasoning_effort?: string | null
  base_url?: string
  api_key?: string
  confirm_expensive_model?: boolean
  profile?: string
}

export interface StaleAuxAssignment {
  task: string
  provider: string
  model?: string
}

export interface ModelAssignmentResponse {
  ok: boolean
  scope?: string
  provider?: string
  model?: string
  confirm_required?: boolean
  confirm_message?: string
  stale_aux?: StaleAuxAssignment[]
  reset?: boolean
}

export interface AuxiliaryTaskAssignment {
  task: string
  provider: string
  model: string
  base_url?: string
  reasoning_effort?: string | null
  local_endpoint?: boolean
}

export interface AuxiliaryModelsResponse {
  tasks: AuxiliaryTaskAssignment[]
  main: { provider: string, model: string }
}

export interface CustomEndpoint {
  id: string
  name: string
  base_url: string
  model: string
  models?: string[]
  context_length?: number | null
  discover_models?: boolean
  has_api_key?: boolean
  api_key_preview?: string | null
  is_current?: boolean
  source?: string
}

export interface CustomEndpointsResponse {
  endpoints: CustomEndpoint[]
  current?: { provider: string, model: string, base_url: string }
  ok?: boolean
  id?: string
}

export interface CustomEndpointUpdate {
  id?: string
  name: string
  base_url: string
  model: string
  api_key?: string
  context_length?: number
  discover_models?: boolean
  make_default?: boolean
  models?: string[]
}

export interface Capabilities {
  object?: string
  platform?: string
  model?: string
  features?: Record<string, unknown>
  endpoints?: Record<string, { method?: string, path?: string }>
  runtime?: Record<string, unknown>
  auth?: Record<string, unknown>
}

export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'
