import { describe, expect, it, vi } from 'vitest'
import type { ChatThreadMessage, ChatToolEvent } from '~/types/hermes'
import {
  chatBubbleMemo,
  fetchAllSessionMessages,
  foldTurnTools,
  mapSessionMessage,
  reuseFoldedMessages
} from '~/utils/sessionMessages'

function message(
  partial: Partial<ChatThreadMessage> & Pick<ChatThreadMessage, 'id' | 'role'>
): ChatThreadMessage {
  return {
    content: '',
    createdAt: 1,
    ...partial
  }
}

function tool(
  partial: Partial<ChatToolEvent> & Pick<ChatToolEvent, 'id' | 'name'>
): ChatToolEvent {
  return {
    status: 'completed',
    ...partial
  }
}

describe('foldTurnTools', () => {
  it('returns an empty list unchanged', () => {
    expect(foldTurnTools([])).toEqual([])
  })

  it('passes user messages through without folding', () => {
    const user = message({ id: 'u1', role: 'user', content: 'hi' })
    expect(foldTurnTools([user])).toEqual([user])
  })

  it('keeps a single assistant reply and its tools', () => {
    const call = tool({ id: 't1', name: 'search' })
    const assistant = message({
      id: 'a1',
      role: 'assistant',
      content: 'done',
      tools: [call]
    })

    expect(foldTurnTools([assistant])).toEqual([{ ...assistant, reasoning: '' }])
  })

  it('folds tool-only assistant rows onto the last visible reply in the turn', () => {
    const call = tool({ id: 't1', name: 'bash', preview: 'ls' })
    const folded = foldTurnTools([
      message({ id: 'u1', role: 'user', content: 'list files' }),
      message({ id: 'a1', role: 'assistant', tools: [call] }),
      message({ id: 'a2', role: 'assistant', content: 'here they are' })
    ])

    expect(folded.map(item => item.id)).toEqual(['u1', 'a2'])
    expect(folded[1]?.tools).toEqual([call])
    expect(folded[1]?.content).toBe('here they are')
  })

  it('lifts reasoning into a thinking event on the visible assistant', () => {
    const folded = foldTurnTools([
      message({ id: 'u1', role: 'user', content: 'why' }),
      message({
        id: 'a1',
        role: 'assistant',
        reasoning: 'consider options',
        content: 'because'
      })
    ])

    expect(folded).toHaveLength(2)
    expect(folded[1]?.reasoning).toBe('')
    expect(folded[1]?.tools).toEqual([
      {
        id: 'think_a1',
        name: 'thinking',
        kind: 'thinking',
        status: 'completed',
        preview: 'consider options',
        startedAt: 1
      }
    ])
  })

  it('does not duplicate an existing thinking event', () => {
    const thinking = tool({
      id: 'think_a1',
      name: 'thinking',
      kind: 'thinking',
      preview: 'already folded'
    })
    const folded = foldTurnTools([
      message({
        id: 'a1',
        role: 'assistant',
        content: 'ok',
        reasoning: 'new thought',
        tools: [thinking]
      })
    ])

    expect(folded[0]?.tools).toEqual([thinking])
  })

  it('synthesizes a tools-only bubble when the turn has no visible assistant body', () => {
    const call = tool({ id: 't9', name: 'read', startedAt: 42 })
    const folded = foldTurnTools([
      message({ id: 'u1', role: 'user', content: 'read it' }),
      message({ id: 'a1', role: 'assistant', tools: [call] })
    ])

    expect(folded).toEqual([
      message({ id: 'u1', role: 'user', content: 'read it' }),
      {
        id: 'tools_t9',
        role: 'assistant',
        content: '',
        tools: [call],
        createdAt: 42
      }
    ])
  })

  it('treats streaming or image-only assistants as visible', () => {
    const call = tool({ id: 't1', name: 'draw' })
    const folded = foldTurnTools([
      message({ id: 'a1', role: 'assistant', streaming: true, tools: [call] }),
      message({ id: 'a2', role: 'assistant', images: ['/pic.png'] })
    ])

    expect(folded.map(item => item.id)).toEqual(['a1', 'a2'])
    expect(folded[0]?.tools).toEqual([])
    expect(folded[1]?.tools).toEqual([call])
    expect(folded[1]?.images).toEqual(['/pic.png'])
  })

  it('keeps an empty assistant that only has a stop kind', () => {
    const folded = foldTurnTools([
      message({ id: 'u1', role: 'user', content: 'hi' }),
      message({ id: 'a1', role: 'assistant', stopKind: 'user_stop' })
    ])

    expect(folded.map(item => item.id)).toEqual(['u1', 'a1'])
    expect(folded[1]?.stopKind).toBe('user_stop')
    expect(folded[1]?.content).toBe('')
  })

  it('does not leak tools across user turns', () => {
    const first = tool({ id: 't1', name: 'one' })
    const second = tool({ id: 't2', name: 'two' })
    const folded = foldTurnTools([
      message({ id: 'u1', role: 'user', content: 'first' }),
      message({ id: 'a1', role: 'assistant', content: 'A', tools: [first] }),
      message({ id: 'u2', role: 'user', content: 'second' }),
      message({ id: 'a2', role: 'assistant', content: 'B', tools: [second] })
    ])

    expect(folded[1]?.tools).toEqual([first])
    expect(folded[3]?.tools).toEqual([second])
  })

  it('keeps system messages in the turn bucket', () => {
    const folded = foldTurnTools([
      message({ id: 's1', role: 'system', content: 'note' }),
      message({ id: 'a1', role: 'assistant', content: 'ok' })
    ])

    expect(folded.map(item => item.id)).toEqual(['s1', 'a1'])
    expect(folded[0]?.content).toBe('note')
  })
})

