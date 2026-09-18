import { describe, expect, it } from 'vitest'
import {
  isBusySessionModelSwitch,
  nestedGet,
  sessionModelSetValue,
  sparsePatch,
  withActive
} from '~/utils/modelSettings'

describe('withActive', () => {
  it('prepends a missing active value', () => {
    expect(withActive(['a', 'b'], 'c')).toEqual(['c', 'a', 'b'])
    expect(withActive(['a', 'b'], 'a')).toEqual(['a', 'b'])
  })
})

describe('nestedGet / sparsePatch', () => {
  it('reads and writes dotted paths', () => {
    expect(nestedGet({ a: { b: 1 } }, 'a.b')).toBe(1)
    expect(sparsePatch('model.config.temp', 0.2)).toEqual({
      model: { config: { temp: 0.2 } }
    })
  })
})

describe('sessionModelSetValue', () => {
  it('encodes provider and session flags in the value string', () => {
    expect(sessionModelSetValue('claude-sonnet-4', 'anthropic')).toBe(
      'claude-sonnet-4 --provider anthropic --session'
    )
    expect(sessionModelSetValue('gpt-5.5')).toBe('gpt-5.5 --session')
    expect(sessionModelSetValue('  ')).toBe('')
  })
})

describe('isBusySessionModelSwitch', () => {
  it('matches the pre-deferral mid-turn refusal', () => {
    expect(isBusySessionModelSwitch(new Error('session busy; switching models later'))).toBe(true)
    expect(isBusySessionModelSwitch(new Error('session busy'))).toBe(false)
  })
})
