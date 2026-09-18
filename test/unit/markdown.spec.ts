import { describe, expect, it } from 'vitest'
import { normalizeMarkdown, renderMarkdown } from '~/utils/markdown'

describe('normalizeMarkdown', () => {
  it('maps fullwidth emphasis markers', () => {
    expect(normalizeMarkdown('＊＊bold＊＊ and ＿italic＿')).toBe('**bold** and _italic_')
  })
})

describe('renderMarkdown', () => {
  it('renders headings, emphasis, and inline code', () => {
    const html = renderMarkdown('# Title\n\nA **bold** _hint_ and `code`.')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>hint</em>')
    expect(html).toContain('<code>code</code>')
  })

  it('renders lists, tasks, quotes, and tables', () => {
    const html = renderMarkdown([
      '- one',
      '- [x] done',
      '1. first',
      '> quoted',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |'
    ].join('\n'))

    expect(html).toContain('•')
    expect(html).toContain('☑')
    expect(html).toContain('1.')
    expect(html).toContain('md-quote')
    expect(html).toContain('<th>A</th>')
    expect(html).toContain('<td>1</td>')
  })

  it('highlights fenced code and skips the audio directive', () => {
    const html = renderMarkdown('[[audio_as_voice]]\n\n```js\nconst ready = true\n```')
    expect(html).not.toContain('audio_as_voice')
    expect(html).toContain('md-pre')
    expect(html).toContain('md-pre__lang')
    expect(html).toContain('js')
    expect(html).toContain('const')
    expect(html).toContain('true')
  })

  it('renders inline and block katex', () => {
    const inline = renderMarkdown('Energy $E=mc^2$ holds.')
    expect(inline).toContain('katex')
    expect(inline).not.toContain('$E=mc^2$')

    const block = renderMarkdown('$$\n\\frac{a}{b}\n$$')
    expect(block).toContain('katex-display')
  })

  it('renders local MEDIA paths as code and http MEDIA as images', () => {
    const local = renderMarkdown('MEDIA: /opt/data/images/cat.png')
    expect(local).toContain('<code>/opt/data/images/cat.png</code>')
    expect(local).not.toContain('/api/media')

    const remote = renderMarkdown('MEDIA: https://example.com/cat.png')
    expect(remote).toContain('<img src="https://example.com/cat.png"')
  })

  it('autolinks http urls and keeps authored labels', () => {
    const html = renderMarkdown('See [Docs](https://example.com/path) and https://example.com/other.')
    expect(html).toContain('href="https://example.com/path"')
    expect(html).toContain('>Docs</a>')
    expect(html).toContain('href="https://example.com/other"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer"')
  })

  it('strips scripts and unsafe urls', () => {
    const html = renderMarkdown([
      '<script>alert(1)</script>',
      '',
      '[click](javascript:alert(1))',
      '',
      '![x](data:text/html;base64,PHN2Zz4=)'
    ].join('\n'))

    expect(html.toLowerCase()).not.toContain('<script')
    expect(html).not.toContain('javascript:')
    expect(html).not.toMatch(/<img\b[^>]*data:text\/html/i)
    expect(html).toContain('md-muted')
    expect(html).toContain('click')
  })

  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('')
  })
})
