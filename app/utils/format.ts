import { extractImageRefs } from './imageRefs'

export function displayTitle(session: { title?: string, preview?: string, id?: string }) {
  const title = session.title?.trim()
  if (title) return title
  const preview = session.preview?.trim()
  if (preview) return preview.slice(0, 42)
  if (session.id) return session.id.slice(0, 12)
  return '未命名会话'
}

export function asDate(value?: string | number | null) {
  if (value == null || value === '') return null
  const date = typeof value === 'number'
    ? new Date(value > 1e12 ? value : value * 1000)
    : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function formatDateTime(value?: string | number | null, withSeconds = false) {
  const date = asDate(value)
  if (!date) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  return withSeconds ? `${stamp}:${pad(date.getSeconds())}` : stamp
}

export function relativeTime(value?: string | number | null) {
  if (value == null || value === '') return ''
  const date = typeof value === 'number'
    ? new Date(value > 1e12 ? value : value * 1000)
    : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  const diffSec = Math.round((date.getTime() - Date.now()) / 1000)
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })

  if (abs < 60) return rtf.format(diffSec, 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day')
  if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), 'month')
  return rtf.format(Math.round(diffSec / (86400 * 365)), 'year')
}

export function formatTokens(value?: number | null) {
  if (value == null) return '—'
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`
  return `${(value / 1_000_000).toFixed(2)}M`
}

export function compactNumber(value?: number | null) {
  if (value == null) return '—'
  if (value < 1000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}

const CONTEXT_FAMILIES: Array<[string, number]> = [
  ['claude-fable-5', 1_000_000],
  ['claude-fable', 1_000_000],
  ['claude-opus-5', 1_000_000],
  ['claude-sonnet-5', 1_000_000],
  ['claude-opus-4.8', 1_000_000],
  ['claude-opus-4-8', 1_000_000],
  ['claude-opus-4.7', 1_000_000],
  ['claude-opus-4-7', 1_000_000],
  ['claude-opus-4.6', 1_000_000],
  ['claude-opus-4-6', 1_000_000],
  ['claude-sonnet-4.6', 1_000_000],
  ['claude-sonnet-4-6', 1_000_000],
  ['claude', 200_000],
  ['gpt-5.6', 1_050_000],
  ['gpt-5.5', 1_050_000],
  ['gpt-5.4-nano', 400_000],
  ['gpt-5.4-mini', 400_000],
  ['gpt-5.4', 1_050_000],
  ['gpt-5.3-codex-spark', 128_000],
  ['gpt-5.1-chat', 128_000],
  ['gpt-5', 400_000],
  ['gpt-4.1', 1_047_576],
  ['gpt-4', 128_000],
  ['gemini', 1_048_576],
  ['gemma-4-31b', 256_000],
  ['gemma-4', 256_000],
  ['gemma4', 256_000],
  ['gemma-3', 131_072],
  ['gemma', 8192],
  ['deepseek-v4', 1_000_000],
  ['deepseek-chat', 1_000_000],
  ['deepseek-reasoner', 1_000_000],
  ['deepseek', 128_000],
  ['qwen3.8-max', 1_000_000],
  ['qwen3.6-plus', 1_048_576],
  ['qwen3.7-plus', 1_048_576],
  ['qwen3-coder-plus', 1_000_000],
  ['qwen3-coder', 262_144],
  ['qwen3-max', 262_144],
  ['qwen', 131_072],
  ['minimax-m3', 1_000_000],
  ['minimax', 204_800],
  ['glm-5.2:free', 256_000],
  ['glm-5.2', 1_048_576],
  ['glm-5.3', 1_048_576],
  ['glm', 202_752],
  ['grok-composer', 200_000],
  ['grok-4-fast', 2_000_000],
  ['grok-4.20', 2_000_000],
  ['grok-4.6', 500_000],
  ['grok-4.5', 500_000],
  ['grok-4.3', 1_000_000],
  ['grok-4', 256_000],
  ['grok-3', 131_072],
  ['grok-2', 131_072],
  ['grok', 131_072],
  ['kimi-k3', 1_048_576],
  ['kimi', 262_144]
]

export function estimateContextLength(model?: string | null) {
  const id = model?.trim().toLowerCase() || ''
  if (!id) return 0
  const ranked = CONTEXT_FAMILIES.slice().sort((left, right) => right[0].length - left[0].length)
  for (const [key, tokens] of ranked) {
    if (id.includes(key)) return tokens
  }
  return 0
}

export function displayModel(model?: string | null) {
  const value = model?.trim()
  if (!value) return ''
  const base = value.split('/').filter(Boolean).pop() || value
  return base.replace(/:latest$/, '')
}

export function hostLabel(baseUrl?: string) {
  if (!baseUrl?.trim()) return '未配置'
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl.replace(/^https?:\/\//, '')
  }
}

export function formatCost(value?: number | null) {
  if (value == null) return '—'
  return `$${value.toFixed(4)}`
}

export function sourceLabel(source?: string) {
  const map: Record<string, string> = {
    api_server: 'API',
    api: 'API',
    cli: 'CLI',
    tui: 'TUI',
    web: 'Web',
    webui: 'Web',
    telegram: 'Telegram',
    discord: 'Discord',
    slack: 'Slack',
    desktop: '桌面端',
    feishu: '飞书',
    whatsapp: 'WhatsApp',
    matrix: 'Matrix',
    cron: '定时任务',
    webhook: 'Webhook',
    email: '邮件',
    tool: '工具',
    subagent: '子代理'
  }
  return source ? (map[source] || source) : '未知'
}

export function extractImages(content: unknown): string[] {
  if (!Array.isArray(content)) return []
  const urls: string[] = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const rec = part as Record<string, unknown>
    if (typeof rec.image_url === 'string') urls.push(rec.image_url)
    if (rec.image_url && typeof rec.image_url === 'object') {
      const url = (rec.image_url as { url?: string }).url
      if (url) urls.push(url)
    }
    if (typeof rec.image === 'string') urls.push(rec.image)
    if (typeof rec.text === 'string') urls.push(...extractImageRefs(rec.text).refs)
  }
  return [...new Set(urls)]
}

export function extractText(content: unknown): string {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object') {
        const rec = part as Record<string, unknown>
        if (typeof rec.text === 'string') return rec.text
        if (typeof rec.input_text === 'string') return rec.input_text
        if (typeof rec.content === 'string') return rec.content
      }
      return ''
    }).filter(Boolean).join('\n')
  }
  if (typeof content === 'object' && 'text' in (content as object)) {
    return String((content as { text?: unknown }).text ?? '')
  }
  try {
    return JSON.stringify(content, null, 2)
  } catch {
    return String(content)
  }
}

export function prettyJson(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function formatShortDuration(ms?: number | null) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return ''
  if (ms < 60_000) {
    const seconds = ms / 1000
    if (seconds < 10) return `${seconds.toFixed(1).replace(/\.0$/, '')}s`
    return `${Math.round(seconds)}s`
  }
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

export function formatClock(value?: string | number | null) {
  const date = asDate(value)
  if (!date) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function toolDisplayName(name?: string) {
  const raw = String(name || 'tool').trim()
  if (!raw) return 'Tool'
  if (raw === 'subagent' || raw === 'delegate_task') return '子代理'
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase())
}

export function subagentTitle(tool: { taskIndex?: number, taskCount?: number }) {
  const index = Number(tool.taskIndex)
  const count = Number(tool.taskCount)
  if (!Number.isFinite(index) || !Number.isFinite(count) || count <= 1) return '子代理'
  const n = index >= 1 && index <= count ? index : index + 1
  return `子代理 ${n}/${count}`
}

export function parseToolArgs(value: unknown): Record<string, unknown> | null {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    try {
      return parseToolArgs(JSON.parse(value))
    } catch {
      return { input: value }
    }
  }
  if (Array.isArray(value)) return { input: value.join(' ') }
  if (typeof value === 'object') return value as Record<string, unknown>
  return { input: String(value) }
}

export function toolArgsLine(args?: unknown, preview?: string) {
  const obj = parseToolArgs(args)
  const parts: string[] = []
  if (obj) {
    for (const [key, value] of Object.entries(obj)) {
      if (value == null || value === '') continue
      if (/^(task_id|session_id|id)$/i.test(key)) continue
      const text = Array.isArray(value)
        ? value.map(item => String(item)).join(' ')
        : typeof value === 'object'
          ? prettyJson(value)
          : String(value)
      const clipped = text.replace(/\s+/g, ' ').trim()
      if (!clipped) continue
      parts.push(`${key}: ${clipped}`)
    }
  }
  if (!parts.length && preview) return preview.replace(/\s+/g, ' ').trim()
  return parts.join(' · ')
}

export function jobStateLabel(job: { enabled?: boolean, paused?: boolean, state?: string, last_status?: string | null }) {
  if (job.paused || job.state === 'paused' || job.enabled === false) return '已暂停'
  if (job.state === 'error' || isJobFailed(job)) return '失败'
  return '已启用'
}

export function isJobEnabled(job: { enabled?: boolean, paused?: boolean, state?: string | null }) {
  if (job.enabled === false) return false
  if (job.paused || job.state === 'paused') return false
  return true
}

export function isJobFailed(job: { state?: string | null, last_status?: string | null, last_error?: string | null }) {
  const status = String(job.last_status || '').toLowerCase()
  if (job.state === 'error') return true
  if (job.last_error) return true
  return /error|fail|failed|blocked/.test(status)
}

function pushSkillName(names: string[], seen: Set<string>, value: unknown) {
  if (typeof value !== 'string') return
  const name = value.trim()
  if (!name || seen.has(name)) return
  seen.add(name)
  names.push(name)
}

export function parseJobSkills(job?: { skills?: unknown, skill?: unknown } | null) {
  const names: string[] = []
  const seen = new Set<string>()
  if (Array.isArray(job?.skills)) {
    for (const item of job.skills) pushSkillName(names, seen, item)
  } else {
    pushSkillName(names, seen, job?.skills)
  }
  pushSkillName(names, seen, job?.skill)
  return names
}

export function parseJobRepeat(job?: { repeat?: unknown } | null) {
  const raw = job?.repeat
  if (raw == null || raw === '') return { times: null as number | null, completed: 0 }
  if (typeof raw === 'number') {
    return { times: raw > 0 ? raw : null, completed: 0 }
  }
  if (typeof raw === 'string') {
    const times = Number(raw)
    return { times: Number.isFinite(times) && times > 0 ? times : null, completed: 0 }
  }
  if (typeof raw === 'object') {
    const rec = raw as { times?: unknown, completed?: unknown }
    const times = rec.times == null || rec.times === '' ? Number.NaN : Number(rec.times)
    const completed = Number(rec.completed)
    return {
      times: Number.isFinite(times) && times > 0 ? times : null,
      completed: Number.isFinite(completed) && completed > 0 ? completed : 0
    }
  }
  return { times: null as number | null, completed: 0 }
}

export function jobRepeatText(job?: { repeat?: unknown } | null) {
  const { times, completed } = parseJobRepeat(job)
  if (times == null) return '一直跑'
  if (completed > 0) return `${completed}/${times} 次`
  return times === 1 ? '1 次' : `${times} 次`
}

export function asSkillList(payload: unknown) {
  if (Array.isArray(payload)) return payload as { name?: string, description?: string, category?: string, enabled?: boolean }[]
  if (payload && typeof payload === 'object') {
    const rec = payload as Record<string, unknown>
    if (Array.isArray(rec.skills)) return rec.skills as { name?: string }[]
    if (Array.isArray(rec.data)) return rec.data as { name?: string }[]
    if (rec.skills && typeof rec.skills === 'object') {
      const grouped = rec.skills as Record<string, unknown>
      const rows: { name: string, category: string }[] = []
      for (const [category, names] of Object.entries(grouped)) {
        if (!Array.isArray(names)) continue
        for (const name of names) rows.push({ name: String(name), category })
      }
      if (rows.length) return rows
    }
  }
  return []
}
