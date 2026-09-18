import type { AuxiliaryTaskAssignment, ModelProvider, StaleAuxAssignment } from '~/types/hermes'

export const AUX_TASKS: Array<{ key: string, label: string, hint: string }> = [
  { key: 'vision', label: '视觉', hint: '图片理解' },
  { key: 'compression', label: '压缩', hint: '上下文压缩' },
  { key: 'skills_hub', label: '技能检索', hint: '搜索已安装技能' },
  { key: 'approval', label: '智能审批', hint: '自动审批启发式' },
  { key: 'mcp', label: 'MCP', hint: 'MCP 工具路由' },
  { key: 'title_generation', label: '会话标题', hint: '自动生成标题' },
  { key: 'review', label: 'Review', hint: '/review 子代理' },
  { key: 'triage_specifier', label: '看板规格', hint: '补全看板条目' },
  { key: 'kanban_decomposer', label: '看板拆分', hint: '任务拆解' },
  { key: 'profile_describer', label: 'Profile 描述', hint: '自动写 Profile 说明' },
  { key: 'curator', label: 'Curator', hint: '技能使用回顾' }
]

export const GLOBAL_REASONING_EFFORTS = [
  { value: 'none', label: '关闭' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra High' },
  { value: 'max', label: 'Max' },
  { value: 'ultra', label: 'Ultra' }
] as const

export function isFastTier(value: unknown) {
  return ['fast', 'priority', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

export function isProviderReady(provider?: ModelProvider) {
  return Boolean(provider && (provider.authenticated !== false || provider.models?.length))
}

export function isApiKeyAuth(provider?: ModelProvider) {
  return (provider?.authType || 'api_key') === 'api_key' && Boolean(provider?.keyEnv)
}

export function withActive(values: string[], active: string) {
  if (active && !values.includes(active)) return [active, ...values]
  return values
}

export function nestedGet(source: unknown, path: string): unknown {
  let current: unknown = source
  for (const part of path.split('.').filter(Boolean)) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function sparsePatch(path: string, value: unknown) {
  const parts = path.split('.').filter(Boolean)
  const root: Record<string, unknown> = {}
  let cursor = root
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index]
    if (!key) continue
    const next: Record<string, unknown> = {}
    cursor[key] = next
    cursor = next
  }
  const last = parts[parts.length - 1]
  if (last) cursor[last] = value
  return root
}

export function providerMatches(provider: ModelProvider, slug: string) {
  const needle = slug.trim().toLowerCase()
  if (!needle) return false
  if (provider.id.toLowerCase() === needle) return true
  return (provider.aliases || []).some(alias => alias.toLowerCase() === needle)
}

export function staleAuxAssignments(tasks: AuxiliaryTaskAssignment[], mainProvider: string): StaleAuxAssignment[] {
  const main = mainProvider.trim().toLowerCase()
  if (!main) return []
  return tasks
    .filter((entry) => {
      const provider = (entry.provider || '').toLowerCase()
      return Boolean(provider)
        && provider !== 'auto'
        && provider !== 'main'
        && provider !== main
        && !entry.local_endpoint
    })
    .map(entry => ({
      task: entry.task,
      provider: entry.provider,
      model: entry.model
    }))
}

export function auxTaskLabel(key: string) {
  return AUX_TASKS.find(item => item.key === key)?.label || key
}

/** Gateway `config.set` has no `provider` field — flags live in `value`. */
export function sessionModelSetValue(model: string, provider = '') {
  const id = model.trim()
  if (!id) return ''
  const slug = provider.trim()
  return slug ? `${id} --provider ${slug} --session` : `${id} --session`
}

export function isBusySessionModelSwitch(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /session busy/i.test(message) && /switching models/i.test(message)
}
