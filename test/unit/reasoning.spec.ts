import { describe, expect, it } from 'vitest'
import { asSessionReasoningEffort, REASONING_EFFORTS, reasoningEffortTitle } from '~/utils/reasoning'

describe('asSessionReasoningEffort', () => {
  it('keeps named efforts and maps disabled aliases to none', () => {
    expect(asSessionReasoningEffort('high')).toBe('high')
    expect(asSessionReasoningEffort('NONE')).toBe('none')
    expect(asSessionReasoningEffort('off')).toBe('none')
    expect(asSessionReasoningEffort('false')).toBe('none')
    expect(asSessionReasoningEffort('')).toBe('')
    expect(asSessionReasoningEffort('mystery')).toBe('')
  })
})

describe('REASONING_EFFORTS', () => {
  it('lists concrete efforts only', () => {
    expect(REASONING_EFFORTS.every(item => item.id.length > 0)).toBe(true)
    expect(reasoningEffortTitle('none')).toBe('Off (no thinking)')
    expect(reasoningEffortTitle('')).toBe('')
  })
})
