export type ChatItem = {
  id: string
  kind: 'user' | 'assistant' | 'tool' | 'system'
  text: string
  streaming?: boolean
}
