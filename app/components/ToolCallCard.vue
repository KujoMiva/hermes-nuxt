<script setup lang="ts">
import type { ChatToolEvent } from '~/types/hermes'

const props = defineProps<{
  tool: ChatToolEvent
}>()

const open = ref(props.tool.status === 'running')

watch(() => props.tool.status, (status) => {
  if (status === 'running') open.value = true
})

const statusMeta = computed(() => {
  if (props.tool.status === 'running') return { color: 'warning' as const, label: '执行中', icon: 'i-lucide-loader-circle' }
  if (props.tool.status === 'failed') return { color: 'error' as const, label: '失败', icon: 'i-lucide-circle-alert' }
  return { color: 'success' as const, label: '完成', icon: 'i-lucide-circle-check' }
})
</script>

<template>
  <div class="tool-card">
    <button
      type="button"
      class="tool-card__head"
      @click="open = !open"
    >
      <UiIcon
        :name="statusMeta.icon"
        :size="16"
        :spin="tool.status === 'running'"
      />
      <span class="tool-card__name">{{ tool.name }}</span>
      <UiBadge :color="statusMeta.color">
        {{ statusMeta.label }}
      </UiBadge>
      <UiIcon
        name="i-lucide-chevron-down"
        :size="16"
        class="tool-card__chevron"
        :class="{ 'is-open': open }"
      />
    </button>
    <div
      v-if="open"
      class="tool-card__body"
    >
      <p
        v-if="tool.preview"
        class="tool-card__preview"
      >
        {{ tool.preview }}
      </p>
      <pre v-if="tool.args">{{ prettyJson(tool.args) }}</pre>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tool-card {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--color-elevated) 60%, transparent);
}

.tool-card__head {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.5rem;
  border: 0;
  background: transparent;
  padding: 0.5rem 0.75rem;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  text-align: start;
}

.tool-card__name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--color-text-strong);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-card__chevron {
  transition: transform 0.15s ease;

  &.is-open {
    transform: rotate(180deg);
  }
}

.tool-card__body {
  border-top: 1px solid var(--color-border);
  padding: 0.5rem 0.75rem;
}

.tool-card__preview,
.tool-card__body pre {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  white-space: pre-wrap;
}

.tool-card__body pre {
  overflow-x: auto;
  font-size: 12px;
  line-height: 1.5;
}
</style>
