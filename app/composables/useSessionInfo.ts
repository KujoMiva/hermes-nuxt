import type { PublicSession } from '#shared/types/gateway'
import { writeCachedGatewayUrl } from '~/utils/gatewayUrlCache'

export function useSessionInfo() {
  const session = useState<PublicSession>('hermes-session', () => ({ loggedIn: false }))
  const requestFetch = useRequestFetch()

  async function refresh() {
    session.value = await requestFetch<PublicSession>('/api/session')
    if (session.value.loggedIn && session.value.baseUrl) {
      writeCachedGatewayUrl(session.value.baseUrl)
    }
    return session.value
  }

  async function logout() {
    await requestFetch('/api/logout', { method: 'POST' })
    session.value = { loggedIn: false }
    await navigateTo('/login')
  }

  return { logout, refresh, session }
}
