export default defineNuxtPlugin(() => {
  const { session, refresh } = useSessionInfo()
  const gateway = useGateway()

  function hydrateSurfaces() {
    return Promise.allSettled([
      useSessions().refresh(),
      useProfiles().refresh(),
      useChatController().rebindAfterReconnect()
    ])
  }

  if (import.meta.client) {
    void refresh().then(() => {
      if (session.value.loggedIn) {
        void gateway.ensureConnected()
          .then(() => hydrateSurfaces())
          .catch(() => {})
      }
    })
  }

  watch(() => session.value.loggedIn, (ok) => {
    if (!import.meta.client) return
    if (ok) {
      void gateway.ensureConnected()
        .then(() => hydrateSurfaces())
        .catch(() => {})
    } else {
      gateway.close()
    }
  })

  watch(() => gateway.state.value, (next, prev) => {
    if (!import.meta.client || next !== 'open' || prev === 'open' || !prev) {
      return
    }
    if (!session.value.loggedIn) {
      return
    }
    void hydrateSurfaces()
  })
})
