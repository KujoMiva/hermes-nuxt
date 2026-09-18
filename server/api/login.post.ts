import { createError, defineEventHandler, isError, readBody } from 'h3'
import { gatewayHostLabel, normalizeRemoteBaseUrl } from '#shared/utils/remote-url'
import { deriveLoginKind, GatewayHttpError, passwordLogin, probeGateway, tokenLogin } from '../utils/gateway'
import { persistConnection } from '../utils/session'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    password?: string
    provider?: string
    token?: string
    url?: string
    username?: string
  }>(event)

  let baseUrl: string

  try {
    baseUrl = normalizeRemoteBaseUrl(String(body?.url || ''))
  } catch (error) {
    throw createError({
      statusCode: 400,
      message: error instanceof Error ? error.message : '网关 URL 无效'
    })
  }

  const probe = await probeGateway(baseUrl)

  if (!probe.reachable) {
    throw createError({
      statusCode: 502,
      message: probe.error || '无法连接到该 Hermes 网关'
    })
  }

  const kind = deriveLoginKind(probe)

  try {
    if (kind === 'password') {
      const username = String(body?.username || '').trim()
      const password = String(body?.password || '')
      const provider
        = String(body?.provider || '').trim()
          || probe.providers.find(item => item.supportsPassword)?.name
          || 'basic'

      if (!username || !password) {
        throw createError({ statusCode: 400, message: '请输入用户名和密码' })
      }

      const connection = await passwordLogin(baseUrl, { password, provider, username })
      connection.version = probe.version
      persistConnection(event, connection)

      return {
        authMode: connection.authMode,
        baseUrl: connection.baseUrl,
        host: gatewayHostLabel(connection.baseUrl),
        loggedIn: true,
        user: connection.user,
        version: connection.version
      }
    }

    if (kind === 'oauth') {
      throw createError({
        statusCode: 400,
        message: '该网关使用 OAuth，请点击登录按钮完成浏览器授权'
      })
    }

    const token = String(body?.token || '').trim()

    if (!token) {
      throw createError({ statusCode: 400, message: '请粘贴远程网关的会话令牌' })
    }

    const connection = await tokenLogin(baseUrl, token, probe.version)
    persistConnection(event, connection)

    return {
      authMode: connection.authMode,
      baseUrl: connection.baseUrl,
      host: gatewayHostLabel(connection.baseUrl),
      loggedIn: true,
      user: connection.user,
      version: connection.version
    }
  } catch (error) {
    if (isError(error)) {
      throw error
    }

    if (error instanceof GatewayHttpError) {
      const message
        = error.statusCode === 401
          ? '凭证无效，请检查用户名、密码或会话令牌'
          : error.message
      throw createError({ statusCode: error.statusCode, message })
    }

    throw createError({
      statusCode: 502,
      message: error instanceof Error ? error.message : '登录失败'
    })
  }
})
