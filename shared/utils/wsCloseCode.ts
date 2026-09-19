export const GATEWAY_UNAUTHORIZED_CLOSE = 4401

export function websocketCloseCode(code?: number, fallback = 1000) {
  if (code === 1000) {
    return 1000
  }

  if (typeof code !== 'number' || !Number.isInteger(code)) {
    return fallback
  }

  if (code >= 3000 && code <= 4999) {
    return code
  }

  if (code >= 1001 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) {
    return code
  }

  return fallback
}

export function websocketCloseReason(reason?: string, fallback = '') {
  const text = (reason || fallback).slice(0, 100)
  return text
}
