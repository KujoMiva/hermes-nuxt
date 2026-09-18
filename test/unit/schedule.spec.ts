import { describe, expect, it } from 'vitest'
import { buildJobSchedule, parseJobSchedule } from '~/utils/schedule'

describe('parseJobSchedule', () => {
  it('parses interval, cron, and once expressions', () => {
    expect(parseJobSchedule('every 2h')).toMatchObject({
      kind: 'loop',
      intervalValue: 2,
      intervalUnit: 'h'
    })
    expect(parseJobSchedule('0 9 * * *')).toMatchObject({
      kind: 'cron',
      cron: '0 9 * * *'
    })
    expect(parseJobSchedule('2026-09-18T09:00')).toMatchObject({
      kind: 'once',
      onceAt: '2026-09-18T09:00'
    })
  })
})

describe('buildJobSchedule', () => {
  it('round-trips interval text', () => {
    const parsed = parseJobSchedule('every 15m')
    expect(buildJobSchedule(parsed)).toBe('every 15m')
  })
})
