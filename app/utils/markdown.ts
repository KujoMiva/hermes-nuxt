import katex from 'katex'
import DOMPurify from 'isomorphic-dompurify'
import { highlightTokens, isHighlightable } from './mdSyntax'
import {
  isTitleFetchable,
  normalizeExternalUrl,
  peekCachedLinkTitle,
  pickAuthoredLabel,
  urlSlugTitleLabel
} from './linkTitle'

const FENCE_RE = /^\s*(`{3,}|~{3,})(.*)$/
const FENCE_CLOSE_RE = /^\s*(`{3,}|~{3,})\s*$/
const HR_RE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+\s*)?$/
const SETEXT_RE = /^\s{0,3}(=+|-+)\s*$/
const FOOTNOTE_RE = /^\[\^([^\]]+)\]:\s*(.*)$/
const DEF_RE = /^\s*:\s+(.+)$/
const BULLET_RE = /^(\s*)[-+*]\s+(.*)$/
const TASK_RE = /^\[( |x|X)\]\s+(.*)$/
const NUMBERED_RE = /^(\s*)(\d+)[.)]\s+(.*)$/
const QUOTE_RE = /^\s*(?:>\s*)+/
const TABLE_DIVIDER_CELL_RE = /^:?-{3,}:?$/
const MD_URL_RE = '((?:[^\\s()]|\\([^\\s()]*\\))+?)'
const MD_IDENTIFIER_RE = '[A-Za-z_][A-Za-z0-9_]*'
const MD_DUNDER_IDENTIFIER_RE = `(?:${MD_IDENTIFIER_RE}__(?!\\w))`
const MD_UNDERSCORE_BOLD_RE = `(?<!\\w)__(?!${MD_DUNDER_IDENTIFIER_RE})(.+?)__(?!\\w)`
const MD_UNDERSCORE_ITALIC_RE = `(?<![\\w_])_(?!_)(.+?)(?<!_)_(?![\\w_])`
const MATH_BLOCK_OPEN_RE = /^\s*(\$\$|\\\[)(.*)$/
const MATH_BLOCK_CLOSE_DOLLAR_RE = /^(.*?)\$\$\s*$/
const MATH_BLOCK_CLOSE_BRACKET_RE = /^(.*?)\\\]\s*$/
const MEDIA_LINE_RE = /^\s*[`"']?MEDIA:\s*(\S+?)[`"']?\s*$/
const AUDIO_DIRECTIVE_RE = /^\s*\[\[audio_as_voice\]\]\s*$/
const INLINE_RE = new RegExp(
  [
    `!\\[(.*?)\\]\\(${MD_URL_RE}\\)`,
    `\\[(.+?)\\]\\(${MD_URL_RE}\\)`,
    `<((?:https?:\\/\\/|mailto:)[^>\\s]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})>`,
    `~~(.+?)~~`,
    `\`([^\\\`]+)\``,
    `\\*\\*(.+?)\\*\\*`,
    MD_UNDERSCORE_BOLD_RE,
    `\\*(.+?)\\*`,
    MD_UNDERSCORE_ITALIC_RE,
    `==(.+?)==`,
    `\\[\\^([^\\]]+)\\]`,
    `\\^([^^\\s][^^]*?)\\^`,
    `~([A-Za-z0-9]{1,8})~`,
    `(https?:\\/\\/[^\\s<]+)`,
    `(?<!\\$)\\$([^\\s$](?:[^$\\n]*?[^\\s$])?)\\$(?!\\$)`,
    `\\\\\\(([^\\n]+?)\\\\\\)`
  ].join('|'),
  'g'
)

const VS15 = 0xFE0E
const VS16 = 0xFE0F
const TEXT_DEFAULT_EMOJI = new Set<number>([
  0x00A9, 0x00AE, 0x203C, 0x2049, 0x2122, 0x2139, 0x2194, 0x2195, 0x2196, 0x2197, 0x2198, 0x2199, 0x21A9, 0x21AA,
  0x2328, 0x23CF, 0x23ED, 0x23EE, 0x23EF, 0x23F1, 0x23F2, 0x23F8, 0x23F9, 0x23FA, 0x24C2, 0x25AA, 0x25AB, 0x25B6,
  0x25C0, 0x25FB, 0x25FC, 0x2600, 0x2601, 0x2602, 0x2603, 0x2604, 0x260E, 0x2611, 0x2618, 0x261D, 0x2620, 0x2622,
  0x2623, 0x2626, 0x262A, 0x262E, 0x262F, 0x2638, 0x2639, 0x263A, 0x2640, 0x2642, 0x265F, 0x2660, 0x2663, 0x2665,
  0x2666, 0x2668, 0x267B, 0x267E, 0x2692, 0x2694, 0x2695, 0x2696, 0x2697, 0x2699, 0x269B, 0x269C, 0x26A0, 0x26A7,
  0x26B0, 0x26B1, 0x26C8, 0x26CF, 0x26D1, 0x26D3, 0x26D4, 0x26E9, 0x26F0, 0x26F1, 0x26F4, 0x26F7, 0x26F8, 0x26F9,
  0x2702, 0x2708, 0x2709, 0x270C, 0x270D, 0x270F, 0x2712, 0x2714, 0x2716, 0x271D, 0x2721, 0x2733, 0x2734, 0x2744,
  0x2747, 0x2763, 0x2764, 0x27A1, 0x2934, 0x2935, 0x2B05, 0x2B06, 0x2B07, 0x3030, 0x303D, 0x3297, 0x3299
])
const MAYBE_TEXT_EMOJI_RE
  = /[\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u2328\u23CF\u23ED-\u23EF\u23F1\u23F2\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB\u25FC\u2600-\u2604\u260E\u2611\u2618\u261D\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u2692\u2694-\u2697\u2699\u269B\u269C\u26A0\u26A7\u26B0\u26B1\u26C8\u26CF\u26D1\u26D3\u26D4\u26E9\u26F0\u26F1\u26F4\u26F7-\u26F9\u2702\u2708\u2709\u270C\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2733\u2734\u2744\u2747\u2763\u2764\u27A1\u2934\u2935\u2B05-\u2B07\u3030\u303D\u3297\u3299]/

const MAX_NEST = 6
const PURIFY = {
  USE_PROFILES: { html: true, mathMl: true, svg: true },
  ADD_DATA_URI_TAGS: ['img'],
  ADD_ATTR: [
    'class',
    'style',
    'aria-hidden',
    'aria-label',
    'encoding',
    'xmlns',
    'target',
    'rel',
    'colspan',
    'rowspan',
    'data-md-title'
  ]
}

type Kind = 'blank' | 'code' | 'heading' | 'list' | 'paragraph' | 'quote' | 'rule' | 'table' | null

function ensureEmojiPresentation(text: string): string {
  if (!text || !MAYBE_TEXT_EMOJI_RE.test(text)) return text
  let out: string | null = null
  let last = 0
  let i = 0
  while (i < text.length) {
    const cp = text.codePointAt(i)
    if (cp == null) break
    const size = cp > 0xFFFF ? 2 : 1
    if (TEXT_DEFAULT_EMOJI.has(cp)) {
      const next = text.codePointAt(i + size)
      if (next !== VS16 && next !== VS15) {
        out ??= ''
        out += text.slice(last, i + size) + '\uFE0F'
        last = i + size
      }
    }
    i += size
  }
  return out == null ? text : out + text.slice(last)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function indentDepth(source: string) {
  return Math.floor(source.replace(/\t/g, '  ').length / 2)
}

function splitRow(row: string) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim())
}

