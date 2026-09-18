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
const label = computed(() => thoughtLabel(Boolean(props.pending), durationMs.value))
const elapsed = computed(() => (props.pending ? formatShortDuration(durationMs.value) : ''))

function toggle() {
  userOpen.value = !open.value
}
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
      class="thinking__body"
    >
      <pre class="thinking__text">{{ text }}</pre>
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
