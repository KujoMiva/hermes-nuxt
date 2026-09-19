import { describe, expect, it } from 'vitest'
import type { HermesSession } from '~/types/hermes'
import {
  mergeSessionSearch,
  searchHitToSession,
  sessionMatchesSearch,
  stripFtsMarkers
} from '~/utils/sessionSearch'

function session(partial: Partial<HermesSession> & Pick<HermesSession, 'id'>): HermesSession {
  return partial
}

describe('stripFtsMarkers', () => {
  it('strips sqlite snippet delimiters', () => {
    expect(stripFtsMarkers('plain snippet')).toBe('plain snippet')
    expect(stripFtsMarkers('hit >>>foo<<< bar')).toBe('hit foo bar')
  })
})

describe('sessionMatchesSearch', () => {
  it('matches id, title, preview and source labels', () => {
    const row = session({
      id: '20260603_090200_abcd12',
      parent_session_id: '20260602_235959_root99',
      title: 'Desktop Search Feature',
      preview: 'Fix session search',
      source: 'telegram',
      model: 'claude'
    })
    expect(sessionMatchesSearch(row, 'ABCD12')).toBe(true)
    expect(sessionMatchesSearch(row, 'root99')).toBe(true)
    expect(sessionMatchesSearch(row, 'desktop search')).toBe(true)
    expect(sessionMatchesSearch(row, 'session search')).toBe(true)
    expect(sessionMatchesSearch(row, 'Telegram')).toBe(true)
    expect(sessionMatchesSearch(row, 'unrelated')).toBe(false)
  })
})

describe('searchHitToSession', () => {
  it('uses the FTS snippet as preview and drops the title so the excerpt shows', () => {
    const hit = searchHitToSession({
      session_id: 's_live',
      lineage_root: 's_root',
      snippet: 'matched >>>needle<<< here',
      title: 'Real title',
      source: 'cli',
      model: 'gpt',
      session_started: 100,
      message_count: 8
    })
    expect(hit).toMatchObject({
      id: 's_live',
      title: '',
      preview: 'matched needle here',
      source: 'cli',
      parent_session_id: 's_root',
      message_count: 8
    })
  })
})

describe('mergeSessionSearch', () => {
  it('keeps local matches first and fills the rest from FTS without duplicating', () => {
    const loaded = [
      session({ id: 'local', title: 'Needle in title', source: 'cli' }),
      session({ id: 'loaded-fts', title: 'Loaded chat', source: 'cli' })
    ]
    const hits = [
      session({ id: 'local', preview: 'duplicate content hit', source: 'cli' }),
      session({ id: 'loaded-fts', preview: 'old message excerpt', source: 'cli' }),
      session({ id: 'fts-only', preview: 'needle from body', source: 'cli' }),
      session({ id: 'cron-hit', preview: 'needle', source: 'cron' })
    ]
    expect(mergeSessionSearch(loaded, hits, 'needle').map(item => item.id))
      .toEqual(['local', 'loaded-fts', 'fts-only'])
    expect(mergeSessionSearch(loaded, hits, 'needle')[0]?.title).toBe('Needle in title')
    expect(mergeSessionSearch(loaded, hits, 'needle')[1]?.title).toBe('Loaded chat')
  })
})
