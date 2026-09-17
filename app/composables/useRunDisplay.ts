export function useRunDisplay() {
  const stored = useCookie<boolean>('hermes-collapse-run-details', {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    default: () => false,
    decode: value => value === '1' || value === 'true',
    encode: value => (value ? '1' : '0')
  })

  const collapseDetails = computed({
    get: () => stored.value === true,
    set: (value: boolean) => {
      stored.value = value
    }
  })

  return { collapseDetails }
}
