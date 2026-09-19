export type JsonRpcId = string | number

export type JsonRpcFrame = {
  error?: { code?: number, message?: string }
  id?: JsonRpcId | null
  method?: string
  params?: unknown
  result?: unknown
}

export type JsonRpcKind = 'invalid' | 'notification' | 'request' | 'response'

export const JSON_RPC_METHOD_NOT_FOUND = -32601

export function jsonRpcKind(frame: JsonRpcFrame): JsonRpcKind {
  const hasId = frame.id !== undefined && frame.id !== null
  const hasMethod = typeof frame.method === 'string' && frame.method.length > 0
  if (hasMethod && hasId) return 'request'
  if (hasMethod) return 'notification'
  if (hasId) return 'response'
  return 'invalid'
}

export function asJsonRpcParams(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}
