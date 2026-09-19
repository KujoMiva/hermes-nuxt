<script setup lang="ts">
defineOptions({ name: 'SidebarSearch' })

defineProps<{
  searching?: boolean
}>()

const query = defineModel<string>({ default: '' })
</script>

<template>
  <div class="sidebar-search">
    <UiInput
      v-model="query"
      :icon="searching ? 'i-lucide-loader-circle' : 'i-lucide-search'"
      :spin="searching"
      placeholder="搜索会话"
    >
      <template
        v-if="query"
        #trailing
      >
        <button
          type="button"
          class="sidebar-search__clear"
          aria-label="清除搜索"
          @click="query = ''"
        >
          <UiIcon
            name="i-lucide-x"
            :size="14"
          />
        </button>
      </template>
    </UiInput>
  </div>
</template>

<style lang="scss" scoped>
.sidebar-search {
  flex-shrink: 0;
  padding: 0 0.55rem 0.55rem 0.7rem;
}

.sidebar-search__clear {
  display: inline-flex;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  margin-inline-end: 0.15rem;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--color-text-muted);

  &:hover {
    background: var(--color-elevated);
    color: var(--color-text-strong);
  }
}
</style>
