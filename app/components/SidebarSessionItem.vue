<script setup lang="ts">
import type { HermesSession } from '~/types/hermes'
import { displayTitle } from '~/utils/format'
import { sessionMeta } from '~/utils/sessionGroups'

defineOptions({ name: 'SidebarSessionItem' })

defineProps<{
  item: HermesSession
  active?: boolean
  showPin?: boolean
}>()

const emit = defineEmits<{
  open: []
  menu: []
}>()
</script>

<template>
  <div
    class="session-item"
    :class="{ 'is-active': active }"
  >
    <button
      type="button"
      class="session-item__main"
      @click="emit('open')"
    >
      <p class="session-item__title">
        <UiIcon
          v-if="showPin && item.pinned"
          name="i-lucide-pin"
          :size="12"
        />
        <span class="session-item__name">{{ displayTitle(item) }}</span>
      </p>
      <p class="session-item__meta">
        {{ sessionMeta(item) }}
      </p>
    </button>
    <button
      type="button"
      class="session-item__more"
      aria-label="会话操作"
      @click.stop="emit('menu')"
    >
      <UiIcon
        name="i-lucide-ellipsis-vertical"
        :size="16"
      />
    </button>
  </div>
</template>

<style lang="scss" scoped>
.session-item {
  display: flex;
  width: 100%;
  align-items: center;
  border-radius: 0.6rem;

  &:hover,
  &.is-active {
    background: var(--color-elevated);
  }
}

.session-item__main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: stretch;
  border: 0;
  background: transparent;
  padding: 0.4rem 0.2rem 0.4rem 0.55rem;
  text-align: start;
}

.session-item__more {
  display: inline-flex;
  width: 1.85rem;
  height: 1.85rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  margin-inline-end: 0.2rem;
  border: 0;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--color-text-muted);

  &:hover {
    background: var(--color-surface);
    color: var(--color-text-strong);
  }
}

.session-item__title {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin: 0;
  color: var(--color-text-strong);
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.3;

  :deep(.ui-icon) {
    flex-shrink: 0;
    color: var(--color-text-toned);
  }
}

.session-item__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-item__meta {
  margin: 0.1rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.6875rem;
  line-height: 1.25;
}
</style>
