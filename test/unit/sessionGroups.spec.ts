import { describe, expect, it } from 'vitest'
import type { HermesSession } from '~/types/hermes'
import {
  groupChatSessions,
  mergeArchivedSessions,
  overlayPinnedSessions,
  sessionMeta,
  sortSessions,
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

describe('mergeArchivedSessions', () => {
  it('keeps REST archived rows and hidden-only rows that left the sidebar', () => {
    const flagged = [
      session({ id: 'rest', archived: true, source: 'cli' }),
      session({ id: 'tool-rest', archived: true, source: 'tool' })
    ]
    const listed = [
      session({ id: 'rest', source: 'cli' }),
      session({ id: 'hidden', hidden: true, source: 'webui' }),
      session({ id: 'visible', source: 'cli' }),
      session({ id: 'cron-hidden', hidden: true, source: 'cron' })
    ]
    expect(mergeArchivedSessions(flagged, listed, ['visible']).map(item => item.id))
      .toEqual(['rest', 'hidden'])
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

describe('sortSessions', () => {
  it('puts pinned rows first, then newest activity', () => {
    const rows = [
      session({ id: 'old', last_active: 1 }),
      session({ id: 'pinned-old', last_active: 2, pinned: true }),
      session({ id: 'new', last_active: 4 }),
      session({ id: 'pinned-new', last_active: 3, pinned: true })
    ]
    expect(sortSessions(rows).map(item => item.id))
      .toEqual(['pinned-new', 'pinned-old', 'new', 'old'])
  })
})

describe('overlayPinnedSessions', () => {
  it('adopts REST pinned flags and back-fills pinned rows missing from the list page', () => {
    const listed = [
      session({ id: 'a', last_active: 2 }),
      session({ id: 'b', last_active: 1, pinned: true })
    ]
    const remote = [
      session({ id: 'a', last_active: 2, pinned: true }),
      session({ id: 'b', last_active: 1, pinned: false }),
      session({ id: 'c', last_active: 3, pinned: true }),
      session({ id: 'cron', last_active: 5, pinned: true, source: 'cron' })
    ]
    expect(overlayPinnedSessions(listed, remote).map(item => item.id))
      .toEqual(['c', 'a', 'b'])
    expect(overlayPinnedSessions(listed, remote).map(item => item.pinned))
      .toEqual([true, true, false])
  })
})
