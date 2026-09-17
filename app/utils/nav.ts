export function safeInternalPath(raw: unknown, fallback = '/') {
  if (typeof raw !== 'string') return fallback
  const path = raw.trim()
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return fallback
  if (path === '/login' || path.startsWith('/login?')) return fallback
  return path
}
