import { createError, defineEventHandler, readBody } from 'h3'
import { coerceRemoteUrlScheme } from '#shared/utils/remote-url'
import { probeGateway } from '../utils/gateway'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ url?: string }>(event)
  const url = coerceRemoteUrlScheme(String(body?.url || ''))

  if (!url) {
    throw createError({ statusCode: 400, message: '请输入网关 URL' })
  }

  return probeGateway(url)
})
