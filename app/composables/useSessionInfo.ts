import type { PublicSession } from '#shared/types/gateway'

export function useSessionInfo() {
  const session = useState<PublicSession>('hermes-session', () => ({ loggedIn: false }))
  const requestFetch = useRequestFetch()

  async function refresh() {
    session.value = await requestFetch<PublicSession>('/api/session')
    return session.value
  }

  async function logout() {
    await requestFetch('/api/logout', { method: 'POST' })
    session.value = { loggedIn: false }
    await navigateTo('/login')
  }

  return { logout, refresh, session }
}