function isTableDivider(row: string) {
  const cells = splitRow(row)
  return cells.length > 1 && cells.every(cell => TABLE_DIVIDER_CELL_RE.test(cell))
}

function autolinkUrl(raw: string) {
  return raw.startsWith('mailto:') || raw.startsWith('http') || !raw.includes('@')
    ? raw
    : `mailto:${raw}`
}

function safeHref(raw: string) {
  const href = normalizeExternalUrl(raw)
  if (/^(https?:|mailto:)/i.test(href)) return href
  return null
}

function safeImageSrc(raw: string) {
  const href = raw.trim()
  if (!href) return null
  if (/^data:image\//i.test(href)) return href
  if (/^https?:/i.test(href)) {
    const next = normalizeExternalUrl(href)
    return next || href
  }
  return null
}

function renderMediaLine(raw: string) {
  const src = safeImageSrc(raw)
  if (!src) return `<div class="md-line md-media"><code>${escapeHtml(raw)}</code></div>`
  return `<div class="md-line md-media"><img src="${escapeHtml(src)}" alt=""></div>`
}

function renderMdLink(rawUrl: string, label?: string, depth = 0) {
  const href = safeHref(rawUrl)
  if (!href) return label != null ? renderInline(label, depth) : escapeHtml(rawUrl)
  if (/^mailto:/i.test(href)) {
    const text = (label || '').trim() || href.replace(/^mailto:/i, '')
    return `<a href="${escapeHtml(href)}" rel="noreferrer">${escapeHtml(text)}</a>`
  }
  const authored = pickAuthoredLabel(label, href)
  if (authored) {
    return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${renderInline(authored, depth)}</a>`
  }
  const cached = peekCachedLinkTitle(href)
  const initial = cached || urlSlugTitleLabel(href)
  const pending = isTitleFetchable(href) && cached === undefined
  const attr = pending ? ` data-md-title="${escapeHtml(href)}"` : ''
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer"${attr}>${escapeHtml(initial)}</a>`
}

function renderKatex(tex: string, displayMode: boolean) {
  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode,
      strict: false
    })
  } catch {
    return `<code>${escapeHtml(tex)}</code>`
  }
}

