import { describe, expect, it } from 'vitest'
import type { ChatThreadMessage } from '~/types/hermes'
import {
  applySurvivorRowIdMap,
  asRowId,
  freezeInterruptedMessages,
  isSessionBusyError,
  reattachSessionImages,
  resolveDurableRowId,
  truncateSubmitParams,
  visibleUserOrdinal
} from '~/utils/chatEdit'

function message(
  partial: Partial<ChatThreadMessage> & Pick<ChatThreadMessage, 'id' | 'role'>
): ChatThreadMessage {
  return {
    content: '',
    createdAt: 1,
    ...partial
  }
}

describe('asRowId', () => {
  it('accepts positive integers only', () => {
    expect(asRowId(3)).toBe(3)
    expect(asRowId('12')).toBe(12)
    expect(asRowId(0)).toBeUndefined()
    expect(asRowId('x')).toBeUndefined()
  })
})

describe('visibleUserOrdinal', () => {
  it('counts user turns before the index', () => {
    const rows = [
      message({ id: 'u1', role: 'user' }),
      message({ id: 'a1', role: 'assistant' }),
      message({ id: 'u2', role: 'user' })
    ]
    expect(visibleUserOrdinal(rows, 0)).toBe(0)
    expect(visibleUserOrdinal(rows, 2)).toBe(1)
  })
})

describe('truncateSubmitParams', () => {
  it('only emits truncate flags for a durable row id', () => {
    expect(truncateSubmitParams(undefined)).toEqual({})
    expect(truncateSubmitParams(8)).toEqual({
      confirm_truncate: true,
      truncate_before_row_id: 8,
      confirm_empty_truncate: true
    })
  })
})

describe('applySurvivorRowIdMap', () => {
  it('rewrites matching row ids', () => {
    const rows = [
      message({ id: 'u1', role: 'user', rowId: 1 }),
      message({ id: 'a1', role: 'assistant', rowId: 2 })
    ]
    expect(applySurvivorRowIdMap(rows, { 1: 10, 2: 11 }).map(item => item.rowId)).toEqual([10, 11])
  })
})

describe('freezeInterruptedMessages', () => {
  it('clears live flags and marks stopping as interrupted', () => {
    const rows = freezeInterruptedMessages([
      message({ id: 'a1', role: 'assistant', streaming: true, stopKind: 'stopping' }),
      message({ id: 'a2', role: 'assistant', content: 'done' })
    ])
    expect(rows[0]).toMatchObject({ streaming: false, stopKind: 'interrupted' })
    expect(rows[1]?.stopKind).toBeUndefined()
  })
})

describe('isSessionBusyError', () => {
  it('detects gateway busy text', () => {
    expect(isSessionBusyError(new Error('Session busy'))).toBe(true)
    expect(isSessionBusyError('nope')).toBe(false)
  })
})

describe('resolveDurableRowId', () => {
  it('matches a cleaned caption against persisted @image lines', async () => {
    const path = String.raw`C:\Users\me\hermes\images\upload_1.jpg`
    const request = async <T = unknown>(_method: string, _params?: Record<string, unknown>) => ({
      messages: [
        { role: 'user', row_id: 12, text: `测试一下识图\n@image:\`${path}\`` }
      ]
    }) as T
    expect(await resolveDurableRowId(request, 's1', '测试一下识图')).toBe(12)
  })
})

describe('reattachSessionImages', () => {
  it('re-queues gateway paths with image.attach', async () => {
    const path = String.raw`C:\Users\me\hermes\images\upload_1.jpg`
    const calls: Array<{ method: string, params?: Record<string, unknown> }> = []
    const request = async <T = unknown>(method: string, params?: Record<string, unknown>) => {
      calls.push({ method, params })
      return { path } as T
    }
    await expect(reattachSessionImages(request, 's1', [path, 'blob:https://app/1'])).resolves.toEqual([path])
    expect(calls).toEqual([{ method: 'image.attach', params: { session_id: 's1', path } }])
  })

  it('throws when every gateway path fails to attach', async () => {
    const request = async () => {
      throw new Error('image not found')
    }
    await expect(reattachSessionImages(request, 's1', ['/tmp/gone.png'])).rejects.toThrow('image not found')
  })
})
