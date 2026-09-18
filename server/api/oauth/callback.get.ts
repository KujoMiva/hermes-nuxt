import { defineEventHandler, getQuery, sendRedirect } from 'h3'
import { redeemNativeLogin } from '../../utils/gateway'
import { persistConnection, takePendingOauth } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const error = String(query.error || '')
  const code = String(query.code || '')
  const state = String(query.state || '')

  if (error) {
    const description = String(query.error_description || error)
    return sendRedirect(event, `/?error=${encodeURIComponent(`网关拒绝登录：${description}`)}`)
  }

  const pending = takePendingOauth(state)

  if (!pending) {
    return sendRedirect(event, `/?error=${encodeURIComponent('登录状态已过期，请重试')}`)
  }

  if (!code) {
    return sendRedirect(event, `/?error=${encodeURIComponent('登录回调缺少授权码')}`)
  }

  try {
    const connection = await redeemNativeLogin(pending.baseUrl, {
      code,
      verifier: pending.verifier
    })
    persistConnection(event, connection)
    return sendRedirect(event, '/chat')
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'OAuth 登录失败'
    return sendRedirect(event, `/?error=${encodeURIComponent(message)}`)
  }
})
