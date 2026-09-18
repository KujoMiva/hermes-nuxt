<script setup lang="ts">
import type { ChatToolEvent } from '~/types/hermes'
import { formatShortDuration, prettyJson, subagentTitle, toolArgsLine } from '~/utils/format'
import { formatToolCall, isSubagentTool, toolContext, toolElapsedMs } from '~/utils/toolRun'
import { toolRowIcon } from '~/utils/toolIcon'

const props = defineProps<{
  tool: ChatToolEvent
}>()

const now = useNowTick(() => props.tool.status === 'running')
const open = ref(props.tool.status === 'running')

watch(() => props.tool.status, (status) => {
  if (status === 'running') open.value = true
})

const title = computed(() => {
  if (isSubagentTool(props.tool)) return subagentTitle(props.tool)
  return formatToolCall(props.tool.name, toolContext(props.tool))
})

const elapsed = computed(() => formatShortDuration(toolElapsedMs(props.tool, now.value)))
const detail = computed(() => {
  if (props.tool.inlineDiff?.trim()) return props.tool.inlineDiff.trim()
  if (props.tool.resultText?.trim()) return props.tool.resultText.trim()
  const args = prettyJson(props.tool.args).trim()
  if (args) return args
  return toolArgsLine(props.tool.args, props.tool.preview || props.tool.summary || props.tool.goal)
})

async function openChildSession() {
  const id = props.tool.childSessionId
  if (!id) return
  await navigateTo(`/chat/${id}`)
}
</script>

<template>
  <div
    class="tool-card"
    :class="{ 'is-failed': tool.status === 'failed' }"
    data-conversation-scaffold
  >
    <ChatScaffoldRow
      :open="open"
      :toggleable="Boolean(detail)"
      @toggle="open = !open"
    >
      <span
        class="tool-card__title"
        :class="{ 'is-shimmer': tool.status === 'running' }"
      >
        <UiIcon
          :name="toolRowIcon(tool)"
          :size="14"
          :spin="tool.status === 'running'"
        />
        {{ title }}
      </span>
      <template
        v-if="elapsed"
        #trailing
      >
        {{ elapsed }}
      </template>
    </ChatScaffoldRow>
    <div
      v-if="open && detail"
      class="tool-card__body"
    >
      <pre>{{ detail }}</pre>
      <button
        v-if="tool.childSessionId && tool.status !== 'running'"
        type="button"
        class="tool-card__child"
        @click="openChildSession"
      >
        查看子代理记录
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tool-card {
  width: 100%;
  min-width: 0;
}

.tool-card.is-failed :deep(.scaffold-row__label) {
  color: var(--color-error);
}

.tool-card.is-failed .tool-card__title :deep(.ui-icon) {
  color: var(--color-error);
}

.tool-card__title {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.35rem;

  :deep(.ui-icon) {
    flex-shrink: 0;
    color: var(--color-text-muted);
  }
}

.tool-card__body {
  margin-top: 0.2rem;
  min-width: 0;
}

.tool-card__body pre {
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.tool-card__child {
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
</style>
