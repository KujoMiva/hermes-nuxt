import { describe, expect, it } from 'vitest'
import { nestedGet, sparsePatch, withActive } from '~/utils/modelSettings'

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
