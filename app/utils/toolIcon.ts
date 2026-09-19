import type { ChatToolEvent } from '~/types/hermes'

const TOOL_ICONS: Record<string, string> = {
  browser_click: 'i-lucide-mouse-pointer-click',
  browser_fill: 'i-lucide-globe',
  browser_navigate: 'i-lucide-globe',
  browser_snapshot: 'i-lucide-globe',
  browser_take_screenshot: 'i-lucide-image',
  browser_type: 'i-lucide-globe',
  clarify: 'i-lucide-circle-help',
  cronjob: 'i-lucide-clock',
  delegate_task: 'i-lucide-bot',
  edit_file: 'i-lucide-pencil',
  execute_code: 'i-lucide-terminal',
  image_generate: 'i-lucide-image',
  list_files: 'i-lucide-files',
  mem0_search: 'i-lucide-brain',
  memory: 'i-lucide-brain',
  memory_search: 'i-lucide-brain',
  honcho_search: 'i-lucide-brain',
  patch: 'i-lucide-pencil',
  read_file: 'i-lucide-file',
  search_files: 'i-lucide-search',
  session_search_recall: 'i-lucide-search',
  subagent: 'i-lucide-bot',
  terminal: 'i-lucide-terminal',
  todo: 'i-lucide-list-checks',
  todo_list: 'i-lucide-list-checks',
  vision_analyze: 'i-lucide-eye',
  web_extract: 'i-lucide-globe',
  web_search: 'i-lucide-search',
  write_file: 'i-lucide-pencil'
}

const PREFIX_ICONS = [
  { prefix: 'browser_', icon: 'i-lucide-globe' },
  { prefix: 'honcho_', icon: 'i-lucide-brain' },
  { prefix: 'mem0_', icon: 'i-lucide-brain' },
  { prefix: 'supermemory-', icon: 'i-lucide-brain' },
  { prefix: 'supermemory_', icon: 'i-lucide-brain' },
  { prefix: 'web_', icon: 'i-lucide-globe' }
] as const

export function toolIconName(name?: string) {
  const key = String(name || '').trim()
  if (!key) return 'i-lucide-wrench'
  const exact = TOOL_ICONS[key]
  if (exact) return exact
  const prefix = PREFIX_ICONS.find(item => key.startsWith(item.prefix))
  return prefix?.icon || 'i-lucide-wrench'
}

export function toolRowIcon(tool: Pick<ChatToolEvent, 'name' | 'status'>) {
  if (tool.status === 'running') return 'i-lucide-loader-circle'
  if (tool.status === 'failed') return 'i-lucide-circle-alert'
  return toolIconName(tool.name)
}
