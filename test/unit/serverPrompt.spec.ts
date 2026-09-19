import { describe, expect, it } from 'vitest'
import {
  applyOpenPrompt,
  bareChoice,
  clarifyStagedAnswer,
  isRecommendedChoice,
  parseClarifyRequest,
  readClarifyBatchResult,
  readClarifyResult,
  replayLockedStage
} from '~/utils/serverPrompt'

describe('parseClarifyRequest', () => {
  it('keeps a single question with recommended choice stripped on submit', () => {
    const parsed = parseClarifyRequest('srq-1', {
      question: 'Which host?',
      choices: ['staging (Recommended)', 'prod']
    })
    expect(parsed?.question).toBe('Which host?')
    expect(parsed?.choices).toEqual(['staging (Recommended)', 'prod'])
    expect(isRecommendedChoice(parsed!.choices![0]!)).toBe(true)
    expect(bareChoice(parsed!.choices![0]!)).toBe('staging')
  })

  it('parses a batch of questions', () => {
    const parsed = parseClarifyRequest('srq-2', {
      questions: [
        { qid: 'q0', question: 'Region?', choices: ['eu', 'us'] },
        { question: 'Open ended' }
      ],
      answers: { q0: 'eu' }
    })
    expect(parsed?.questions).toHaveLength(2)
    expect(parsed?.questions?.[0]).toMatchObject({ qid: 'q0', question: 'Region?' })
    expect(parsed?.questions?.[1]).toMatchObject({ qid: 'q1', question: 'Open ended', choices: null })
    expect(parsed?.lockedAnswers).toEqual({ q0: 'eu' })
  })

  it('reads a settled clarify tool result', () => {
    expect(readClarifyResult({ question: 'Host?', user_response: 'staging' })).toEqual({
      question: 'Host?',
      answer: 'staging',
      error: ''
    })
    expect(readClarifyResult('just text').answer).toBe('just text')
  })

  it('reads a batch clarify tool result', () => {
    const batch = readClarifyBatchResult({
      responses: [
        { id: 'q0', question: 'Region?', user_response: 'eu' },
        { question: 'Notes', user_response: '' }
      ],
      timed_out: true
    })
    expect(batch.timedOut).toBe(true)
    expect(batch.responses).toEqual([
      { id: 'q0', question: 'Region?', answer: 'eu' },
      { id: '', question: 'Notes', answer: '' }
    ])
  })

  it('stages and replays batch answers the way Desktop locks them', () => {
    const question = {
      qid: 'q0',
      question: 'Region?',
      choices: ['eu (Recommended)', 'us'],
      multiSelect: false
    }
    expect(clarifyStagedAnswer(question, { choices: ['eu (Recommended)'], draft: '' })).toBe('eu')
    expect(replayLockedStage(question, 'eu')).toEqual({ choices: ['eu (Recommended)'], draft: '' })
    expect(clarifyStagedAnswer({ multiSelect: true }, { choices: ['eu', 'us'], draft: '' })).toBe('["eu","us"]')
  })
})

describe('applyOpenPrompt', () => {
  it('routes open_requests onto the matching prompt handler', () => {
    const seen: string[] = []
    applyOpenPrompt(
      { id: '1', method: 'sudo', params: { command: 'systemctl restart nginx' } },
      {
        approval: () => seen.push('approval'),
        clarify: () => seen.push('clarify'),
        sudo: (value) => seen.push(`sudo:${value.command}`)
      }
    )
    expect(seen).toEqual(['sudo:systemctl restart nginx'])
  })
})
