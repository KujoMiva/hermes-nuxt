<script setup lang="ts">
import type { HermesSession } from '~/types/hermes'

defineOptions({ name: 'SidebarSessionGroup' })

defineProps<{
  label: string
  hint: string
  icon: string
  expanded: boolean
  sessions: HermesSession[]
  activeId?: string
  fill?: boolean
  docked?: boolean
  emptyText: string
  showPin?: boolean
  showLoadMore?: boolean
  loadingMore?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  open: [id: string]
  menu: [item: HermesSession]
  loadMore: []
}>()
</script>

<template>
  <section
    class="workspace"
    :class="{
      'is-fill': fill && expanded,
      'is-docked': docked,
      'is-open': docked && expanded
    }"
  >
    <div class="nav-row workspace__head">
      <button
        type="button"
        class="nav-row__main"
        @click="emit('toggle')"
      >
        <UiIcon
          :name="icon"
          :size="16"
        />
        <span class="workspace__identity">
          <span class="nav-row__label">{{ label }}</span>
          <span class="workspace__hint">{{ hint }}</span>
        </span>
      </button>
      <button
        type="button"
        class="icon-btn"
        :aria-label="expanded ? '收起' : '展开'"
        @click="emit('toggle')"
      >
        <UiIcon
          :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          :size="16"
        />
      </button>
    </div>

    <div
      v-if="expanded"
      class="workspace__list"
    >
      <SidebarSessionItem
        v-for="item in sessions"
        :key="item.id"
        :item="item"
        :active="activeId === item.id"
        :show-pin="showPin"
        @open="emit('open', item.id)"
        @menu="emit('menu', item)"
      />
      <p
        v-if="!sessions.length"
        class="workspace__empty"
      >
        {{ emptyText }}
      </p>
      <button
        v-if="showLoadMore"
        type="button"
        class="workspace__more"
        :disabled="loadingMore"
        @click="emit('loadMore')"
      >
        <UiIcon
          v-if="loadingMore"
          name="i-lucide-loader-circle"
          :size="14"
          spin
        />
        {{ loadingMore ? '加载中…' : '加载更多' }}
      </button>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.nav-row {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  min-height: 2.5rem;
  padding-inline: 0.15rem;
  border-radius: 0.7rem;
  color: var(--color-text-toned);
}

.nav-row__main {
  display: flex;
  min-width: 0;
  min-height: 2.5rem;
  flex: 1;
  align-items: center;
  gap: 0.65rem;
  border: 0;
  background: transparent;
  padding: 0 0.4rem;
  color: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  text-align: start;
}

.nav-row__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.icon-btn {
  display: inline-flex;
  width: 1.75rem;
  height: 1.75rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0.45rem;
  background: transparent;
  color: var(--color-text-muted);

  &:hover {
    background: var(--color-elevated);
    color: var(--color-text-strong);
  }
}

.workspace {
  display: flex;
  flex-direction: column;
  min-height: 0;

  &.is-fill {
    flex: 1;
  }

  &.is-docked {
    flex-shrink: 0;
    margin-top: auto;

    .workspace__list {
      max-height: min(40vh, 16rem);
      flex: none;
    }
  }
}

.workspace__head {
  min-height: 2.7rem;
}

.workspace__identity {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
}

.workspace__hint {
  color: var(--color-text-muted);
  font-size: 0.6875rem;
  font-weight: 400;
  line-height: 1.2;
}

.workspace__list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  margin: 0.05rem 0.15rem 0.25rem 1.05rem;
  padding: 0.05rem 0 0.15rem 0.55rem;
  border-left: 1px solid var(--color-border);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: var(--color-border);
  }
}

.workspace__empty {
  margin: 0.1rem 0 0;
  padding: 0.55rem 0.55rem;
  color: var(--color-text-muted);
  font-size: 0.6875rem;
  line-height: 1.25;
}

.workspace__more {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  margin: 0.15rem 0 0.2rem;
  border: 0;
  border-radius: 0.6rem;
  background: transparent;
  padding: 0.45rem 0.4rem;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 500;

  &:hover:not(:disabled) {
    background: var(--color-elevated);
    color: var(--color-text-toned);
  }

  &:disabled {
    opacity: 0.7;
  }
}
</style>
