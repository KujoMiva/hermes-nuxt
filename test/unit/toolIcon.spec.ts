import { describe, expect, it } from 'vitest'
import { toolIconName, toolRowIcon } from '~/utils/toolIcon'

describe('toolIconName', () => {
  it('maps desktop tool kinds onto lucide icons', () => {
    expect(toolIconName('web_search')).toBe('i-lucide-search')
    expect(toolIconName('web_extract')).toBe('i-lucide-globe')
    expect(toolIconName('terminal')).toBe('i-lucide-terminal')
    expect(toolIconName('read_file')).toBe('i-lucide-file')
    expect(toolIconName('browser_click')).toBe('i-lucide-mouse-pointer-click')
  })

  it('falls back by prefix then a wrench', () => {
    expect(toolIconName('browser_wait')).toBe('i-lucide-globe')
    expect(toolIconName('web_fetch')).toBe('i-lucide-globe')
    expect(toolIconName('mystery_tool')).toBe('i-lucide-wrench')
  })
})

describe('toolRowIcon', () => {
  it('lets running and failed status replace the tool glyph', () => {
    expect(toolRowIcon({ name: 'web_search', status: 'running' })).toBe('i-lucide-loader-circle')
    expect(toolRowIcon({ name: 'web_search', status: 'failed' })).toBe('i-lucide-circle-alert')
    expect(toolRowIcon({ name: 'web_search', status: 'completed' })).toBe('i-lucide-search')
  })
})
