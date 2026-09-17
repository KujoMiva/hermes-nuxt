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
  content: string
  images?: string[]
  reasoning?: string
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

export interface ModelProvider {
  id: string
  name?: string
  authenticated?: boolean
  isUserDefined?: boolean
  models?: ModelOption[]
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
