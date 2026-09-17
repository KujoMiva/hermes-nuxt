<script setup lang="ts">
import type { ChatToolEvent } from '~/types/hermes'
import { formatShortDuration, prettyJson, subagentTitle, toolArgsLine, toolDisplayName } from '~/utils/format'

const props = defineProps<{
  tools: ChatToolEvent[]
}>()
const { collapseDetails } = useRunDisplay()

const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | null = null

const running = computed(() => props.tools.some(item => item.status === 'running'))
const failed = computed(() => !running.value && props.tools.some(item => item.status === 'failed'))

const statusLabel = computed(() => {
  if (running.value) return '执行中'
  if (failed.value) return '执行失败'
  return '执行完毕'
})

const startedAt = computed(() => {
  const starts = props.tools
    .map(item => item.startedAt)
    .filter((value): value is number => Number.isFinite(value))
  return starts.length ? Math.min(...starts) : null
})

const durationMs = computed(() => {
  const start = startedAt.value
  if (start == null) return 0
  const finishes = props.tools
    .map(item => item.endedAt || item.startedAt)
    .filter((value): value is number => Number.isFinite(value))
  const end = running.value
    ? now.value
    : (finishes.length ? Math.max(...finishes) : start)
  return Math.max(0, end - start)
})

const summaryText = computed(() => {
  const parts = [statusLabel.value]
  const duration = formatShortDuration(durationMs.value)
  if (duration) parts.push(duration)
  parts.push(`${props.tools.length} 个事件`)
  return parts.join(' · ')
})

const showBar = computed(() => collapseDetails.value)

const open = ref(false)
const expandedId = ref<string | null>(null)

