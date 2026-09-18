import { describe, expect, it } from 'vitest'
import type { HermesSession } from '~/types/hermes'
import {
  groupChatSessions,
  sessionMeta,
  visibleArchivedSessions,
  visibleChatSessions,
  workspaceIcon
} from '~/utils/sessionGroups'

function session(partial: Partial<HermesSession> & Pick<HermesSession, 'id'>): HermesSession {
  return partial
}

describe('visibleChatSessions', () => {
  it('hides archived, hidden, tool, subagent and cron rows', () => {
    const rows = [
      session({ id: 'keep', source: 'cli' }),
      session({ id: 'archived', archived: true }),
      session({ id: 'hidden', hidden: true }),
      session({ id: 'tool', source: 'tool' }),
      session({ id: 'sub', source: 'subagent' }),
      session({ id: 'cron', source: 'cron' })
    ]
    expect(visibleChatSessions(rows).map(item => item.id)).toEqual(['keep'])
  })
})

describe('groupChatSessions', () => {
  it('puts API/CLI/web chats in home and channels in their own groups', () => {
    const rows = [
      session({ id: 'a', source: 'cli' }),
      session({ id: 'b', source: 'telegram' }),
      session({ id: 'c', source: 'discord' }),
      session({ id: 'd', source: 'tool' })
    ]
    const groups = groupChatSessions(rows, { label: '工作', hint: '配置文件' })
    expect(groups.map(item => item.id)).toEqual(['home', 'telegram', 'discord'])
    expect(groups[0]).toMatchObject({ label: '工作', hint: '配置文件', sessions: [{ id: 'a' }] })
    expect(groups[1]?.sessions.map(item => item.id)).toEqual(['b'])
    expect(groups[2]?.icon).toBe(workspaceIcon('discord'))
  })
})

describe('visibleArchivedSessions', () => {
  it('keeps archived chats but still hides tool/subagent/cron', () => {
    const rows = [
      session({ id: 'a', archived: true, source: 'cli' }),
      session({ id: 'b', archived: true, source: 'tool' })
    ]
    expect(visibleArchivedSessions(rows).map(item => item.id)).toEqual(['a'])
  })
})

describe('sessionMeta', () => {
  it('marks branched sessions', () => {
    expect(sessionMeta(session({
      id: 'a',
      end_reason: 'branched',
      last_active: Date.now()
    }))).toMatch(/已分支$/)
  })
})
