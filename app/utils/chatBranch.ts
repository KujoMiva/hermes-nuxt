import type { ChatThreadMessage } from '~/types/hermes'

export function isVisibleBranchTurn(message: ChatThreadMessage) {
  return (message.role === 'user' || message.role === 'assistant') && Boolean(message.content?.trim())
}

/** Visible user/assistant turns through `messageId`, matching `session.branch` count. */
export function branchCountThrough(messages: ChatThreadMessage[], messageId: string) {
  const index = messages.findIndex(item => item.id === messageId)
  if (index < 0) return 0
  let count = 0
  for (let i = 0; i <= index; i += 1) {
    const row = messages[i]
    if (row && isVisibleBranchTurn(row)) count += 1
  }
  return count
}
