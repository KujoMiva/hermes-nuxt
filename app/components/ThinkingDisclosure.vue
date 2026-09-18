<script setup lang="ts">
import { thoughtLabel } from '~/utils/thinking'
import { formatShortDuration } from '~/utils/format'

const props = defineProps<{
  text: string
  pending?: boolean
  startedAt?: number
  endedAt?: number
}>()

const now = useNowTick(() => Boolean(props.pending))
const userOpen = ref<boolean | null>(null)
const sawLivePreview = ref(Boolean(props.pending))
const scrollEl = ref<HTMLElement | null>(null)
const contentEl = ref<HTMLElement | null>(null)

let observer: ResizeObserver | null = null
let detachScroll: (() => void) | null = null

watch(() => props.pending, (pending) => {
  if (pending) sawLivePreview.value = true
})

const durationMs = computed(() => {
  const start = props.startedAt
  if (start == null) return null
  if (props.pending) return Math.max(0, now.value - start)
  if (props.endedAt != null && props.endedAt >= start) return props.endedAt - start
  return null
})

const showPreview = computed(() => Boolean(props.pending || sawLivePreview.value))
const open = computed(() => userOpen.value ?? showPreview.value)
const isPreview = computed(() => userOpen.value === null && showPreview.value)
const label = computed(() => thoughtLabel(Boolean(props.pending), durationMs.value))
const elapsed = computed(() => (props.pending ? formatShortDuration(durationMs.value) : ''))

function toggle() {
  userOpen.value = !open.value
}

function clearObserver() {
  observer?.disconnect()
  observer = null
  detachScroll?.()
  detachScroll = null
}

async function bindPreviewScroll() {
  clearObserver()
  if (!open.value || !isPreview.value || typeof ResizeObserver === 'undefined') return
  await nextTick()
  const scroller = scrollEl.value
  const content = contentEl.value
  if (!scroller || !content) return
  let following = true
  const track = () => {
    following = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 32
  }
  observer = new ResizeObserver(() => {
    if (following) scroller.scrollTop = scroller.scrollHeight
  })
  observer.observe(content)
  scroller.addEventListener('scroll', track, { passive: true })
  detachScroll = () => scroller.removeEventListener('scroll', track)
  scroller.scrollTop = scroller.scrollHeight
}

watch([open, isPreview, scrollEl], () => {
  void bindPreviewScroll()
}, { immediate: true })

watch(() => props.text, async () => {
  if (!isPreview.value || !open.value) return
  await nextTick()
  const el = scrollEl.value
  if (el) el.scrollTop = el.scrollHeight
})

onBeforeUnmount(clearObserver)
</script>

<template>
  <div
    v-if="text.trim()"
    class="thinking"
    data-conversation-scaffold
  >
    <ChatScaffoldRow
      :open="open"
      toggleable
      @toggle="toggle"
    >
      <span :class="{ 'is-shimmer': pending }">{{ label }}</span>
      <template
        v-if="elapsed"
        #trailing
      >
        {{ elapsed }}
      </template>
    </ChatScaffoldRow>
    <div
      v-if="open"
      ref="scrollEl"
      class="thinking__body"
      :class="{ 'is-preview': isPreview }"
    >
      <pre
        ref="contentEl"
        class="thinking__text"
      >{{ text }}</pre>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.thinking {
  width: 100%;
  min-width: 0;
}

.thinking__body {
  margin-top: 0.2rem;
  min-width: 0;
  max-width: 100%;
  overflow: auto;
  overscroll-behavior: contain;

  &.is-preview {
    max-height: 10rem;
  }
}

.thinking__text {
  margin: 0;
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 0.8125rem;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