describe('reuseFoldedMessages', () => {
  it('keeps previous object identity when a turn did not change', () => {
    const call = tool({ id: 't1', name: 'search' })
    const rows = [
      message({ id: 'u1', role: 'user', content: 'hi' }),
      message({ id: 'a1', role: 'assistant', content: 'yo', tools: [call] })
    ]
    const first = foldTurnTools(rows)
    const second = reuseFoldedMessages(first, foldTurnTools(rows))
    expect(second).toBe(first)
    expect(second[0]).toBe(first[0])
    expect(second[1]).toBe(first[1])
  })

  it('replaces only the assistant that changed', () => {
    const user = message({ id: 'u1', role: 'user', content: 'hi' })
    const first = foldTurnTools([
      user,
      message({ id: 'a1', role: 'assistant', content: 'hel', streaming: true })
    ])
    const second = reuseFoldedMessages(first, foldTurnTools([
      user,
      message({ id: 'a1', role: 'assistant', content: 'hello', streaming: true })
    ]))

    expect(second[0]).toBe(first[0])
    expect(second[1]).not.toBe(first[1])
    expect(second[1]?.content).toBe('hello')
  })
})

describe('chatBubbleMemo', () => {
  it('changes when streaming content or tools change', () => {
    const base = message({ id: 'a1', role: 'assistant', content: 'hi' })
    const idle = chatBubbleMemo(base)
    expect(chatBubbleMemo({ ...base, content: 'hi' })).toEqual(idle)
    expect(chatBubbleMemo({ ...base, content: 'hii' })).not.toEqual(idle)
    expect(chatBubbleMemo({ ...base, streaming: true })).not.toEqual(idle)
    expect(chatBubbleMemo({
      ...base,
      tools: [tool({ id: 't1', name: 'bash', preview: 'ls' })]
    })).not.toEqual(idle)
  })
})

describe('fetchAllSessionMessages', () => {
  it('uses session.resume messages when present', async () => {
    const request = vi.fn(async (_method: string, _params?: Record<string, unknown>) => {
      if (_method === 'session.resume') {
        return {
          session_id: 's1',
          messages: [{ role: 'user', text: 'hi', row_id: 1 }]
        }
      }
      throw new Error('history should not run')
    })

    const rows = await fetchAllSessionMessages(request as never, 's1')

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]?.[0]).toBe('session.resume')
    expect(request.mock.calls[0]?.[1]).toEqual({ session_id: 's1' })
    expect(rows).toMatchObject([{ id: 1, role: 'user', content: 'hi' }])
  })

  it('falls back to session.history when resume has no messages', async () => {
    const request = vi.fn(async (_method: string, _params?: Record<string, unknown>) => {
      if (_method === 'session.resume') return { session_id: 's1', messages: [] }
      return { messages: [{ role: 'assistant', content: 'yo', id: 'a1' }] }
    })

    const rows = await fetchAllSessionMessages(request as never, 'missing')

    expect(request.mock.calls.map(call => call[0])).toEqual(['session.resume', 'session.history'])
    expect(request.mock.calls[1]?.[1]).toEqual({ session_id: 's1' })
    expect(rows).toMatchObject([{ id: 'a1', role: 'assistant', content: 'yo' }])
  })
})

describe('mapSessionMessage', () => {
  it('drops tool roles and copies assistant tool calls', () => {
    expect(mapSessionMessage({ role: 'tool', content: 'ignored' })).toBeNull()
    const row = mapSessionMessage({
      id: 'm1',
      role: 'assistant',
      content: 'hello',
      timestamp: 1_700_000_000,
      tool_calls: [{ id: 't1', function: { name: 'search', arguments: '{"q":1}' } }]
    })
    expect(row).toMatchObject({
      id: 'm1',
      role: 'assistant',
      content: 'hello',
      tools: [{ id: 't1', name: 'search', status: 'completed' }]
    })
  })
})
