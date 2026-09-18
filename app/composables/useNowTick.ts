import { onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

export function useNowTick(active: MaybeRefOrGetter<boolean>, interval = 250) {
  const now = ref(Date.now())
  let tick: ReturnType<typeof setInterval> | null = null

  function stop() {
    if (!tick) return
    clearInterval(tick)
    tick = null
  }

  watch(() => toValue(active), (on) => {
    if (!import.meta.client) return
    stop()
    if (!on) return
    now.value = Date.now()
    tick = setInterval(() => {
      now.value = Date.now()
    }, interval)
  }, { immediate: true })

  onBeforeUnmount(stop)

  return now
}
