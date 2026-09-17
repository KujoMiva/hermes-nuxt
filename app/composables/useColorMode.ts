export type ColorModePreference = 'light' | 'dark' | 'system'

export function useColorMode() {
  const preference = useCookie<ColorModePreference>('hermes-color-mode', {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    default: () => 'light'
  })
  const systemDark = useState('hermes-system-dark', () => false)

  const state = reactive({
    get preference(): ColorModePreference {
      return preference.value || 'light'
    },
    set preference(value: ColorModePreference) {
      preference.value = value
    },
    get value(): 'light' | 'dark' {
      if (state.preference === 'system') return systemDark.value ? 'dark' : 'light'
      return state.preference === 'dark' ? 'dark' : 'light'
    }
  })

  return state
}

export function syncSystemColorScheme() {
  const systemDark = useState('hermes-system-dark', () => false)
  if (!import.meta.client) return
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = media.matches
  media.addEventListener('change', (event) => {
    systemDark.value = event.matches
  })
}
