import type { PublicSession } from '#shared/types/gateway'

export function useSessionInfo() {
  const session = useState<PublicSession>('hermes-session', () => ({ loggedIn: false }))

  async function refresh() {
    const requestFetch = import.meta.server ? useRequestFetch() : $fetch
    session.value = await requestFetch<PublicSession>('/api/session')
    return session.value
  }

  async function logout() {
    await $fetch('/api/logout', { method: 'POST' })
    session.value = { loggedIn: false }
    await navigateTo('/login')
  }

  return { logout, refresh, session }
}
