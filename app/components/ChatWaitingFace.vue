<script setup lang="ts">
import { KAOMOJI_FACES, KAOMOJI_TICK_MS } from '~/utils/kaomoji'

const index = ref(import.meta.client ? Math.floor(Math.random() * KAOMOJI_FACES.length) : 0)
const face = computed(() => KAOMOJI_FACES[index.value] || KAOMOJI_FACES[0])

let tick: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  tick = setInterval(() => {
    index.value = (index.value + 1) % KAOMOJI_FACES.length
  }, KAOMOJI_TICK_MS)
})

onBeforeUnmount(() => {
  if (!tick) return
  clearInterval(tick)
  tick = null
})
</script>

<template>
  <span
    class="waiting-face"
    data-conversation-scaffold
    role="status"
    aria-label="正在回复"
  >{{ face }}</span>
</template>

<style lang="scss" scoped>
.waiting-face {
  display: inline-block;
  min-height: 1.5rem;
  padding-inline: 0.25rem;
  font-size: 0.875rem;
  line-height: 1.5rem;
  white-space: nowrap;
}
</style>
