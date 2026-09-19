import { describe, expect, it } from 'vitest'
import { isMemorySearchTool } from '~/utils/format'
import { summarizeToolRun, toolContext, toolTrailLine } from '~/utils/toolRun'
import type { ChatToolEvent } from '~/types/hermes'

function tool(partial: Partial<ChatToolEvent> & Pick<ChatToolEvent, 'id' | 'name'>): ChatToolEvent {
  return { status: 'completed', ...partial }
}

describe('isMemorySearchTool', () => {
  it('recognizes mem0 and sibling memory search tools', () => {
    expect(isMemorySearchTool('mem0_search')).toBe(true)
    expect(isMemorySearchTool('supermemory_search')).toBe(true)
    expect(isMemorySearchTool('honcho_search')).toBe(true)
    expect(isMemorySearchTool('web_search')).toBe(false)
    expect(isMemorySearchTool('session_search_recall')).toBe(false)
  })
})

describe('summarizeToolRun', () => {
  it('labels a mem0 lookup as 搜索了记忆 instead of dumping the query', () => {
    const query = 'Hermes SiliconFlow TTS voice playback TUI generated audio not playing'
    expect(summarizeToolRun([
      tool({ id: 's', name: 'skill_view', args: { skill: 'hermes-agent' } }),
      tool({ id: 'm', name: 'mem0_search', args: { query } }),
      tool({ id: 'a', name: 'search_files', args: { query: 'audio_cache' } }),
      tool({ id: 'b', name: 'search_files', args: { query: 'Voice & TTS' } })
    ], false)).toBe('搜索了记忆，查看了技能，查阅了 2 个文件')
  })

  it('keeps the query on the tool row, not the group headline', () => {
    const query = 'Hermes SiliconFlow TTS voice playback TUI generated audio not playing'
    const row = tool({ id: 'm', name: 'mem0_search', args: { query } })
    expect(summarizeToolRun([row], false)).toBe('搜索了记忆')
    expect(summarizeToolRun([row], true)).toBe('正在搜索记忆')
    expect(toolContext(row)).toBe(query)
    expect(toolTrailLine(row, 0).startsWith('Mem0 Search("')).toBe(true)
    expect(toolTrailLine(row, 0)).not.toContain('调用了')
  })
})