function thinkingPreview(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function itemElapsed(tool: ChatToolEvent, index: number) {
  const started = tool.startedAt
  if (!started) return 0
  if (tool.status === 'running') return Math.max(0, now.value - started)
  const nextStarted = props.tools[index + 1]?.startedAt
  if (nextStarted && nextStarted > started) return nextStarted - started
  if (tool.endedAt && tool.endedAt > started) return tool.endedAt - started
  return 0
}

const items = computed(() => props.tools.map((tool, index) => {
  const elapsed = itemElapsed(tool, index)
  const duration = formatShortDuration(elapsed)
  const thinking = tool.kind === 'thinking' || tool.name === 'thinking' || tool.name === '_thinking'
  const subagent = tool.kind === 'subagent' || tool.name === 'subagent'
  const detail = thinking
    ? thinkingPreview(tool.preview || '')
    : (subagent
        ? (tool.summary || tool.goal || tool.preview || toolArgsLine(tool.args, tool.preview))
        : toolArgsLine(tool.args, tool.preview))
  const full = thinking
    ? (tool.preview || '').trim()
    : (prettyJson(tool.args).trim() || tool.preview || detail)
  return {
    id: `${tool.id}-${index}`,
    status: tool.status,
    thinking,
    subagent,
    title: thinking ? '思考过程' : subagent ? subagentTitle(tool) : toolDisplayName(tool.name),
    detail,
    full,
    expandable: Boolean(detail || full),
    childSessionId: tool.childSessionId || '',
    meta: duration
  }
}))

const visibleItems = computed(() => collapseDetails.value
  ? items.value.filter(item => item.status === 'running')
  : items.value)
const showTimeline = computed(() => visibleItems.value.length > 0)

function itemIcon(item: { status: string, thinking: boolean, subagent: boolean }) {
  if (item.status === 'running') return 'i-lucide-loader-circle'
  if (item.status === 'failed') return 'i-lucide-x'
  if (item.thinking) return 'i-lucide-brain'
  if (item.subagent) return 'i-lucide-bot'
  return 'i-lucide-check'
}

function toggleItem(id: string, expandable: boolean) {
  if (!expandable) return
  expandedId.value = expandedId.value === id ? null : id
}

async function openChildSession(id: string) {
  if (!id) return
  open.value = false
  await navigateTo(`/chat/${id}`)
}

function liveItem() {
  return items.value.findLast?.(item => item.status === 'running')
    || items.value.find(item => item.status === 'running')
}

function revealLiveItem() {
  const live = liveItem()
  if (live) expandedId.value = live.id
}

watch(open, (value) => {
  if (!value) {
    expandedId.value = null
    return
  }
  revealLiveItem()
})

watch(running, (value) => {
  if (!import.meta.client) return
  if (tick) {
    clearInterval(tick)
    tick = null
  }
  if (value) {
    now.value = Date.now()
    tick = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  }
}, { immediate: true })

watch(() => liveItem()?.id, (id) => {
  if (!id) return
  if (!collapseDetails.value || open.value) expandedId.value = id
})

onBeforeUnmount(() => {
  if (tick) clearInterval(tick)
})
</script>

<template>
  <div
    class="run-summary"
    :class="{ 'is-collapsed': collapseDetails }"
  >
    <button
      v-if="showBar"
      type="button"
      class="run-bar"
      :class="{
        'is-running': running,
        'is-failed': failed
      }"
      aria-label="查看执行情况"
      @click="open = true"
    >
      <span class="run-bar__mark">
        <UiIcon
          :name="running ? 'i-lucide-loader-circle' : failed ? 'i-lucide-x' : 'i-lucide-check'"
          :size="12"
          :spin="running"
        />
      </span>
      <span class="run-bar__label">{{ summaryText }}</span>
      <UiIcon
        name="i-lucide-chevron-right"
        :size="16"
      />
    </button>

    <ol
      v-if="showTimeline"
      class="run-timeline"
    >
      <li
        v-for="item in visibleItems"
        :key="item.id"
        class="run-timeline__item"
        :class="{
          'is-running': item.status === 'running',
          'is-failed': item.status === 'failed',
          'is-thinking': item.thinking,
          'is-subagent': item.subagent,
          'is-open': item.status === 'running' || expandedId === item.id
        }"
      >
        <span class="run-timeline__mark">
          <UiIcon
            :name="itemIcon(item)"
            :size="11"
            :spin="item.status === 'running'"
          />
        </span>
        <button
          type="button"
          class="run-timeline__hit"
          :disabled="!item.expandable"
          :aria-expanded="item.status === 'running' || expandedId === item.id"
          @click="toggleItem(item.id, item.expandable)"
        >
          <div class="run-timeline__head">
            <span class="run-timeline__name">{{ item.title }}</span>
            <span
              v-if="item.meta"
              class="run-timeline__meta"
            >{{ item.meta }}</span>
            <UiIcon
              v-if="item.expandable && item.status !== 'running'"
              name="i-lucide-chevron-down"
              :size="14"
              class="run-timeline__chevron"
            />
          </div>
          <p
            v-if="item.full || item.detail"
            class="run-timeline__detail"
          >
            {{ item.status === 'running' || expandedId === item.id ? (item.full || item.detail) : item.detail }}
          </p>
        </button>
        <button
          v-if="item.childSessionId && item.status !== 'running'"
          type="button"
          class="run-timeline__child"
          @click="openChildSession(item.childSessionId)"
        >
          查看子代理记录
        </button>
      </li>
    </ol>

    <UiSheet
      v-model:open="open"
      labelled-by="tool-run-title"
    >
      <div class="run-sheet">
        <p
          id="tool-run-title"
          class="run-sheet__title"
        >
          执行情况
        </p>
        <ol class="run-timeline run-timeline--sheet">
          <li
            v-for="item in items"
            :key="item.id"
            class="run-timeline__item"
            :class="{
              'is-running': item.status === 'running',
              'is-failed': item.status === 'failed',
              'is-thinking': item.thinking,
              'is-subagent': item.subagent,
              'is-open': expandedId === item.id
            }"
          >
            <span class="run-timeline__mark">
              <UiIcon
                :name="itemIcon(item)"
                :size="11"
                :spin="item.status === 'running'"
              />
            </span>
            <button
              type="button"
              class="run-timeline__hit"
              :disabled="!item.expandable"
              :aria-expanded="expandedId === item.id"
              @click="toggleItem(item.id, item.expandable)"
            >
              <div class="run-timeline__head">
                <span class="run-timeline__name">{{ item.title }}</span>
                <span
                  v-if="item.meta"
                  class="run-timeline__meta"
                >{{ item.meta }}</span>
                <UiIcon
                  v-if="item.expandable"
                  name="i-lucide-chevron-down"
                  :size="14"
                  class="run-timeline__chevron"
                />
              </div>
              <p
                v-if="item.detail || item.full"
                class="run-timeline__detail"
              >
                {{ expandedId === item.id ? item.full : item.detail }}
              </p>
            </button>
            <button
              v-if="item.childSessionId && item.status !== 'running'"
              type="button"
              class="run-timeline__child"
              @click="openChildSession(item.childSessionId)"
            >
              查看子代理记录
            </button>
          </li>
        </ol>
      </div>
    </UiSheet>
  </div>
