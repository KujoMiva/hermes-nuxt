import { createError, defineEventHandler, getQuery, getRequestURL, sendRedirect } from 'h3'
import { coerceRemoteUrlScheme } from '#shared/utils/remote-url'
import { deriveLoginKind, probeGateway } from '../../utils/gateway'
import {
  buildNativeAuthorizeUrl,
  generateOauthState,
  generatePkcePair,
  nativeCallbackRedirectUri
} from '../../utils/pkce'
import { rememberPendingOauth } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawUrl = coerceRemoteUrlScheme(String(query.url || ''))

  if (!rawUrl) {
    throw createError({ statusCode: 400, message: '请输入网关 URL' })
  }

  const probe = await probeGateway(rawUrl)

  if (!probe.reachable || deriveLoginKind(probe) !== 'oauth') {
    throw createError({
      statusCode: 400,
      message: probe.error || '该网关不使用 OAuth 登录'
    })
  }

  const pkce = generatePkcePair()
  const state = generateOauthState()
  const redirectUri = nativeCallbackRedirectUri(getRequestURL(event))
  const provider = probe.providers.find(item => !item.supportsPassword)?.name

  rememberPendingOauth(state, {
    baseUrl: probe.baseUrl,
    expiresAt: Date.now() + 10 * 60 * 1000,
    verifier: pkce.verifier
  })

  return sendRedirect(
    event,
    buildNativeAuthorizeUrl(probe.baseUrl, {
      challenge: pkce.challenge,
      provider,
      redirectUri,
      state
    })
  )
})