function highlightLine(line: string, lang: string) {
  return highlightTokens(line, lang).map(([kind, text]) => {
    const body = escapeHtml(text)
    return kind ? `<span class="md-syn md-syn--${kind}">${body}</span>` : body
  }).join('')
}

function renderInline(text: string, depth = 0): string {
  if (depth > MAX_NEST) return escapeHtml(text)
  let html = ''
  let last = 0
  for (const match of text.matchAll(INLINE_RE)) {
    const index = match.index ?? 0
    if (index > last) html += escapeHtml(text.slice(last, index))

    const imageAlt = match[1]
    const imageHref = match[2]
    const linkText = match[3]
    const linkHref = match[4]
    const auto = match[5]
    const strike = match[6]
    const code = match[7]
    const bold = match[8] ?? match[9]
    const italic = match[10] ?? match[11]
    const mark = match[12]
    const footnote = match[13]
    const sup = match[14]
    const sub = match[15]
    const bareUrl = match[16]
    const dollarMath = match[17]
    const parenMath = match[18]

    if (imageAlt != null && imageHref) {
      const href = safeImageSrc(imageHref)
      html += href
        ? `<img src="${escapeHtml(href)}" alt="${escapeHtml(imageAlt)}">`
        : `<span class="md-muted">[image: ${escapeHtml(imageAlt)}] ${escapeHtml(imageHref)}</span>`
    } else if (linkText != null && linkHref) {
      html += renderMdLink(linkHref, linkText, depth + 1)
    } else if (auto) {
      html += renderMdLink(autolinkUrl(auto), auto.replace(/^mailto:/, ''))
    } else if (strike != null) {
      html += `<del>${renderInline(strike, depth + 1)}</del>`
    } else if (code != null) {
      html += `<code>${escapeHtml(code)}</code>`
    } else if (bold != null) {
      html += `<strong>${renderInline(bold, depth + 1)}</strong>`
    } else if (italic != null) {
      html += `<em>${renderInline(italic, depth + 1)}</em>`
    } else if (mark != null) {
      html += `<mark>${renderInline(mark, depth + 1)}</mark>`
    } else if (footnote != null) {
      html += `<span class="md-muted">[${escapeHtml(footnote)}]</span>`
    } else if (sup != null) {
      html += `<sup>${escapeHtml(sup)}</sup>`
    } else if (sub != null) {
      html += `<sub>${escapeHtml(sub)}</sub>`
    } else if (bareUrl) {
      const url = bareUrl.replace(/[),.;:!?]+$/, '')
      html += renderMdLink(url)
      if (url.length < bareUrl.length) html += escapeHtml(bareUrl.slice(url.length))
    } else if (dollarMath != null || parenMath != null) {
      html += renderKatex(dollarMath ?? parenMath ?? '', false)
    }

    last = index + match[0].length
  }
  if (last < text.length) html += escapeHtml(text.slice(last))
  return html
}

