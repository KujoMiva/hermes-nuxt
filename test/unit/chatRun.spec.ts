import { describe, expect, it } from 'vitest'
import { chatUid, sleep, stopKindLabel } from '~/utils/chatRun'

describe('chatUid', () => {
  it('prefixes ids and produces distinct values', () => {
    expect(chatUid('run')).toMatch(/^run_/)
    expect(chatUid()).not.toBe(chatUid())
  })
})

describe('stopKindLabel', () => {
  it('maps known stop kinds', () => {
    expect(stopKindLabel('stopping')).toBe('正在停止')
    expect(stopKindLabel('user_stop')).toBe('已停止')
    expect(stopKindLabel('cancelled')).toBe('已取消')
    expect(stopKindLabel('interrupted')).toBe('已中断')
    expect(stopKindLabel('disconnected')).toBe('连接已断开')
    expect(stopKindLabel('')).toBe('')
    expect(stopKindLabel()).toBe('')
  })
})

describe('sleep', () => {
  it('rejects when the signal is already aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(sleep(50, ac.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects when aborted while waiting', async () => {
    const ac = new AbortController()
    const pending = sleep(1_000, ac.signal)
    ac.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
