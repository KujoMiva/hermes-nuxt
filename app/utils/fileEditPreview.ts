import type { ChatToolEvent } from '~/types/hermes'
import { parseToolArgs } from './format'
import { languageFromFilename } from './mdSyntax'
import { fileEditBasename, isFileEditTool } from './toolRun'

export const MAX_FILE_EDIT_PREVIEW_LINES = 400

export type FileEditLineKind = 'add' | 'ctx' | 'del'

export interface FileEditLine {
  kind: FileEditLineKind
  no: number | null
  text: string
}

export interface FileEditPreview {
  added: number
  basename: string
  lang: string
  lines: FileEditLine[]
  path: string
  removed: number
  truncated: number
}

const PATH_KEYS = ['path', 'file', 'filepath', 'resolved_path', 'target'] as const
const CONTENT_KEYS = ['content', 'contents', 'new_content', 'new_text'] as const
const DIFF_KEYS = ['inline_diff', 'diff'] as const

const DIFF_HEADER_PREFIXES = [
  'diff --git',
  'index ',
  '--- ',
  '+++ ',
  'similarity ',
  'rename ',
  'new file',
  'deleted file'
]

function firstString(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function splitFileLines(text: string) {
  if (!text) return []
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

function isArrowHeaderLine(line: string) {
  const trimmed = line.trim()
  return trimmed.includes('→') && /^\S.*→\s*\S+$/.test(trimmed) && !/^[+\-@]/.test(trimmed)
}

export function stripDiffFileHeaders(diff: string) {
  const lines = diff.split('\n')
  let start = 0
  for (; start < lines.length; start += 1) {
    const line = lines[start] ?? ''
    if (line.startsWith('@@')) break
    if (line.trim() === '' || isArrowHeaderLine(line) || DIFF_HEADER_PREFIXES.some(prefix => line.startsWith(prefix))) {
      continue
    }
    break
  }
  return lines.slice(start).join('\n')
}

function pathFromDiff(diff: string) {
  for (const line of diff.split('\n')) {
    const match = /^\+\+\+\s+(?:b\/)?(.+)$/.exec(line.trim())
    const path = match?.[1]?.trim()
    if (path && path !== '/dev/null' && path !== 'dev/null') return path
  }
  return ''
}

function diffKind(line: string): FileEditLineKind {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'add'
  if (line.startsWith('-') && !line.startsWith('---')) return 'del'
  return 'ctx'
}

function stripDiffMarker(line: string) {
  if (diffKind(line) !== 'ctx' || line.startsWith(' ')) return line.slice(1)
  return line
}

function parseUnifiedDiff(diff: string) {
  const lines: FileEditLine[] = []
  let added = 0
  let removed = 0
  let oldNo = 1
  let newNo = 1
  let started = false

  for (const raw of stripDiffFileHeaders(diff).split('\n')) {
    if (raw.startsWith('@@')) {
      const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
      if (!match) continue
      oldNo = Number(match[1])
      newNo = Number(match[2])
      if (started) lines.push({ kind: 'ctx', no: null, text: '' })
      started = true
      continue
    }
    if (raw.startsWith('\\')) continue

    const kind = diffKind(raw)
    const text = stripDiffMarker(raw)
    if (kind === 'add') {
      added += 1
      lines.push({ kind, no: newNo, text })
      newNo += 1
    } else if (kind === 'del') {
      removed += 1
      lines.push({ kind, no: oldNo, text })
      oldNo += 1
    } else {
      lines.push({ kind: 'ctx', no: newNo, text })
      oldNo += 1
      newNo += 1
    }
    started = true
  }

  return { added, lines, removed }
}

function previewFromLines(
  path: string,
  added: number,
  removed: number,
  lines: FileEditLine[]
): FileEditPreview | null {
  if (!lines.length) return null
  const visible = lines.slice(0, MAX_FILE_EDIT_PREVIEW_LINES)
  return {
    added,
    basename: fileEditBasename(path) || 'file',
    lang: languageFromFilename(path),
    lines: visible,
    path,
    removed,
    truncated: Math.max(0, lines.length - visible.length)
  }
}

export function fileEditPreview(tool: Pick<ChatToolEvent, 'args' | 'inlineDiff' | 'name' | 'result'>): FileEditPreview | null {
  if (!isFileEditTool(tool.name)) return null
  const args = parseToolArgs(tool.args) || {}
  const result = parseToolArgs(tool.result) || {}
  const path = firstString(args, PATH_KEYS) || firstString(result, PATH_KEYS) || pathFromDiff(tool.inlineDiff || firstString(result, DIFF_KEYS))
  const content = firstString(args, CONTENT_KEYS)
  if (content) {
    const raw = splitFileLines(content)
    return previewFromLines(
      path,
      raw.length,
      0,
      raw.map((text, index) => ({ kind: 'add', no: index + 1, text }))
    )
  }

  const diff = (tool.inlineDiff || firstString(args, DIFF_KEYS) || firstString(result, DIFF_KEYS)).trim()
  if (!diff) return null
  const parsed = parseUnifiedDiff(diff)
  return previewFromLines(path, parsed.added, parsed.removed, parsed.lines)
}
