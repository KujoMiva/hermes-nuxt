import { describe, expect, it } from 'vitest'
import { asSessionReasoningEffort, reasoningEffortTitle } from '~/utils/reasoning'

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

describe('reasoningEffortTitle', () => {
  it('labels known efforts', () => {
    expect(reasoningEffortTitle('none')).toBe('Off (no thinking)')
    expect(reasoningEffortTitle('')).toBe('Default')
  })
})
