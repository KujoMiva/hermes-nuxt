<script setup lang="ts">
import type { ChatToolEvent } from '~/types/hermes'
import { splitRunItems, visibleTools } from '~/utils/toolRun'

const props = defineProps<{
  tools: ChatToolEvent[]
  live?: boolean
  embedded?: boolean
}>()

const blocks = computed(() => {
  const tools = visibleTools(props.tools)
  const items = splitRunItems(tools)
  return items.map((item, index) => {
    if (item.kind === 'card') {
      const tool = tools[item.index]
      return tool
        ? { key: `card-${tool.id}-${index}`, kind: 'card' as const, tool }
        : null
    }
    const group = tools.slice(item.start, item.end + 1)
    const last = index === items.length - 1
    return {
      key: `run-${group[0]?.id || index}-${index}`,
      kind: 'run' as const,
      tools: group,
      live: Boolean(props.live && last)
    }
  }).filter((item): item is NonNullable<typeof item> => Boolean(item))
})
</script>

<template>
  <div
    v-if="blocks.length"
    class="tool-runs"
  >
    <template
      v-for="block in blocks"
      :key="block.key"
    >
      <ToolRunGroup
        v-if="block.kind === 'run'"
        :tools="block.tools"
        :live="block.live"
        :embedded="embedded"
      />
      <ToolCallCard
        v-else
        :tool="block.tool"
      />
    </template>
  </div>
</template>

<style lang="scss" scoped>
.tool-runs {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 0.35rem;
}
</style>
