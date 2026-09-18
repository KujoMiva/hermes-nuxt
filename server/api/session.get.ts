import { defineEventHandler } from 'h3'
import { gatewayHostLabel } from '#shared/utils/remote-url'
import { getConnectionForEvent } from '../utils/session'

export default defineEventHandler((event) => {
  const connection = getConnectionForEvent(event)

  if (!connection) {
    return { loggedIn: false }
  }

  return {
    authMode: connection.authMode,
    baseUrl: connection.baseUrl,
    host: gatewayHostLabel(connection.baseUrl),
    loggedIn: true,
    user: connection.user,
    version: connection.version ?? null
  }
})
