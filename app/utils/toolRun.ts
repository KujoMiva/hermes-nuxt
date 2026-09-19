import type { ChatToolEvent } from '~/types/hermes'
import { formatShortDuration, isMemorySearchTool, parseToolArgs, toolDisplayName } from './format'

type RunCategory = 'delegate' | 'edit' | 'explore' | 'other' | 'run'

const CATEGORY_ORDER: readonly RunCategory[] = ['edit', 'explore', 'run', 'delegate', 'other']

const CATEGORY_COPY: Record<RunCategory, { noun: [string, string], past: string, present: string }> = {
  delegate: { noun: ['任务', '个任务'], past: '委派了', present: '正在委派' },
  edit: { noun: ['文件', '个文件'], past: '编辑了', present: '正在编辑' },
  explore: { noun: ['文件', '个文件'], past: '查阅了', present: '正在查阅' },
  other: { noun: ['工具', '个工具'], past: '调用了', present: '正在调用' },
  run: { noun: ['命令', '条命令'], past: '运行了', present: '正在运行' }
}

const EXPLORE_TOOLS = new Set([
  'list_files',
  'read_file',
  'search_files',
  'session_search_recall',
  'vision_analyze',
  'web_extract',
  'web_search'
])

const FILE_EDIT_TOOLS = new Set(['edit_file', 'patch', 'write_file'])
const CARD_TOOLS = new Set(['clarify', 'delegate_task', 'image_generate', 'manage_connections'])
const SILENT_TOOLS = new Set(['react_to_message', 'todo', 'todo_list'])

export type ToolRunItem
  = | { kind: 'run', start: number, end: number }
    | { kind: 'card', index: number }

export function isFileEditTool(name: string) {
  return FILE_EDIT_TOOLS.has(name)
}

export function isCardTool(name: string) {
  return CARD_TOOLS.has(name) || isFileEditTool(name) || name === 'subagent'
}

export function isSilentTool(name: string) {
  return SILENT_TOOLS.has(name)
}

export function isThinkingTool(tool: Pick<ChatToolEvent, 'kind' | 'name'>) {
  return tool.kind === 'thinking' || tool.name === 'thinking' || tool.name === '_thinking'
}

export function isSubagentTool(tool: Pick<ChatToolEvent, 'kind' | 'name'>) {
  return tool.kind === 'subagent' || tool.name === 'subagent' || tool.name === 'delegate_task'
}

export function visibleTools(tools: ChatToolEvent[]) {
  return tools.filter((tool) => {
    if (isThinkingTool(tool)) return false
    if (isSilentTool(tool.name) && tool.status !== 'failed') return false
    return true
  })
}

export function splitRunItems(tools: ChatToolEvent[]): ToolRunItem[] {
  const items: ToolRunItem[] = []
  let run: Extract<ToolRunItem, { kind: 'run' }> | null = null

  tools.forEach((tool, index) => {
    if (!tool.name || isCardTool(tool.name)) {
      run = null
      items.push({ kind: 'card', index })
      return
    }
    if (run) {
      run.end = index
    } else {
      run = { kind: 'run', start: index, end: index }
      items.push(run)
    }
  })

  return items
}

function asRecord(value: unknown): Record<string, unknown> {
  return parseToolArgs(value) || {}
}

