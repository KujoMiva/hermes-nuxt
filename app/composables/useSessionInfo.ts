import { ofetch } from 'ofetch'
import type { PublicSession } from '#shared/types/gateway'

export function useSessionInfo() {
  const session = useState<PublicSession>('hermes-session', () => ({ loggedIn: false }))

  async function refresh() {
    session.value = await ofetch<PublicSession>('/api/session', {
      headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined
    })
    return session.value
  }

  async function logout() {
    await ofetch('/api/logout', { method: 'POST' })
    session.value = { loggedIn: false }
    await navigateTo('/login')
  }

  return { logout, refresh, session }
}