function renderTable(rows: string[][]) {
  const header = rows[0]
  if (!header?.length) return ''
  const body = rows.slice(1)
  const headCells = header.map(cell => `<th>${renderInline(cell)}</th>`).join('')
  const bodyRows = body.map((row) => {
    const cells = header.map((_, index) => `<td>${renderInline(row[index] ?? '')}</td>`).join('')
    return `<tr>${cells}</tr>`
  }).join('')
  const bodyHtml = bodyRows ? `<tbody>${bodyRows}</tbody>` : ''
  return `<div class="md-table-wrap"><table><thead><tr>${headCells}</tr></thead>${bodyHtml}</table></div>`
}

function isAsciiQrArt(block: string[]) {
  const rows = block.map(line => line.replace(/\s+$/g, '')).filter(line => line.length)
  if (rows.length < 10) return false
  const widths = rows.map(line => Array.from(line).length)
  const width = Math.max(...widths)
  if (width < 10) return false
  const aligned = widths.filter(item => Math.abs(item - width) <= 2).length
  if (aligned < rows.length * 0.75) return false
  let cells = 0
  let blocks = 0
  for (const row of rows) {
    for (const ch of row) {
      if (ch === ' ' || ch === '\t') continue
      cells += 1
      const code = ch.codePointAt(0) || 0
      if (
        (code >= 0x2580 && code <= 0x259F)
        || (code >= 0x2800 && code <= 0x28FF)
        || ch === '#'
        || ch === '@'
      ) blocks += 1
    }
  }
  return cells >= 80 && blocks / cells >= 0.55
}

function renderFence(lang: string, block: string[], depth: number) {
  if (['md', 'markdown'].includes(lang)) {
    return renderBlocks(block.join('\n'), depth + 1)
  }
  const qr = isAsciiQrArt(block)
  const isDiff = !qr && lang === 'diff'
  const highlighted = !qr && !isDiff && isHighlightable(lang)
  const label = lang && !isDiff && !qr ? `<div class="md-pre__lang">${escapeHtml(lang)}</div>` : ''
  const lines = block.map((line) => {
    if (highlighted) return highlightLine(line, lang)
    if (!isDiff) return escapeHtml(line)
    const add = line.startsWith('+')
    const del = line.startsWith('-')
    const hunk = line.startsWith('@@')
    const cls = add ? 'md-diff md-diff--add' : del ? 'md-diff md-diff--del' : hunk ? 'md-diff md-diff--hunk' : 'md-diff'
    return `<span class="${cls}">${escapeHtml(line)}</span>`
  }).join('\n')
  const cls = qr ? 'md-pre md-pre--qr' : 'md-pre'
  return `<div class="${cls}">${label}<pre><code>${lines}</code></pre></div>`
}