</template>

<style lang="scss" scoped>
.run-summary {
  width: 100%;
}

.run-bar {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.5rem;
  border: 0;
  border-radius: 0.75rem;
  background: var(--color-elevated);
  padding: 0.5rem 0.7rem;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  text-align: start;
  cursor: pointer;
}

.run-bar__label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--color-text-toned);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-bar__mark,
.run-timeline__mark {
  display: inline-flex;
  width: 1.15rem;
  height: 1.15rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill);
  background: var(--color-success);
  color: var(--color-text-invert);

  :deep(.ui-icon) {
    display: block;
    color: inherit;
  }
}

.run-timeline__item.is-thinking .run-timeline__mark {
  background: var(--color-accented);
  color: var(--color-text-strong);
}

.run-timeline__item.is-subagent .run-timeline__mark {
  background: var(--color-text-muted);
}

.run-bar.is-running .run-bar__mark,
.run-timeline__item.is-running .run-timeline__mark {
  background: var(--color-warning);
}

.run-bar.is-failed .run-bar__mark,
.run-timeline__item.is-failed .run-timeline__mark {
  background: var(--color-error);
}

.run-timeline__child {
  display: inline-flex;
  margin-top: 0.35rem;
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--color-text-toned);
  font-size: 0.75rem;
  text-decoration: underline;
  text-underline-offset: 0.15em;
  cursor: pointer;
}

.run-sheet {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.run-sheet__title {
  margin: 0 0 0.85rem;
  font-size: 1.05rem;
  font-weight: 650;
}

.run-timeline {
  margin: 0;
  padding: 0 0 0.15rem 1.35rem;
  list-style: none;
}

.run-timeline--sheet {
  overflow-x: hidden;
  overflow-y: auto;
  max-height: min(58vh, 30rem);
  padding-bottom: 0.35rem;
}

.run-summary.is-collapsed .run-timeline:not(.run-timeline--sheet) {
  margin-top: 0.65rem;
}

.run-timeline__item {
  position: relative;
  min-width: 0;
  padding: 0 0 1.05rem;

  &:last-child {
    padding-bottom: 0.15rem;
  }

  &:not(:last-child)::before {
    content: '';
    position: absolute;
    top: 1.15rem;
    bottom: 0;
    left: -0.97rem;
    width: 1px;
    background: var(--color-border);
  }
}

.run-timeline__mark {
  position: absolute;
  top: 0.1rem;
  left: -1.35rem;
  width: 1.05rem;
  height: 1.05rem;
}

.run-timeline__hit {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  text-align: start;

  &:not(:disabled) {
    cursor: pointer;
  }

  &:disabled {
    cursor: default;
  }
}

.run-timeline__head {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 0.55rem;
}

.run-timeline__name {
  min-width: 0;
  color: var(--color-text-strong);
  font-size: 0.875rem;
  font-weight: 650;
}

.run-timeline__meta {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  white-space: nowrap;
}

.run-timeline__chevron {
  flex-shrink: 0;
  color: var(--color-text-dimmed);
  transition: transform 0.15s ease;
}

.run-timeline__item.is-open .run-timeline__chevron {
  transform: rotate(180deg);
}

.run-timeline__detail {
  overflow: hidden;
  min-width: 0;
  max-width: 100%;
  margin: 0.18rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-timeline__item.is-open .run-timeline__detail {
  overflow-x: hidden;
  overflow-y: auto;
  max-height: 14rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>
