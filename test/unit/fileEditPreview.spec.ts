import { describe, expect, it } from 'vitest'
import { fileEditPreview, MAX_FILE_EDIT_PREVIEW_LINES, stripDiffFileHeaders } from '~/utils/fileEditPreview'
import { languageFromFilename } from '~/utils/mdSyntax'
import type { ChatToolEvent } from '~/types/hermes'

function tool(partial: Partial<ChatToolEvent> & Pick<ChatToolEvent, 'id' | 'name'>): ChatToolEvent {
  return { status: 'completed', ...partial }
}

describe('languageFromFilename', () => {
  it('maps common extensions onto highlighter languages', () => {
    expect(languageFromFilename('src/search_pan.py')).toBe('python')
    expect(languageFromFilename('App.vue')).toBe('ts')
    expect(languageFromFilename('notes.md')).toBe('')
  })
})

describe('fileEditPreview', () => {
  it('renders write_file content as numbered added lines', () => {
    const preview = fileEditPreview(tool({
      id: 'w1',
      name: 'write_file',
      args: {
        path: 'extract_links.py',
        content: 'import urllib.request\nimport re\n\nheaders = {}\n'
      }
    }))

    expect(preview).toMatchObject({
      added: 4,
      basename: 'extract_links.py',
      lang: 'python',
      removed: 0,
      truncated: 0
    })
    expect(preview?.lines).toEqual([
      { kind: 'add', no: 1, text: 'import urllib.request' },
      { kind: 'add', no: 2, text: 'import re' },
      { kind: 'add', no: 3, text: '' },
      { kind: 'add', no: 4, text: 'headers = {}' }
    ])
  })

  it('prefers file content over an inline diff for write_file', () => {
    const preview = fileEditPreview(tool({
      id: 'w2',
      name: 'write_file',
      args: { path: 'a.py', content: 'print(1)\n' },
      inlineDiff: '--- a/a.py\n+++ b/a.py\n@@ -1 +1 @@\n-print(0)\n+print(1)\n'
    }))

    expect(preview?.lines).toEqual([{ kind: 'add', no: 1, text: 'print(1)' }])
    expect(preview?.removed).toBe(0)
  })

  it('parses patch hunks with new-file line numbers', () => {
    const preview = fileEditPreview(tool({
      id: 'p1',
      name: 'patch',
      args: { path: 'src/app.ts' },
      inlineDiff: [
        'diff --git a/src/app.ts b/src/app.ts',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -10,3 +10,4 @@',
        ' keep',
        '-old',
        '+new',
        '+extra'
      ].join('\n')
    }))

    expect(preview).toMatchObject({
      added: 2,
      basename: 'app.ts',
      lang: 'ts',
      removed: 1
    })
    expect(preview?.lines).toEqual([
      { kind: 'ctx', no: 10, text: 'keep' },
      { kind: 'del', no: 11, text: 'old' },
      { kind: 'add', no: 11, text: 'new' },
      { kind: 'add', no: 12, text: 'extra' }
    ])
  })

  it('reads a path out of the +++ header when args omit it', () => {
    const preview = fileEditPreview(tool({
      id: 'p2',
      name: 'edit_file',
      inlineDiff: '+++ b/lib/util.go\n@@ -1 +1 @@\n-old\n+new\n'
    }))

    expect(preview?.basename).toBe('util.go')
    expect(preview?.lang).toBe('go')
  })

  it('returns null for tools that are not file edits', () => {
    expect(fileEditPreview(tool({
      id: 't1',
      name: 'terminal',
      args: { command: 'ls' }
    }))).toBeNull()
  })

  it('clamps very large writes and keeps the full added count', () => {
    const content = Array.from({ length: MAX_FILE_EDIT_PREVIEW_LINES + 12 }, (_, index) => `line ${index + 1}`).join('\n')
    const preview = fileEditPreview(tool({
      id: 'w3',
      name: 'write_file',
      args: { path: 'big.py', content }
    }))

    expect(preview?.added).toBe(MAX_FILE_EDIT_PREVIEW_LINES + 12)
    expect(preview?.lines).toHaveLength(MAX_FILE_EDIT_PREVIEW_LINES)
    expect(preview?.truncated).toBe(12)
    expect(preview?.lines.at(-1)?.no).toBe(MAX_FILE_EDIT_PREVIEW_LINES)
  })
})

describe('stripDiffFileHeaders', () => {
  it('drops git file headers up to the first hunk', () => {
    expect(stripDiffFileHeaders('diff --git a/a.py b/a.py\n--- a/a.py\n+++ b/a.py\n@@ -1 +1 @@\n+hi\n')).toBe('@@ -1 +1 @@\n+hi\n')
  })
})
