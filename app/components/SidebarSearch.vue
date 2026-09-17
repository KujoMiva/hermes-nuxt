<script setup lang="ts">
defineOptions({ name: 'SidebarSearch' })

const query = defineModel<string>({ default: '' })
</script>

<template>
  <div class="sidebar-search">
    <UiInput
      v-model="query"
      icon="i-lucide-search"
      placeholder="搜索会话"
    />
  </div>
</template>

<style lang="scss" scoped>
.sidebar-search {
  flex-shrink: 0;
  padding: 0 0.55rem 0.55rem 0.7rem;
}
</style>
