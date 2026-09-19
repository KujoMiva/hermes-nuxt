import type { ChatThreadMessage } from '~/types/hermes'
import { durableUserCaption, gatewayImagePaths } from '~/utils/imageRefs'

type GatewayRequest = <T = unknown>(
  method: string,
  params?: Record<string, unknown>,
  timeoutMs?: number
) => Promise<T>

export function asRowId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const next = Number(value)
    if (Number.isInteger(next) && next > 0) return next
  }
  return undefined
}

export function visibleUserOrdinal(messages: ChatThreadMessage[], index: number) {
  let ordinal = 0
  for (let i = 0; i < index; i += 1) {
    if (messages[i]?.role === 'user') ordinal += 1
  }
  return ordinal
}

export function truncateSubmitParams(rowId?: number) {
  if (typeof rowId !== 'number' || !Number.isInteger(rowId)) return {}
  return {
    confirm_truncate: true,
    truncate_before_row_id: rowId,
    confirm_empty_truncate: true
  }
}

export function applySurvivorRowIdMap(messages: ChatThreadMessage[], raw?: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return messages
  const map = raw as Record<string, unknown>
  return messages.map((message) => {
    if (typeof message.rowId !== 'number') return message
    const next = map[String(message.rowId)]
    if (typeof next === 'number' && Number.isInteger(next) && next > 0) {
      return { ...message, rowId: next }
    }
    return message
  })
}

export function freezeInterruptedMessages(messages: ChatThreadMessage[]) {
  return messages.map((message) => {
    if (!message.streaming && !message.reasoningLive && message.stopKind !== 'stopping') return message
    return {
      ...message,
      streaming: false,
      reasoningLive: false,
      stopKind: message.stopKind && message.stopKind !== 'stopping' ? message.stopKind : 'interrupted'
    }
  })
}

export function isSessionBusyError(error: unknown) {
  return /session busy/i.test(error instanceof Error ? error.message : String(error))
}

export async function resolveDurableRowId(
  request: GatewayRequest,
  sessionId: string,
  sourceText: string,
  expectedOrdinal?: number
) {
  const wanted = sourceText.trim()
  if (!wanted || !sessionId) return undefined

  let rows: Array<Record<string, unknown>>
  try {
    const result = await request<{ messages?: unknown }>('session.history', { session_id: sessionId })
    rows = Array.isArray(result?.messages) ? result.messages as Array<Record<string, unknown>> : []
  } catch {
    return undefined
  }

  const durableUsers = rows.filter((message) => {
    if (message.role !== 'user' || message.display_kind) return false
    return typeof asRowId(message.row_id) === 'number'
  })

  const matches = durableUsers.filter((message) => {
    return durableUserCaption(String(message.text || message.content || '')) === wanted
  })
  if (matches.length === 1) return asRowId(matches[0]?.row_id)
  if (matches.length > 1 && typeof expectedOrdinal === 'number' && expectedOrdinal >= durableUsers.length - 1) {
    const last = matches.at(-1)
    return durableUsers.at(-1) === last ? asRowId(last?.row_id) : undefined
  }
  return undefined
}

export async function reattachSessionImages(
  request: GatewayRequest,
  sessionId: string,
  images?: string[]
) {
  const paths = gatewayImagePaths(images)
  if (!paths.length) return []

  const attached: string[] = []
  const errors: string[] = []
  for (const path of paths) {
    try {
      const result = await request<{ path?: string }>('image.attach', {
        session_id: sessionId,
        path
      })
      attached.push(typeof result?.path === 'string' && result.path ? result.path : path)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (!attached.length) {
    throw new Error(errors[0] || '无法重新附加图片')
  }
  return attached
}
