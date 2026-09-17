export type HermesEndpoint = {
  target: string
  profile: string
}

export function parseHermesEndpoint(raw: string): HermesEndpoint {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('请填写服务器地址')
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('Hermes 服务器地址无效')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅支持 http 或 https 连接')
  }

  let path = url.pathname.replace(/\/+$/, '') || '/'
  if (path === '/v1' || path.endsWith('/v1')) {
    path = path.replace(/\/v1$/, '') || '/'
  }

  const prefixed = path.match(/^\/p\/([^/]+)$/)
  if (prefixed) {
    const name = decodeURIComponent(prefixed[1] || '').trim()
    if (!name) throw new Error('Profile 名称无效')
    return {
      target: url.origin,
      profile: name === 'default' ? '' : name
    }
  }

  if (path === '/') {
    return { target: url.origin, profile: '' }
  }

  throw new Error('地址只需根路径，或 /p/{名称}/')
}

export function formatHermesEndpoint(target: string, profile = '') {
  let origin = target.trim().replace(/\/+$/, '').replace(/\/v1$/, '')
  let slug = profile.trim() === 'default' ? '' : profile.trim()
  try {
    const parsed = parseHermesEndpoint(target)
    origin = parsed.target
    if (!slug) slug = parsed.profile
  } catch {
    // keep the stripped origin when the value is not a full URL
  }
  if (!origin) return ''
  if (!slug) return origin
  return `${origin}/p/${encodeURIComponent(slug)}`
}

export function displayHermesEndpoint(target: string, profile = '') {
  const href = formatHermesEndpoint(target, profile)
  if (!href) return '未配置'
  try {
    const url = new URL(href)
    const path = url.pathname.replace(/\/+$/, '')
    return url.host + (path && path !== '/' ? path : '')
  } catch {
    return href.replace(/^https?:\/\//, '')
  }
}
