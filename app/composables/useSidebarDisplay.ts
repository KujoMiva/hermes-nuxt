export function useSidebarDisplay() {
  const stored = useCookie<boolean>('hermes-sidebar-collapsed', {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    default: () => false,
    decode: value => value === '1' || value === 'true',
    encode: value => (value ? '1' : '0')
  })

  const collapsed = computed({
    get: () => stored.value === true,
    set: (value: boolean) => {
      stored.value = value
    }
  })

  return { collapsed }
}
