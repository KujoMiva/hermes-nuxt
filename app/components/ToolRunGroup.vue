<script setup lang="ts">
import type { ChatToolEvent } from '~/types/hermes'
import { prettyJson, toolArgsLine } from '~/utils/format'
import { toolRowIcon } from '~/utils/toolIcon'
import { summarizeToolRun, toolTrailLine, visibleTools } from '~/utils/toolRun'

const props = defineProps<{
  tools: ChatToolEvent[]
  live?: boolean
  embedded?: boolean
}>()

const { collapseDetails } = useRunDisplay()
const now = useNowTick(() => Boolean(props.live) || props.tools.some(item => item.status === 'running'))
const userOpen = ref<boolean | null>(null)
const expandedId = ref<string | null>(null)

const live = computed(() => Boolean(props.live))
const summary = computed(() => {
  const text = summarizeToolRun(props.tools, live.value) || '调用了工具'
  const count = visibleTools(props.tools).length
  return count > 1 ? `${text}（${count}）` : text
})
const open = computed(() => props.embedded ? true : userOpen.value ?? (live.value ? false : !collapseDetails.value))
const lines = computed(() => props.tools.map((tool, index) => ({
  id: `${tool.id}-${index}`,
  tool,
  line: toolTrailLine(tool, now.value),
  detail: prettyJson(tool.args).trim() || toolArgsLine(tool.args, tool.preview || tool.summary)
})))

function toggle() {
  userOpen.value = !open.value
}

function toggleLine(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

watch(() => props.tools.length, (count) => {
  if (live.value && count) {
    const last = lines.value.at(-1)
    if (last) expandedId.value = last.id
  }
})
</script>

<template>
  <div
    class="tool-run"
    :class="{ 'is-embedded': embedded }"
    data-conversation-scaffold
  >
    <ChatScaffoldRow
      v-if="!embedded"
      :open="open"
      toggleable
      @toggle="toggle"
    >
      <span :class="{ 'is-shimmer': live }">{{ summary }}</span>
    </ChatScaffoldRow>

    <div
      v-if="live && !open && !embedded"
      class="tool-ticker"
    >
      <div
        class="tool-ticker__reel"
        :style="{ '--tool-ticker-index': Math.max(0, lines.length - 1) }"
      >
        <div
          v-for="item in lines"
          :key="item.id"
          class="tool-ticker__row"
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

    <ol
      v-if="open"
      class="tool-trail"
    >
      <li
        v-for="item in lines"
        :key="item.id"
        class="tool-trail__item"
        :class="{
          'is-running': item.tool.status === 'running',
          'is-failed': item.tool.status === 'failed',
          'is-open': expandedId === item.id
        }"
      >
        <button
          type="button"
          class="tool-trail__hit"
          :disabled="!item.detail"
          :aria-expanded="expandedId === item.id"
          @click="toggleLine(item.id)"
        >
          <UiIcon
            :name="toolRowIcon(item.tool)"
            :size="14"
            :spin="item.tool.status === 'running'"
          />
          <span class="tool-trail__label">{{ item.line }}</span>
        </button>
        <pre
          v-if="expandedId === item.id && item.detail"
          class="tool-trail__detail"
        >{{ item.detail }}</pre>
      </li>
    </ol>
  </div>
</template>

<style lang="scss" scoped>
.tool-run {
  width: 100%;
  min-width: 0;

  &.is-embedded .tool-trail {
    margin: 0;
    padding: 0;
    border: 0;
  }
}

.tool-ticker {
  height: 1.35rem;
  overflow: hidden;
  margin-top: 0.1rem;
}

.tool-ticker__reel {
  transform: translateY(calc(var(--tool-ticker-index, 0) * -1.35rem));
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.tool-ticker__row {
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
}

.tool-trail {
  margin: 0.2rem 0 0 0.35rem;
  padding: 0 0 0 0.7rem;
  border-left: 1px solid var(--color-border);
  list-style: none;
}

.tool-trail__item {
  min-width: 0;
  padding: 0.05rem 0;
}

.tool-trail__hit {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 0.35rem;
  overflow: hidden;
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: start;

  &:not(:disabled) {
    cursor: pointer;
  }

  :deep(.ui-icon) {
    flex-shrink: 0;
    color: var(--color-text-muted);
  }
}

.tool-trail__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-trail__item.is-failed .tool-trail__hit {
  color: var(--color-error);

  :deep(.ui-icon) {
    color: var(--color-error);
  }
}

.tool-trail__item.is-running .tool-trail__hit {
  color: var(--color-text-toned);
}

.tool-trail__detail {
  margin: 0.2rem 0 0.35rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (prefers-reduced-motion: reduce) {
  .tool-ticker__reel {
    transition: none;
  }
}
</style>
