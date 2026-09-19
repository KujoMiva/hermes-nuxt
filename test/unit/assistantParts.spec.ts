import { describe, expect, it } from 'vitest'
import type { ChatThreadMessage, ChatToolEvent } from '~/types/hermes'
import {
  appendStreamPart,
  appendToolPart,
  applyCompleteText,
  assistantBlocks,
  joinAssistantText,
  mergePartLists,
  messageParts,
  remainderAfterPrefix
} from '~/utils/assistantParts'

function tool(id: string, name = 'web_search'): ChatToolEvent {
  return { id, name, status: 'completed' }
}

function assistant(partial: Partial<ChatThreadMessage> = {}): ChatThreadMessage {
  return {
    id: 'a1',
    role: 'assistant',
    content: '',
    createdAt: 1,
    ...partial
  }
}

describe('joinAssistantText', () => {
  it('keeps a later superset and concatenates distinct replies', () => {
    expect(joinAssistantText('我查一下。', '我查一下。\n\n结果是 3:1')).toBe('我查一下。\n\n结果是 3:1')
    expect(joinAssistantText('我查一下。', '结果是 3:1')).toBe('我查一下。\n\n结果是 3:1')
  })
})

describe('remainderAfterPrefix', () => {
  it('strips earlier narration from a later full reply', () => {
    expect(remainderAfterPrefix('我查一下。', '我查一下。\n\n结果是 3:1')).toBe('结果是 3:1')
    expect(remainderAfterPrefix('我查一下。', '我查一下。')).toBe('')
    expect(remainderAfterPrefix('我查一下。', '结果是 3:1')).toBe('结果是 3:1')
  })
})

describe('messageParts', () => {
  it('derives reasoning then text then tools when parts are missing', () => {
    const parts = messageParts(assistant({
      content: '我查一下最新一场比赛的结果。',
      reasoning: 'first thought',
      tools: [tool('t1')]
    }))
    expect(parts.map(part => part.type)).toEqual(['reasoning', 'text', 'tool'])
  })
})

describe('mergePartLists', () => {
  it('keeps narration before tools and later thinking after them', () => {
    const merged = mergePartLists(
      messageParts(assistant({
        content: '我查一下最新一场比赛的结果。',
        reasoning: 'first thought',
        tools: [tool('t1', 'read_file')]
      })),
      messageParts(assistant({
        content: '最近一场：JDG 3:1 WE',
        reasoning: 'second thought',
        tools: [tool('t2')]
      }))
    )
    expect(merged.map(part => part.type)).toEqual([
      'reasoning',
      'text',
      'tool',
      'reasoning',
      'text',
      'tool'
    ])
    expect(merged.filter(part => part.type === 'text').map(part => part.text)).toEqual([
      '我查一下最新一场比赛的结果。',
      '最近一场：JDG 3:1 WE'
    ])
  })
})

describe('appendStreamPart', () => {
  it('starts a new text segment after tools instead of appending to the interim', () => {
    let parts = appendStreamPart([], 'reasoning', 'plan')
    parts = appendStreamPart(parts, 'text', '我查一下最新一场比赛的结果。')
    parts = appendToolPart(parts, tool('t1', 'read_file'))
    parts = appendStreamPart(parts, 'reasoning', 'now search')
    parts = appendStreamPart(parts, 'text', '最近一场：JDG 3:1 WE')
    expect(parts.map(part => part.type)).toEqual([
      'reasoning',
      'text',
      'tool',
      'reasoning',
      'text'
    ])
    expect(assistantBlocks(assistant({ parts })).map(block => block.type)).toEqual([
      'reasoning',
      'text',
      'shelf',
      'text'
    ])
    const shelf = assistantBlocks(assistant({ parts })).find(block => block.type === 'shelf')
    expect(shelf?.type === 'shelf' ? shelf.segments.map(item => item.type) : []).toEqual([
      'tools',
      'reasoning'
    ])
    expect(shelf?.type === 'shelf' ? shelf.tools.map(item => item.id) : []).toEqual(['t1'])
  })
})

describe('assistantBlocks', () => {
  it('keeps the first thought and narration outside a fold of interleaved tools', () => {
    const blocks = assistantBlocks(assistant({
      parts: [
        { type: 'reasoning', text: 'first thought' },
        { type: 'text', text: '我查一下最新一场比赛的结果。' },
        { type: 'tool', tool: tool('t1', 'read_file') },
        { type: 'reasoning', text: 'second thought' },
        { type: 'tool', tool: tool('t2') },
        { type: 'text', text: '最近一场：JDG 3:1 WE' }
      ]
    }))
    expect(blocks.map(block => block.type)).toEqual(['reasoning', 'text', 'shelf', 'text'])
    expect(blocks[0]?.type === 'reasoning' ? blocks[0].part.text : '').toBe('first thought')
    expect(blocks[1]?.type === 'text' ? blocks[1].part.text : '').toBe('我查一下最新一场比赛的结果。')
    expect(blocks[2]?.type === 'shelf' ? blocks[2].segments.map(item => item.type) : []).toEqual([
      'tools',
      'reasoning',
      'tools'
    ])
    expect(blocks[2]?.type === 'shelf' ? blocks[2].tools.map(item => item.id) : []).toEqual(['t1', 't2'])
    expect(blocks[3]?.type === 'text' ? blocks[3].part.text : '').toBe('最近一场：JDG 3:1 WE')
  })

  it('puts a stored content+tools reply under Tool calls like TUI Response', () => {
    const blocks = assistantBlocks(assistant({
      content: '能看，而且有两种非常清晰的查看方式。',
      reasoning: '先跑命令再回答',
      tools: [tool('t1', 'terminal'), tool('t2', 'terminal')]
    }))
    expect(blocks.map(block => block.type)).toEqual(['reasoning', 'shelf', 'text'])
    expect(blocks[2]?.type === 'text' ? blocks[2].part.text : '').toBe('能看，而且有两种非常清晰的查看方式。')
  })

  it('keeps live pre-tool narration above tools until the reply arrives', () => {
    const blocks = assistantBlocks(assistant({
      streaming: true,
      parts: [
        { type: 'text', text: '我查一下。' },
        { type: 'tool', tool: tool('t1', 'terminal') }
      ]
    }))
    expect(blocks.map(block => block.type)).toEqual(['text', 'shelf'])
    expect(blocks[0]?.type === 'text' ? blocks[0].part.text : '').toBe('我查一下。')
  })
})

describe('applyCompleteText', () => {
  it('does not fold the final answer back into the pre-tool narration', () => {
    const parts = applyCompleteText([
      { type: 'text', text: '我查一下最新一场比赛的结果。', live: false },
      { type: 'tool', tool: tool('t1') },
      { type: 'text', text: '最近一场', live: true }
    ], '我查一下最新一场比赛的结果。\n\n最近一场：JDG 3:1 WE')
    expect(parts.filter(part => part.type === 'text').map(part => part.text)).toEqual([
      '我查一下最新一场比赛的结果。',
      '最近一场：JDG 3:1 WE'
    ])
  })

  it('appends the complete payload after tools instead of growing the preamble', () => {
    const parts = applyCompleteText([
      { type: 'text', text: '我查一下。', live: false },
      { type: 'tool', tool: tool('t1', 'terminal') }
    ], '我查一下。\n\n能看，而且有两种非常清晰的查看方式。')
    expect(parts.map(part => part.type)).toEqual(['text', 'tool', 'text'])
    expect(parts.filter(part => part.type === 'text').map(part => part.text)).toEqual([
      '我查一下。',
      '能看，而且有两种非常清晰的查看方式。'
    ])
  })
})
