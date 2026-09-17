export default defineNuxtPlugin(() => {
  const colorMode = useColorMode()

  if (import.meta.client) {
    syncSystemColorScheme()
  }

  useHead({
    htmlAttrs: {
      class: computed(() => colorMode.value === 'dark' ? 'dark' : '')
    },
    meta: computed(() => [{
      name: 'theme-color',
      content: colorMode.value === 'dark' ? '#141416' : '#fafaf9'
    }])
  })
})
