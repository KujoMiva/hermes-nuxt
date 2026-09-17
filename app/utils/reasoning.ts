import type { ReasoningEffort } from '~/types/hermes'

/** Level names match Hermes dashboard `EFFORT_OPTIONS`. UI chrome stays Chinese. */
export const REASONING_EFFORTS: Array<{
  id: ReasoningEffort
  title: string
  description: string
}> = [
  { id: '', title: 'Default', description: '不覆盖。使用服务器配置。' },
  { id: 'none', title: 'Off (no thinking)', description: '' },
  { id: 'minimal', title: 'Minimal', description: '' },
  { id: 'low', title: 'Low', description: '' },
  { id: 'medium', title: 'Medium', description: '' },
  { id: 'high', title: 'High', description: '' },
  { id: 'xhigh', title: 'Extra High', description: '' },
  { id: 'max', title: 'Max', description: '' },
  { id: 'ultra', title: 'Ultra', description: '' }
]

export function reasoningEffortTitle(value?: string | null) {
  const current = (value || '') as ReasoningEffort
  return REASONING_EFFORTS.find(item => item.id === current)?.title || '跟随'
}
