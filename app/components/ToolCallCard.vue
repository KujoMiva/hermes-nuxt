<script setup lang="ts">
import type { ChatToolEvent } from '~/types/hermes'
import { formatShortDuration, prettyJson, subagentTitle, toolArgsLine } from '~/utils/format'
import { fileEditPreview } from '~/utils/fileEditPreview'
import { formatToolCall, isSubagentTool, toolContext, toolElapsedMs } from '~/utils/toolRun'
import { toolRowIcon } from '~/utils/toolIcon'

const props = defineProps<{
  tool: ChatToolEvent
}>()

const preview = computed(() => fileEditPreview(props.tool))
const now = useNowTick(() => props.tool.status === 'running')
const open = ref(props.tool.status === 'running' || Boolean(fileEditPreview(props.tool)))

watch(() => props.tool.status, (status) => {
  if (status === 'running') open.value = true
})

const title = computed(() => {
  if (isSubagentTool(props.tool)) return subagentTitle(props.tool)
  if (preview.value) {
    const fail = props.tool.status === 'failed' ? ' · 失败' : ''
    return `${preview.value.basename}${fail}`
  }
  return formatToolCall(props.tool.name, toolContext(props.tool))
})

const elapsed = computed(() => formatShortDuration(toolElapsedMs(props.tool, now.value)))
const detail = computed(() => {
  if (preview.value) return ''
  if (props.tool.inlineDiff?.trim()) return props.tool.inlineDiff.trim()
  if (props.tool.resultText?.trim()) return props.tool.resultText.trim()
  const args = prettyJson(props.tool.args).trim()
  if (args) return args
  return toolArgsLine(props.tool.args, props.tool.preview || props.tool.summary || props.tool.goal)
})
const showBody = computed(() => open.value && Boolean(preview.value || detail.value || (props.tool.childSessionId && props.tool.status !== 'running')))

async function openChildSession() {
  const id = props.tool.childSessionId
  if (!id) return
  await navigateTo(`/chat/${id}`)
}
</script>

<template>
  <ChatClarifyCard
    v-if="tool.name === 'clarify' && tool.status !== 'running'"
    :tool="tool"
  />
  <div
    v-else-if="tool.name !== 'clarify'"
    class="tool-card"
    :class="{ 'is-failed': tool.status === 'failed', 'is-file': Boolean(preview) }"
    data-conversation-scaffold
    :data-file-edit="preview ? '' : undefined"
  >
    <ChatScaffoldRow
      :open="open"
      :toggleable="Boolean(preview || detail)"
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
        v-if="(preview && (preview.added > 0 || preview.removed > 0)) || (!preview && elapsed)"
        #trailing
      >
        <span
          v-if="preview && preview.added > 0"
          class="tool-card__stat is-add"
        >+{{ preview.added }}</span>
        <span
          v-if="preview && preview.removed > 0"
          class="tool-card__stat is-del"
        >−{{ preview.removed }}</span>
        <span
          v-if="!preview && elapsed"
          class="tool-card__elapsed"
        >{{ elapsed }}</span>
      </template>
    </ChatScaffoldRow>
    <div
      v-if="showBody"
      class="tool-card__body"
    >
      <FileEditPanel
        v-if="preview"
        :preview="preview"
      />
      <pre v-else>{{ detail }}</pre>
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

.tool-card__stat {
  font-family: var(--font-mono);
  font-weight: 600;

  &.is-add {
    color: var(--color-success);
  }

  &.is-del {
    color: var(--color-error);
  }
}

.tool-card__elapsed {
  color: var(--color-text-dimmed);
}

.tool-card :deep(.scaffold-row__trailing) {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.tool-card__body {
  margin-top: 0.35rem;
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
