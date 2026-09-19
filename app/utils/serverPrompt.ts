import type { ChatApproval, ChatClarify, ChatClarifyQuestion, ChatSudo } from '~/types/hermes'
import type { JsonRpcId } from './jsonRpc'
import { asJsonRpcParams } from './jsonRpc'

export const RECOMMENDED_LABEL = '(Recommended)'

export type GatewayOpenRequest = {
  id?: JsonRpcId
  method?: string
  params?: Record<string, unknown>
}

export function bareChoice(choice: string) {
  const trimmed = choice.trim()
  if (trimmed.toLowerCase().endsWith(RECOMMENDED_LABEL.toLowerCase())) {
    return trimmed.slice(0, -RECOMMENDED_LABEL.length).trim()
  }
  return trimmed
}

export function isRecommendedChoice(choice: string) {
  return bareChoice(choice) !== choice.trim()
}

export function normalizeChoices(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => (
    typeof item === 'string'
    && item.trim().length > 0
    && bareChoice(item).length <= 200
    && !item.includes('\n')
  ))
}

function stringField(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function asId(value: unknown): JsonRpcId | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

export function normalizeQuestions(value: unknown): ChatClarifyQuestion[] {
  if (!Array.isArray(value)) return []
  const questions: ChatClarifyQuestion[] = []
  value.forEach((entry, index) => {
    if (typeof entry === 'string' && entry.trim()) {
      questions.push({
        qid: `q${index}`,
        question: entry.trim(),
        choices: null,
        multiSelect: false
      })
      return
    }
    const row = asJsonRpcParams(entry)
    const question = stringField(row, 'question')
    if (!question) return
    const choices = normalizeChoices(row.choices)
    questions.push({
      qid: stringField(row, 'qid', 'id') || `q${index}`,
      question,
      choices: choices.length ? choices : null,
      multiSelect: row.multi_select === true && choices.length > 0
    })
  })
  return questions
}

function lockedAnswers(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const next: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') next[key] = item
  }
  return Object.keys(next).length ? next : undefined
}

export function choiceLetter(index: number) {
  return String.fromCharCode(65 + index)
}

export type ClarifyStage = {
  choices: string[]
  draft: string
}

export type ClarifyBatchResponse = {
  answer: string
  id: string
  question: string
}

function parseResultPayload(result: unknown): unknown {
  if (typeof result !== 'string') return result
  const trimmed = result.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return result
  try {
    return JSON.parse(trimmed)
  } catch {
    return result
  }
}

export function clarifyStagedAnswer(
  question: Pick<ChatClarifyQuestion, 'multiSelect'>,
  stage: ClarifyStage
) {
  if (stage.choices.length) {
    const bare = stage.choices.map(bareChoice)
    return question.multiSelect ? JSON.stringify(bare) : (bare[0] || null)
  }
  const draft = stage.draft.trim()
  return draft || null
}

export function replayLockedStage(question: ChatClarifyQuestion, answer: string): ClarifyStage {
  const options = question.choices ?? []
  let replayed = [answer]
  if (question.multiSelect) {
    try {
      const parsed = JSON.parse(answer)
      if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) replayed = parsed
    } catch {
      // keep the scalar replay
    }
  }
  const matched = options.filter(choice => replayed.includes(bareChoice(choice)))
  return matched.length ? { choices: matched, draft: '' } : { choices: [], draft: answer }
}

export function readClarifyResult(result: unknown) {
  const payload = parseResultPayload(result)
  const row = asJsonRpcParams(payload)
  if (!Object.keys(row).length) {
    return typeof payload === 'string' && payload.trim() ? { answer: payload.trim() } : {}
  }
  return {
    question: stringField(row, 'question'),
    answer: stringField(row, 'user_response', 'answer'),
    error: stringField(row, 'error')
  }
}

export function readClarifyBatchResult(result: unknown) {
  const row = asJsonRpcParams(parseResultPayload(result))
  if (!Array.isArray(row.responses)) return { responses: [] as ClarifyBatchResponse[], timedOut: false }
  return {
    timedOut: row.timed_out === true,
    responses: row.responses.map((entry) => {
      const item = asJsonRpcParams(entry)
      const raw = item.user_response ?? item.answer
      return {
        id: stringField(item, 'id', 'qid'),
        question: stringField(item, 'question'),
        answer: Array.isArray(raw) ? raw.map(String).join(', ') : typeof raw === 'string' ? raw : ''
      }
    })
  }
}

export function parseClarifyRequest(id: JsonRpcId, params: unknown): ChatClarify | null {
  const row = asJsonRpcParams(params)
  const questions = normalizeQuestions(row.questions)
  const choices = normalizeChoices(row.choices)
  const question = stringField(row, 'question')
  if (!questions.length && !question) return null
  return {
    requestId: id,
    question,
    choices: choices.length ? choices : null,
    multiSelect: row.multi_select === true && choices.length > 0,
    questions: questions.length ? questions : undefined,
    lockedAnswers: lockedAnswers(row.answers)
  }
}

export function parseSudoRequest(id: JsonRpcId, params: unknown): ChatSudo {
  const row = asJsonRpcParams(params)
  return {
    requestId: id,
    command: stringField(row, 'command')
  }
}

export function parseApprovalRequest(id: JsonRpcId, params: unknown): ChatApproval {
  const row = asJsonRpcParams(params)
  const choices = normalizeChoices(row.choices)
  return {
    request_id: stringField(row, 'request_id') || undefined,
    server_request_id: id,
    command: stringField(row, 'command'),
    tool_name: stringField(row, 'tool_name', 'description'),
    choices: choices.length ? choices : undefined,
    smart_denied: row.smart_denied === true
  }
}

export function applyOpenPrompt(
  entry: GatewayOpenRequest,
  handlers: {
    approval: (value: ChatApproval) => void
    clarify: (value: ChatClarify) => void
    sudo: (value: ChatSudo) => void
  }
) {
  const id = asId(entry.id)
  if (!id || !entry.method) return false
  if (entry.method === 'clarify') {
    const parsed = parseClarifyRequest(id, entry.params)
    if (!parsed) return false
    handlers.clarify(parsed)
    return true
  }
  if (entry.method === 'sudo') {
    handlers.sudo(parseSudoRequest(id, entry.params))
    return true
  }
  if (entry.method === 'approval') {
    handlers.approval(parseApprovalRequest(id, entry.params))
    return true
  }
  return false
}
