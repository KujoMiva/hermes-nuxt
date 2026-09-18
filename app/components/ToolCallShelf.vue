<script setup lang="ts">
import type { ChatToolEvent } from '~/types/hermes'
import type { AssistantShelfSegment } from '~/utils/assistantParts'
import { toolRowIcon } from '~/utils/toolIcon'
import { summarizeToolRun, toolTrailLine, visibleTools } from '~/utils/toolRun'

const props = defineProps<{
  segments: AssistantShelfSegment[]
  tools: ChatToolEvent[]
  live?: boolean
}>()

const { collapseDetails } = useRunDisplay()
const now = useNowTick(() => Boolean(props.live) || props.tools.some(item => item.status === 'running'))
const userOpen = ref<boolean | null>(null)

const live = computed(() => Boolean(props.live))
const summary = computed(() => {
  const text = summarizeToolRun(props.tools, live.value) || '调用了工具'
  const count = visibleTools(props.tools).length
  return count > 1 ? `${text}（${count}）` : text
})
const open = computed(() => userOpen.value ?? (live.value ? false : !collapseDetails.value))
const tickerLines = computed(() => props.tools.map((tool, index) => ({
  id: `${tool.id}-${index}`,
  tool,
  line: toolTrailLine(tool, now.value)
})))
const lastToolsIndex = computed(() => {
  let last = -1
  props.segments.forEach((segment, index) => {
    if (segment.type === 'tools') last = index
  })
  return last
})

function toggle() {
  userOpen.value = !open.value
}
</script>

<template>
  <div
    class="tool-shelf"
    data-conversation-scaffold
  >
    <ChatScaffoldRow
      :open="open"
      toggleable
      @toggle="toggle"
    >
      <span :class="{ 'is-shimmer': live }">{{ summary }}</span>
    </ChatScaffoldRow>

    <div
      v-if="live && !open"
      class="tool-shelf__ticker"
    >
      <div
        class="tool-shelf__reel"
        :style="{ '--tool-ticker-index': Math.max(0, tickerLines.length - 1) }"
      >
        <div
          v-for="item in tickerLines"
          :key="item.id"
          class="tool-shelf__tick"
        >
          <UiIcon
            :name="toolRowIcon(item.tool)"
            :size="14"
            :spin="item.tool.status === 'running'"
          />
          <span>{{ item.line }}</span>
        </div>
      </div>
    </div>

    <div
      v-if="open"
      class="tool-shelf__body"
    >
      <template
        v-for="(segment, index) in segments"
        :key="segment.key"
      >
        <ThinkingDisclosure
          v-if="segment.type === 'reasoning'"
          :text="segment.part.text"
          :pending="Boolean(segment.part.live)"
          :started-at="segment.part.startedAt"
          :ended-at="segment.part.endedAt"
        />
        <ToolRunSummary
          v-else
          :tools="segment.tools"
          :live="Boolean(live && index === lastToolsIndex)"
          embedded
        />
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tool-shelf {
  width: 100%;
  min-width: 0;
}

.tool-shelf__ticker {
  height: 1.35rem;
  overflow: hidden;
  margin-top: 0.1rem;
}

.tool-shelf__reel {
  transform: translateY(calc(var(--tool-ticker-index, 0) * -1.35rem));
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.tool-shelf__tick {
  display: flex;
  height: 1.35rem;
  align-items: center;
  gap: 0.35rem;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  white-space: nowrap;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :deep(.ui-icon) {
    flex-shrink: 0;
  }
}

.tool-shelf__body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0.2rem 0 0 0.35rem;
  padding: 0 0 0 0.7rem;
  border-left: 1px solid var(--color-border);
}

@media (prefers-reduced-motion: reduce) {
  .tool-shelf__reel {
    transition: none;
  }
}
</style>
