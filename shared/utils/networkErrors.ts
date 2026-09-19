const IGNORABLE_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ECONNABORTED',
  'ERR_STREAM_PREMATURE_CLOSE',
  'UND_ERR_SOCKET'
])

const IGNORABLE_MESSAGE = /ECONNRESET|EPIPE|ECONNABORTED|premature close/i

export function isIgnorableNetworkError(error: unknown) {
  if (error == null) {
    return false
  }

  if (typeof error !== 'object') {
    return IGNORABLE_MESSAGE.test(String(error))
  }

  const err = error as { code?: unknown, cause?: unknown, message?: unknown }
  if (typeof err.code === 'string' && IGNORABLE_CODES.has(err.code)) {
    return true
  }

  if (typeof err.message === 'string' && IGNORABLE_MESSAGE.test(err.message)) {
    return true
  }

  return err.cause !== undefined && isIgnorableNetworkError(err.cause)
}

let installed = false

export function installIgnorableNetworkErrorGuard() {
  if (installed || typeof process === 'undefined' || typeof process.prependListener !== 'function') {
    return
  }

  installed = true

  process.prependListener('uncaughtException', (error: unknown) => {
    if (isIgnorableNetworkError(error)) {
      return
    }

    if (process.listenerCount('uncaughtException') <= 1) {
      console.error(error)
      process.exit(1)
    }
  })

  process.prependListener('unhandledRejection', (reason: unknown) => {
    if (isIgnorableNetworkError(reason)) {
      return
    }
  })
}
