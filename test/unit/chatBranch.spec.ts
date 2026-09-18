import { describe, expect, it } from 'vitest'
import type { ChatThreadMessage } from '~/types/hermes'
import { branchCountThrough, isVisibleBranchTurn } from '~/utils/chatBranch'

function message(
  partial: Partial<ChatThreadMessage> & Pick<ChatThreadMessage, 'id' | 'role'>
): ChatThreadMessage {
  return {
    content: '',
    createdAt: 1,
    ...partial
  }
}

describe('isVisibleBranchTurn', () => {
  it('requires a user or assistant with text', () => {
    expect(isVisibleBranchTurn(message({ id: 'u1', role: 'user', content: 'hi' }))).toBe(true)
    expect(isVisibleBranchTurn(message({ id: 'a1', role: 'assistant', content: '  ' }))).toBe(false)
    expect(isVisibleBranchTurn(message({ id: 's1', role: 'system', content: 'note' }))).toBe(false)
  })
})

describe('branchCountThrough', () => {
  it('counts visible turns through the target message', () => {
    const rows = [
      message({ id: 'u1', role: 'user', content: 'one' }),
      message({ id: 'a1', role: 'assistant', tools: [] }),
      message({ id: 'a2', role: 'assistant', content: 'two' }),
      message({ id: 'u2', role: 'user', content: 'three' })
    ]
    expect(branchCountThrough(rows, 'missing')).toBe(0)
    expect(branchCountThrough(rows, 'a2')).toBe(2)
    expect(branchCountThrough(rows, 'u2')).toBe(3)
  })
})
