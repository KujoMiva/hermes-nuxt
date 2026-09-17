export default defineNuxtPlugin(() => {
  const { session, refresh } = useSessionInfo()
  const gateway = useGateway()

  if (import.meta.client) {
    void refresh().then(() => {
      if (session.value.loggedIn) {
        void gateway.ensureConnected()
          .then(() => Promise.allSettled([
            useSessions().refresh(),
            useProfiles().refresh()
          ]))
          .catch(() => {})
      }
    })
  }

  watch(() => session.value.loggedIn, (ok) => {
    if (!import.meta.client) return
    if (ok) {
      void gateway.ensureConnected()
        .then(() => Promise.allSettled([
          useSessions().refresh(),
          useProfiles().refresh()
        ]))
        .catch(() => {})
    } else {
      gateway.close()
    }
  })
})
