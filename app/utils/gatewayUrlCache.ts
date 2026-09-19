const STORAGE_KEY = 'hermes-gateway-url'

function canUseStorage() {
  return typeof localStorage !== 'undefined'
}

export function readCachedGatewayUrl(): string {
  if (!canUseStorage()) {
    return ''
  }

  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || ''
  } catch {
    return ''
  }
}

export function writeCachedGatewayUrl(url: string) {
  if (!canUseStorage()) {
    return
  }

  const value = url.trim()

  if (!value) {
    return
  }

  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    // private mode / quota
  }
}