function firstStringField(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function compactPreview(value: string, max = 64) {
  const one = value.replace(/\s+/g, ' ').trim()
  if (!one) return ''
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

export function fileEditBasename(path: string) {
  const trimmed = path.replace(/[\\/]+$/, '')
  const parts = trimmed.split(/[\\/]/)
  return parts.at(-1) || path
}

function summarizeCommand(command: string) {
  const line = command.replace(/\s+/g, ' ').trim()
  if (!line) return ''
  return compactPreview(line, 48)
}

function toolCategory(name: string): RunCategory {
  if (isFileEditTool(name)) return 'edit'
  if (name === 'terminal' || name === 'execute_code') return 'run'
  if (name === 'delegate_task' || name === 'subagent') return 'delegate'
  if (EXPLORE_TOOLS.has(name) || name.startsWith('browser_')) return 'explore'
  return 'other'
}

function isPending(tool: ChatToolEvent) {
  return tool.status === 'running'
}

export function toolContext(tool: ChatToolEvent) {
  const args = asRecord(tool.args)
  const name = tool.name
  if (toolCategory(name) === 'run') {
    return summarizeCommand(firstStringField(args, ['command', 'code']))
      || compactPreview(tool.preview || tool.summary || '', 64)
  }
  if (name === 'search_files' || name === 'web_search' || name === 'session_search_recall') {
    return firstStringField(args, ['query', 'pattern', 'glob'])
      || compactPreview(tool.preview || tool.summary || '', 64)
  }
  const path = firstStringField(args, ['path', 'file', 'filepath', 'target'])
  if (path) return fileEditBasename(path)
  return firstStringField(args, ['query', 'url', 'pattern', 'goal', 'skill'])
    || compactPreview(tool.preview || tool.summary || '', 64)
}

export function formatToolCall(name: string, context = '') {
  const label = toolDisplayName(name)
  const preview = compactPreview(context, 64)
  return preview ? `${label}("${preview}")` : label
}

export function toolElapsedMs(tool: ChatToolEvent, now: number) {
  const started = tool.startedAt
  if (!started) return 0
  if (tool.status === 'running') return Math.max(0, now - started)
  if (tool.endedAt && tool.endedAt > started) return tool.endedAt - started
  return 0
}

export function toolTrailLine(tool: ChatToolEvent, now: number) {
  const call = formatToolCall(tool.name, toolContext(tool))
  const elapsed = toolElapsedMs(tool, now)
  const took = elapsed > 0 ? ` (${formatShortDuration(elapsed)})` : ''
  const fail = tool.status === 'failed' ? ' · 失败' : ''
  return `${call}${took}${fail}`
}

function clause(category: RunCategory, tools: ChatToolEvent[], live: boolean) {
  const copy = CATEGORY_COPY[category]
  const verb = live ? copy.present : copy.past
  const target = tools.length === 1 ? toolContext(tools[0]!) : ''
  if (target && (live || category !== 'run')) return `${verb} ${target}`
  return `${verb} ${tools.length} ${copy.noun[tools.length === 1 ? 0 : 1]}`
}

export function summarizeToolRun(tools: readonly ChatToolEvent[], live: boolean) {
  const narrating = live ? (tools.find(isPending) ?? tools.at(-1)) : undefined
  const liveCategory = narrating ? toolCategory(narrating.name) : null
  const byCategory = new Map<RunCategory, ChatToolEvent[]>()
  const extra: string[] = []
  const memorySearches: ChatToolEvent[] = []
  const skillViews: ChatToolEvent[] = []

  for (const tool of tools) {
    if (tool.name === 'skill_view') {
      skillViews.push(tool)
      continue
    }
    if (isMemorySearchTool(tool.name)) {
      memorySearches.push(tool)
      continue
    }
    const category = toolCategory(tool.name)
    const group = byCategory.get(category)
    if (group) group.push(tool)
    else byCategory.set(category, [tool])
  }

  if (memorySearches.length) {
    const searching = Boolean(live && memorySearches.some(tool => tool === narrating))
    extra.push(
      memorySearches.length === 1
        ? (searching ? '正在搜索记忆' : '搜索了记忆')
        : (searching ? `正在搜索 ${memorySearches.length} 条记忆` : `搜索了 ${memorySearches.length} 条记忆`)
    )
  }
  if (skillViews.length) {
    extra.push(live && skillViews.some(tool => tool === narrating) ? '正在查看技能' : '查看了技能')
  }

  const clauses = [
    ...extra,
    ...CATEGORY_ORDER.flatMap((category) => {
      const group = byCategory.get(category)
      return group ? [clause(category, group, category === liveCategory)] : []
    })
  ]

  const failed = tools.filter(tool => tool.status === 'failed').length
  if (failed) clauses.push(`${failed} 次失败`)
  return clauses.join('，')
}

export function isToolResultFailed(result: unknown) {
  if (result == null) return false
  if (typeof result === 'object') {
    const rec = result as Record<string, unknown>
    if (rec.success === true || rec.ok === true) return false
    if (rec.success === false || rec.ok === false) return true
    if (typeof rec.error === 'string' && rec.error.trim()) return true
  }
  return false
}
