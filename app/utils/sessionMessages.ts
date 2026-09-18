import type { ChatThreadMessage, ChatToolEvent, HermesMessage } from '~/types/hermes'
import { asRowId } from './chatEdit'
import { extractImages, extractText } from './format'
import { extractImageRefs } from './imageRefs'
import { chatUid } from './chatRun'

type GatewayRequest = <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export async function fetchAllSessionMessages(request: GatewayRequest, sessionId: string) {
  const resumed = await request<{ session_id?: string, messages?: unknown[] }>('session.resume', {
    session_id: sessionId
  })
  const history = resumed.messages?.length
    ? resumed
    : await request<{ messages?: unknown[] }>('session.history', {
        session_id: resumed.session_id || sessionId
      })

  return (history.messages || []).map((item, index): HermesMessage => {
    const rec = asRecord(item)
    const role = rec.role === 'user' || rec.role === 'assistant' || rec.role === 'system' || rec.role === 'tool'
      ? rec.role
      : 'assistant'
    const rawId = rec.row_id ?? rec.id
    return {
      id: typeof rawId === 'string' || typeof rawId === 'number' ? rawId : index,
      role,
      content: rec.text || rec.content || rec.context || '',
      timestamp: rec.timestamp as string | number | undefined,
      tool_name: typeof rec.name === 'string' ? rec.name : undefined
    }
  })
}

export function mapSessionMessage(message: HermesMessage): ChatThreadMessage | null {
  if (message.role === 'tool') return null
  const role = message.role === 'system' ? 'system' : message.role
  if (role !== 'user' && role !== 'assistant' && role !== 'system') return null

  const createdAt = message.timestamp
    ? new Date(typeof message.timestamp === 'number'
        ? (message.timestamp > 1e12 ? message.timestamp : message.timestamp * 1000)
        : message.timestamp).getTime()
    : Date.now()

  const tools: ChatToolEvent[] = (message.tool_calls || []).map((call, index) => ({
    id: call.id || `${message.id || 'tool'}-${index}`,
    name: call.function?.name || call.name || 'tool',
    status: 'completed' as const,
    args: call.function?.arguments || call.arguments,
    startedAt: createdAt
  }))

  const rawContent = extractText(message.content)
  const imageRefs = role === 'user'
    ? extractImageRefs(rawContent)
    : { cleanedText: rawContent, refs: [] as string[] }

  const rowId = asRowId(message.id)
  return {
    id: String(message.id || chatUid()),
    role,
    rowId,
    content: imageRefs.cleanedText,
    images: [...new Set([...extractImages(message.content), ...imageRefs.refs])],
    reasoning: message.reasoning || message.reasoning_content || '',
    tools,
    createdAt
  }
}

function hasVisibleBody(message: ChatThreadMessage) {
  return Boolean(
    message.content?.trim()
    || message.streaming
    || message.images?.length
    || message.stopKind
  )
}

function thinkingEvent(message: ChatThreadMessage): ChatToolEvent | null {
  const preview = message.reasoning?.trim()
  if (!preview) return null
  return {
    id: `think_${message.id}`,
    name: 'thinking',
    kind: 'thinking',
    status: message.streaming ? 'running' : 'completed',
    preview,
    startedAt: message.createdAt
  }
}

function runEventsFrom(message: ChatThreadMessage) {
  const existing = message.tools || []
  const thinking = thinkingEvent(message)
  if (!thinking) return existing
  if (existing.some(item => item.kind === 'thinking')) return existing
  return [thinking, ...existing]
}

function sameStrings(left?: string[], right?: string[]) {
  if (left === right) return true
  if (!left?.length && !right?.length) return true
  if (!left || !right || left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function sameTool(left: ChatToolEvent, right: ChatToolEvent) {
  return left === right
    || (
      left.id === right.id
      && left.name === right.name
      && left.status === right.status
      && left.kind === right.kind
      && left.preview === right.preview
      && left.summary === right.summary
      && left.goal === right.goal
      && left.childSessionId === right.childSessionId
      && left.taskIndex === right.taskIndex
      && left.taskCount === right.taskCount
    )
}

function sameTools(left?: ChatToolEvent[], right?: ChatToolEvent[]) {
  if (left === right) return true
  if (!left?.length && !right?.length) return true
  if (!left || !right || left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (!a || !b || !sameTool(a, b)) return false
  }
  return true
}

function sameFoldedMessage(left: ChatThreadMessage, right: ChatThreadMessage) {
  return left.role === right.role
    && left.content === right.content
    && left.streaming === right.streaming
    && left.stopKind === right.stopKind
    && left.createdAt === right.createdAt
    && sameStrings(left.images, right.images)
    && sameTools(left.tools, right.tools)
}

export function reuseFoldedMessages(previous: ChatThreadMessage[], next: ChatThreadMessage[]) {
  if (!previous.length || previous === next) return next
  const prevById = new Map<string, ChatThreadMessage>()
  for (const row of previous) prevById.set(row.id, row)
  let changed = previous.length !== next.length
  const out = next.map((row, index) => {
    const prev = prevById.get(row.id)
    if (prev && sameFoldedMessage(prev, row)) {
      if (prev !== previous[index]) changed = true
      return prev
    }
    changed = true
    return row
  })
  return changed ? out : previous
}

export function chatBubbleMemo(message: ChatThreadMessage) {
  const tools = message.tools
  let toolKey = ''
  if (tools?.length) {
    for (const tool of tools) {
      toolKey += `${tool.id}\0${tool.status}\0${tool.kind || ''}\0${tool.preview || ''}\0${tool.summary || ''}\0${tool.goal || ''}\0${tool.endedAt || ''}\n`
    }
  }
  return [
    message.content,
    message.reasoning || '',
    message.reasoningLive ? 1 : 0,
    message.streaming ? 1 : 0,
    message.stopKind || '',
    message.images?.join('\0') || '',
    toolKey
  ]
}

export function foldTurnTools(messages: ChatThreadMessage[]) {
  const out: ChatThreadMessage[] = []
  let bucket: ChatThreadMessage[] = []

  function flushBucket() {
    const events: ChatToolEvent[] = []
    const kept: ChatThreadMessage[] = []

    for (const message of bucket) {
      if (message.role !== 'assistant') {
        kept.push(message)
        continue
      }
      events.push(...runEventsFrom(message))
      if (hasVisibleBody(message)) kept.push({ ...message, tools: [], reasoning: '' })
    }

    if (events.length) {
      let last = -1
      for (let index = kept.length - 1; index >= 0; index -= 1) {
        if (kept[index]?.role === 'assistant') {
          last = index
          break
        }
      }
      if (last >= 0) {
        const target = kept[last]
        if (target) kept[last] = { ...target, tools: events }
      } else {
        const first = events[0]
        if (first) {
          kept.push({
            id: `tools_${first.id}`,
            role: 'assistant',
            content: '',
            tools: events,
            createdAt: first.startedAt || Date.now()
          })
        }
      }
    }

    out.push(...kept)
    bucket = []
  }

  for (const message of messages) {
    if (message.role === 'user') {
      flushBucket()
      out.push(message)
      continue
    }
    bucket.push(message)
  }

  flushBucket()
  return out
}
