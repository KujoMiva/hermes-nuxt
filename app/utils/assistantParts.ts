import type {
  ChatMessagePart,
  ChatReasoningPart,
  ChatTextPart,
  ChatThreadMessage,
  ChatToolEvent
} from '~/types/hermes'
import { appendReasoning, isReplyEcho, mergeReasoningAvailable } from './thinking'

export function joinAssistantText(left: string, right: string) {
  const a = left.trim()
  const b = right.trim()
  if (!b) return left
  if (!a) return right
  const na = a.replace(/\s+/g, ' ')
  const nb = b.replace(/\s+/g, ' ')
  if (nb === na || nb.startsWith(na)) return right
  if (na.startsWith(nb)) return left
  return `${left.replace(/\s+$/, '')}\n\n${right.replace(/^\s+/, '')}`
}

export function remainderAfterPrefix(earlier: string, later: string) {
  const joined = joinAssistantText(earlier, later)
  if (joined === earlier) return ''
  if (joined !== later) return later
  const a = earlier.trim()
  const b = later.trim()
  if (!a || b === a) return ''
  if (!b.startsWith(a)) return later
  return later.trim().slice(a.length).replace(/^\s+/, '')
}

function normalizeWs(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function deriveParts(message: ChatThreadMessage): ChatMessagePart[] {
  const parts: ChatMessagePart[] = []
  if (message.reasoning?.trim() || message.reasoningLive) {
    parts.push({
      type: 'reasoning',
      text: message.reasoning || '',
      live: message.reasoningLive,
      startedAt: message.reasoningStartedAt,
      endedAt: message.reasoningEndedAt
    })
  }
  if (message.content?.trim()) {
    parts.push({ type: 'text', text: message.content })
  }
  for (const tool of message.tools || []) {
    if (tool.kind === 'thinking') continue
    parts.push({ type: 'tool', tool })
  }
  return parts
}

export function messageParts(message: ChatThreadMessage): ChatMessagePart[] {
  return message.parts ? message.parts : deriveParts(message)
}

export function assistantTextFromParts(parts: ChatMessagePart[]) {
  return parts
    .filter((part): part is ChatTextPart => part.type === 'text')
    .map(part => part.text)
    .filter(text => text.trim())
    .join('\n\n')
}

export function withParts(base: ChatThreadMessage, parts: ChatMessagePart[]): ChatThreadMessage {
  const reasonings = parts.filter((part): part is ChatReasoningPart => part.type === 'reasoning')
  const lastReasoning = reasonings.at(-1)
  return {
    ...base,
    parts,
    content: assistantTextFromParts(parts),
    reasoning: reasonings.map(part => part.text).filter(text => text.trim()).join('\n\n'),
    reasoningLive: Boolean(lastReasoning?.live),
    reasoningStartedAt: reasonings.find(part => part.startedAt != null)?.startedAt ?? lastReasoning?.startedAt,
    reasoningEndedAt: lastReasoning?.endedAt,
    tools: parts.filter((part): part is Extract<ChatMessagePart, { type: 'tool' }> => part.type === 'tool')
      .map(part => part.tool)
  }
}

function isOpenStreamPart(part: ChatMessagePart): part is ChatReasoningPart | ChatTextPart {
  return (part.type === 'reasoning' || part.type === 'text') && part.live === true
}

export function sealOpenParts(parts: ChatMessagePart[], at = Date.now()): ChatMessagePart[] {
  return parts.map((part) => {
    if (!isOpenStreamPart(part)) return part
    if (part.type === 'reasoning') {
      return { ...part, live: false, endedAt: part.endedAt || at }
    }
    return { ...part, live: false }
  })
}

export function markLastStreamPartLive(parts: ChatMessagePart[]): ChatMessagePart[] {
  const index = parts.findLastIndex(part => part.type === 'reasoning' || part.type === 'text')
  if (index < 0) return parts
  return parts.map((part, at) => {
    if (at !== index) return part
    if (part.type === 'reasoning' || part.type === 'text') return { ...part, live: true }
    return part
  })
}

export function appendStreamPart(
  parts: ChatMessagePart[],
  type: 'reasoning' | 'text',
  delta: string,
  at = Date.now()
): ChatMessagePart[] {
  const next = [...parts]
  const tail = next.at(-1)
  if (tail?.type === type && isOpenStreamPart(tail)) {
    next[next.length - 1] = tail.type === 'reasoning'
      ? { ...tail, text: appendReasoning(tail.text, delta), live: true, startedAt: tail.startedAt || at }
      : { ...tail, text: `${tail.text}${delta}`, live: true }
    return next
  }
  if (tail && isOpenStreamPart(tail)) {
    next[next.length - 1] = tail.type === 'reasoning'
      ? { ...tail, live: false, endedAt: tail.endedAt || at }
      : { ...tail, live: false }
  }
  if (type === 'reasoning') {
    next.push({ type, text: delta, live: true, startedAt: at })
  } else {
    next.push({ type, text: delta, live: true })
  }
  return next
}

export function appendToolPart(parts: ChatMessagePart[], tool: ChatToolEvent, at = Date.now()): ChatMessagePart[] {
  const next = sealOpenParts(parts, at)
  next.push({ type: 'tool', tool })
  return next
}

export function patchToolPart(
  parts: ChatMessagePart[],
  match: (tool: ChatToolEvent) => boolean,
  update: (tool: ChatToolEvent) => ChatToolEvent
): ChatMessagePart[] {
  let matched = false
  return parts.map((part) => {
    if (part.type !== 'tool' || matched || !match(part.tool)) return part
    matched = true
    return { type: 'tool', tool: update(part.tool) }
  })
}

export function appendToolsToParts(parts: ChatMessagePart[], extra: ChatToolEvent[]): ChatMessagePart[] {
  if (!extra.length) return parts
  const next = [...parts]
  for (const tool of extra) {
    const index = next.findIndex(part => part.type === 'tool' && part.tool.id === tool.id)
    if (index >= 0) {
      const prev = next[index]
      if (prev?.type === 'tool') next[index] = { type: 'tool', tool: { ...prev.tool, ...tool } }
      continue
    }
    next.push({ type: 'tool', tool })
  }
  return next
}

export function withAppendedTools(message: ChatThreadMessage, extra: ChatToolEvent[]): ChatThreadMessage {
  if (!extra.length) return message
  return withParts(message, appendToolsToParts(messageParts(message), extra))
}

export function dedupeRepeatedTextInParts(parts: ChatMessagePart[]): ChatMessagePart[] {
  const lastByText = new Map<string, number>()
  parts.forEach((part, index) => {
    if (part.type !== 'text') return
    const key = normalizeWs(part.text)
    if (key) lastByText.set(key, index)
  })
  const kept = parts.filter((part, index) => {
    if (part.type !== 'text') return true
    const key = normalizeWs(part.text)
    return !key || lastByText.get(key) === index
  })
  return kept.length === parts.length ? parts : kept
}

export function mergePartLists(left: ChatMessagePart[], right: ChatMessagePart[]): ChatMessagePart[] {
  const out: ChatMessagePart[] = [...left]
  for (const part of right) {
    if (part.type === 'tool') {
      const index = out.findIndex(item => item.type === 'tool' && item.tool.id === part.tool.id)
      if (index >= 0) {
        const prev = out[index]
        if (prev?.type === 'tool') out[index] = { type: 'tool', tool: { ...prev.tool, ...part.tool } }
        continue
      }
      out.push(part)
      continue
    }
    if (part.type === 'text') {
      if (!part.text.trim() && !part.live) continue
      const lastText = [...out].reverse().find((item): item is ChatTextPart => item.type === 'text')
      if (lastText) {
        const remainder = remainderAfterPrefix(lastText.text, part.text)
        if (!remainder) continue
        out.push({ ...part, text: remainder })
        continue
      }
      out.push(part)
      continue
    }
    if (!part.text.trim() && !part.live) continue
    out.push(part)
  }
  return dedupeRepeatedTextInParts(out)
}

export function applyCompleteText(parts: ChatMessagePart[], finalizedContent: string): ChatMessagePart[] {
  const sealed = sealOpenParts(parts)
  const content = finalizedContent.trim()
  if (!content) return sealed

  const streamed = assistantTextFromParts(sealed)
  if (streamed && normalizeWs(streamed) === normalizeWs(content)) return sealed

  const lastIndex = sealed.findLastIndex(part => part.type === 'text')
  if (lastIndex < 0) return [...sealed, { type: 'text', text: content }]

  let remainder = content
  for (const [index, part] of sealed.entries()) {
    if (part.type !== 'text' || index === lastIndex) continue
    remainder = remainderAfterPrefix(part.text, remainder)
    if (!remainder) break
  }

  const last = sealed[lastIndex]
  if (last?.type !== 'text') return sealed
  let lastText = joinAssistantText(last.text, remainder || content)
  for (const [index, part] of sealed.entries()) {
    if (part.type !== 'text' || index === lastIndex) continue
    lastText = remainderAfterPrefix(part.text, lastText) || lastText
  }

  const next = [...sealed]
  next[lastIndex] = { ...last, text: lastText, live: false }
  return next
}

export function applyCompleteReasoning(parts: ChatMessagePart[], finalizedReasoning: string): ChatMessagePart[] {
  const incoming = finalizedReasoning.trim()
  if (!incoming) return parts
  const reply = assistantTextFromParts(parts)
  if (reply && isReplyEcho(incoming, reply)) return parts
  const index = parts.findLastIndex(part => part.type === 'reasoning')
  if (index < 0) return parts
  const current = parts[index]
  if (current?.type !== 'reasoning') return parts
  const merged = mergeReasoningAvailable(current.text, incoming)
  if (merged === current.text) return parts
  if (reply && isReplyEcho(merged, reply)) return parts
  const next = [...parts]
  next[index] = { ...current, text: merged, live: false, endedAt: current.endedAt || Date.now() }
  return next
}

export function sliceAfterLastTool(parts: ChatMessagePart[]) {
  const lastTool = parts.findLastIndex(part => part.type === 'tool')
  return lastTool >= 0 ? parts.slice(lastTool + 1) : parts
}

export type AssistantShelfSegment
  = | { key: string, type: 'reasoning', part: ChatReasoningPart }
    | { key: string, type: 'tools', tools: ChatToolEvent[] }

export type AssistantTimelineBlock
  = | { key: string, type: 'reasoning', part: ChatReasoningPart }
    | { key: string, type: 'text', part: ChatTextPart }
    | { key: string, type: 'tools', tools: ChatToolEvent[] }
    | { key: string, type: 'shelf', tools: ChatToolEvent[], segments: AssistantShelfSegment[] }

function combineReasoning(parts: ChatReasoningPart[]): ChatReasoningPart | null {
  if (!parts.length) return null
  const last = parts[parts.length - 1]!
  return {
    type: 'reasoning',
    text: parts.map(part => part.text).filter(text => text.trim()).join('\n\n'),
    live: Boolean(last.live),
    startedAt: parts.find(part => part.startedAt != null)?.startedAt ?? last.startedAt,
    endedAt: last.endedAt
  }
}

function shelfSegments(parts: ChatMessagePart[]): AssistantShelfSegment[] {
  const segments: AssistantShelfSegment[] = []
  parts.forEach((part, index) => {
    if (part.type === 'reasoning') {
      if (!part.text.trim() && !part.live) return
      segments.push({ key: `shelf-r-${index}`, type: 'reasoning', part })
      return
    }
    if (part.type !== 'tool' || part.tool.kind === 'thinking') return
    const last = segments.at(-1)
    if (last?.type === 'tools') {
      last.tools.push(part.tool)
      return
    }
    segments.push({ key: `shelf-k-${index}`, type: 'tools', tools: [part.tool] })
  })
  return segments
}

/** First thought, then narration, then one fold with interleaved thinking + tools, then the reply. */
export function assistantBlocks(message: ChatThreadMessage): AssistantTimelineBlock[] {
  const parts = messageParts(message)
  let index = 0

  const leading: ChatReasoningPart[] = []
  while (index < parts.length && parts[index]?.type === 'reasoning') {
    const part = parts[index]
    if (part?.type === 'reasoning' && (part.text.trim() || part.live)) leading.push(part)
    index += 1
  }

  const narration: ChatTextPart[] = []
  while (index < parts.length && parts[index]?.type === 'text') {
    const part = parts[index]
    if (part?.type === 'text' && (part.text.trim() || part.live)) narration.push(part)
    index += 1
  }

  const shelfParts: ChatMessagePart[] = []
  while (index < parts.length && parts[index]?.type !== 'text') {
    const part = parts[index]
    if (part) shelfParts.push(part)
    index += 1
  }

  const reply: ChatTextPart[] = []
  while (index < parts.length) {
    const part = parts[index]
    if (part?.type === 'text' && (part.text.trim() || part.live)) reply.push(part)
    index += 1
  }

  const blocks: AssistantTimelineBlock[] = []
  const firstThought = combineReasoning(leading)
  if (firstThought) blocks.push({ key: 'thinking-lead', type: 'reasoning', part: firstThought })

  narration.forEach((part, at) => {
    blocks.push({ key: `text-before-${at}`, type: 'text', part })
  })

  const segments = shelfSegments(shelfParts)
  const tools = segments.flatMap(segment => segment.type === 'tools' ? segment.tools : [])
  if (tools.length) {
    blocks.push({ key: 'shelf', type: 'shelf', tools, segments })
  } else {
    for (const segment of segments) {
      if (segment.type === 'reasoning') blocks.push(segment)
    }
  }

  reply.forEach((part, at) => {
    blocks.push({ key: `text-after-${at}`, type: 'text', part })
  })
  return blocks
}

export function partsKey(parts?: ChatMessagePart[]) {
  if (!parts?.length) return ''
  return parts.map((part) => {
    if (part.type === 'text') return `t:${part.live ? 1 : 0}:${part.text}`
    if (part.type === 'reasoning') return `r:${part.live ? 1 : 0}:${part.text}`
    return `k:${part.tool.id}:${part.tool.status}:${part.tool.preview || ''}:${part.tool.summary || ''}`
  }).join('\n')
}