function renderBlocks(text: string, depth = 0): string {
  if (depth > MAX_NEST) return `<p>${escapeHtml(text)}</p>`
  const lines = ensureEmojiPresentation(text).split('\n')
  const nodes: string[] = []
  let prevKind: Kind = null
  let i = 0

  const gap = () => {
    if (nodes.length && prevKind !== 'blank') {
      nodes.push('<div class="md-gap"></div>')
      prevKind = 'blank'
    }
  }

  const start = (kind: Exclude<Kind, null | 'blank'>) => {
    if (prevKind && prevKind !== 'blank' && prevKind !== kind) gap()
    prevKind = kind
  }

  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (!line.trim()) {
      gap()
      i++
      continue
    }

    if (AUDIO_DIRECTIVE_RE.test(line)) {
      i++
      continue
    }

    const media = line.match(MEDIA_LINE_RE)?.[1]
    if (media) {
      start('paragraph')
      nodes.push(renderMediaLine(media))
      i++
      continue
    }

    const fence = line.match(FENCE_RE)
    if (fence) {
      const marker = fence[1] || ''
      const char = marker[0] as '`' | '~'
      const len = marker.length
      const lang = (fence[2] || '').trim().toLowerCase()
      const block: string[] = []
      for (i++; i < lines.length; i++) {
        const close = lines[i]?.match(FENCE_CLOSE_RE)?.[1]
        if (close && close[0] === char && close.length >= len) break
        block.push(lines[i] ?? '')
      }
      if (i < lines.length) i++
      start(['md', 'markdown'].includes(lang) ? 'paragraph' : 'code')
      nodes.push(renderFence(lang, block, depth))
      continue
    }

    const mathOpen = line.match(MATH_BLOCK_OPEN_RE)
    if (mathOpen) {
      const opener = mathOpen[1] || ''
      const closeRe = opener === '$$' ? MATH_BLOCK_CLOSE_DOLLAR_RE : MATH_BLOCK_CLOSE_BRACKET_RE
      const headRest = mathOpen[2] ?? ''
      const sameLineClose = headRest.match(closeRe)
      if (sameLineClose) {
        start('code')
        const inner = (sameLineClose[1] || '').trim()
        nodes.push(inner ? renderKatex(inner, true) : '')
        i++
        continue
      }
      let closeIdx = -1
      for (let j = i + 1; j < lines.length; j++) {
        if (closeRe.test(lines[j] ?? '')) {
          closeIdx = j
          break
        }
      }
      if (closeIdx < 0) {
        start('paragraph')
        nodes.push(`<div class="md-line">${renderInline(line)}</div>`)
        i++
        continue
      }
      const block: string[] = []
      if (headRest.trim()) block.push(headRest)
      for (let j = i + 1; j < closeIdx; j++) block.push(lines[j] ?? '')
      const tail = (lines[closeIdx]?.match(closeRe)?.[1] || '').trimEnd()
      if (tail.trim()) block.push(tail)
      start('code')
      nodes.push(renderKatex(block.join('\n'), true))
      i = closeIdx + 1
      continue
    }

    const headingMatch = line.match(HEADING_RE)
    if (headingMatch) {
      const level = Math.min((headingMatch[1] || '#').length, 6)
      start('heading')
      nodes.push(`<h${level}>${renderInline(headingMatch[2] || '')}</h${level}>`)
      i++
      continue
    }

    if (i + 1 < lines.length && SETEXT_RE.test(lines[i + 1] ?? '')) {
      const level = (lines[i + 1] || '').trim().startsWith('=') ? 1 : 2
      start('heading')
      nodes.push(`<h${level}>${renderInline(line.trim())}</h${level}>`)
      i += 2
      continue
    }

    if (HR_RE.test(line)) {
      start('rule')
      nodes.push('<hr>')
      i++
      continue
    }

    const footnote = line.match(FOOTNOTE_RE)
    if (footnote) {
      start('list')
      nodes.push(`<div class="md-line md-muted">[${escapeHtml(footnote[1] || '')}] ${renderInline(footnote[2] || '')}</div>`)
      i++
      while (i < lines.length && /^\s{2,}\S/.test(lines[i] ?? '')) {
        nodes.push(`<div class="md-line md-muted md-indent">${renderInline((lines[i] || '').trim())}</div>`)
        i++
      }
      continue
    }

    if (i + 1 < lines.length && DEF_RE.test(lines[i + 1] ?? '')) {
      start('list')
      nodes.push(`<div class="md-line"><strong>${escapeHtml(line.trim())}</strong></div>`)
      i++
      while (i < lines.length) {
        const def = lines[i]?.match(DEF_RE)?.[1]
        if (!def) break
        nodes.push(`<div class="md-line md-def"><span class="md-muted"> · </span>${renderInline(def)}</div>`)
        i++
      }
      continue
    }

    const bullet = line.match(BULLET_RE)
    if (bullet) {
      start('list')
      const task = (bullet[2] || '').match(TASK_RE)
      const marker = task ? (task[1]?.toLowerCase() === 'x' ? '☑' : '☐') : '•'
      const pad = indentDepth(bullet[1] || '') * 1.25
      const indent = pad ? ` style="padding-inline-start:${pad}rem"` : ''
      nodes.push(`<div class="md-li"${indent}><span class="md-muted">${marker} </span>${renderInline(task ? task[2] || '' : bullet[2] || '')}</div>`)
      i++
      continue
    }

    const numbered = line.match(NUMBERED_RE)
    if (numbered) {
      start('list')
      const pad = indentDepth(numbered[1] || '') * 1.25
      const indent = pad ? ` style="padding-inline-start:${pad}rem"` : ''
      nodes.push(`<div class="md-li"${indent}><span class="md-muted">${escapeHtml(numbered[2] || '')}. </span>${renderInline(numbered[3] || '')}</div>`)
      i++
      continue
    }

    if (QUOTE_RE.test(line)) {
      start('quote')
      const quoteLines: Array<{ depth: number, text: string }> = []
      while (i < lines.length && QUOTE_RE.test(lines[i] ?? '')) {
        const prefix = lines[i]?.match(QUOTE_RE)?.[0] ?? ''
        quoteLines.push({
          depth: (prefix.match(/>/g) ?? []).length,
          text: (lines[i] || '').slice(prefix.length)
        })
        i++
      }
      nodes.push(quoteLines.map((item) => {
        const pad = Math.max(0, item.depth - 1) * 1.25
        const indent = pad ? ` style="padding-inline-start:${pad}rem"` : ''
        return `<div class="md-quote"${indent}><span class="md-muted">│ </span>${renderInline(item.text)}</div>`
      }).join(''))
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1] ?? '')) {
      start('table')
      const rows: string[][] = [splitRow(line)]
      for (i += 2; i < lines.length && (lines[i] || '').includes('|') && (lines[i] || '').trim(); i++) {
        rows.push(splitRow(lines[i] || ''))
      }
      nodes.push(renderTable(rows))
      continue
    }

    if (/^<\/?details\b/i.test(line)) {
      i++
      continue
    }

    const summary = line.match(/^<summary>(.*?)<\/summary>$/i)?.[1]
    if (summary) {
      start('paragraph')
      nodes.push(`<div class="md-line md-muted">▶ ${escapeHtml(summary)}</div>`)
      i++
      continue
    }

    if (/^<\/?[^>]+>$/.test(line.trim())) {
      start('paragraph')
      nodes.push(`<div class="md-line md-muted">${escapeHtml(line.trim())}</div>`)
      i++
      continue
    }

    if (line.includes('|') && line.trim().startsWith('|')) {
      start('table')
      const rows: string[][] = []
      while (i < lines.length && (lines[i] || '').trim().startsWith('|')) {
        const row = (lines[i] || '').trim()
        if (!/^[|\s:-]+$/.test(row)) rows.push(splitRow(row))
        i++
      }
      if (rows.length) nodes.push(renderTable(rows))
      continue
    }

    start('paragraph')
    nodes.push(`<div class="md-line">${renderInline(line)}</div>`)
    i++
  }

  return nodes.join('')
}

export function normalizeMarkdown(source: string) {
  return ensureEmojiPresentation(
    source
      .replace(/\uFF0A/g, '*')
      .replace(/\uFF3F/g, '_')
  )
}

export function renderMarkdown(source: string) {
  const html = renderBlocks(normalizeMarkdown(source || ''))
  return DOMPurify.sanitize(html, PURIFY)
}
