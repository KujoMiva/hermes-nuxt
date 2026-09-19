import { describe, expect, it } from 'vitest'
import { jsonRpcKind } from '~/utils/jsonRpc'

describe('jsonRpcKind', () => {
  it('treats method+id as a server request, not a client response', () => {
    expect(jsonRpcKind({ id: 'srq-1', method: 'clarify', params: { question: 'Which?' } })).toBe('request')
    expect(jsonRpcKind({ id: 'srq-2', method: 'sudo', params: { command: 'apt update' } })).toBe('request')
  })

  it('treats id+result as a client response', () => {
    expect(jsonRpcKind({ id: 'w1', result: { ok: true } })).toBe('response')
    expect(jsonRpcKind({ id: 'w2', error: { code: -1, message: 'nope' } })).toBe('response')
  })

  it('treats method-only event frames as notifications', () => {
    expect(jsonRpcKind({ method: 'event', params: { type: 'approval.request' } })).toBe('notification')
  })
})
