import { describe, expect, it } from 'vitest'
import {
  finalizeAssistantText,
  isReplyEcho,
  mergeReasoningAvailable,
  splitReasoning
} from '~/utils/thinking'

describe('mergeReasoningAvailable', () => {
  it('keeps streamed thinking when the fallback is unrelated reply text', () => {
    expect(mergeReasoningAvailable('English chain of thought', '最近一场：JDG 3:1 WE')).toBe(
      'English chain of thought'
    )
  })

  it('extends a prefix snapshot', () => {
    expect(mergeReasoningAvailable('The user asks', 'The user asks about LPL')).toBe(
      'The user asks about LPL'
    )
  })
})

describe('isReplyEcho', () => {
  it('detects the gateway dumping the reply into reasoning.available', () => {
    const reply = '最近一场：9月18日 LPL 冒泡赛败者组 —— JDG 3:1 WE'
    expect(isReplyEcho(reply.slice(0, 40), reply)).toBe(true)
    expect(isReplyEcho('The user asks about the latest match', reply)).toBe(false)
  })
})

describe('splitReasoning', () => {
  it('lifts think tags out of visible reply text', () => {
    expect(splitReasoning('<think>plan first</think>\n\nHere is the answer.')).toEqual({
      reasoning: 'plan first',
      text: 'Here is the answer.'
    })
  })
})

describe('finalizeAssistantText', () => {
  it('prefers payload reasoning and drops a reply echo left in the thinking panel', () => {
    const reply = '最近一场：JDG 3:1 WE（让一追三）'
    expect(finalizeAssistantText({
      content: reply,
      payloadText: reply,
      payloadReasoning: 'The user asks about the latest match.',
      streamedReasoning: reply.slice(0, 20)
    })).toEqual({
      content: reply,
      reasoning: 'The user asks about the latest match.'
    })
  })

  it('keeps streamed text when message.complete has an empty payload', () => {
    expect(finalizeAssistantText({
      content: 'partial reply',
      payloadText: '',
      streamedReasoning: 'thinking'
    })).toEqual({
      content: 'partial reply',
      reasoning: 'thinking'
    })
  })
})
