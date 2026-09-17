import { safeInternalPath } from '~/utils/nav'

export default defineNuxtRouteMiddleware(async (to) => {
  const { refresh, session } = useSessionInfo()

  if (!session.value.loggedIn) {
    await refresh()
  }

  if (to.path === '/login') {
    if (session.value.loggedIn) {
      return navigateTo(safeInternalPath(to.query.redirect))
    }
    return
  }

  if (!session.value.loggedIn) {
    return navigateTo({
      path: '/login',
      query: to.path === '/' ? undefined : { redirect: to.fullPath }
    })
  }
})
