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

const EFFORT_IDS = new Set(REASONING_EFFORTS.map(item => item.id))

/** Map a gateway `session.info.reasoning_effort` value onto the composer chips. */
export function asSessionReasoningEffort(value?: string | null): ReasoningEffort {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return ''
  if (raw === 'false' || raw === 'off' || raw === 'disabled' || raw === 'no') return 'none'
  return EFFORT_IDS.has(raw as ReasoningEffort) ? raw as ReasoningEffort : ''
}
