<script setup lang="ts">
import type { HermesToolset } from '~/types/hermes'

defineOptions({ name: 'SettingsTools' })

const { request } = useHermes()
const { isConfigured } = useConnection()
const toast = useToast()
const loading = ref(true)
const toolsets = ref<HermesToolset[]>([])
const query = ref('')

async function load() {
  if (!isConfigured.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const payload = await request<HermesToolset[] | { data?: HermesToolset[], toolsets?: HermesToolset[] }>('/v1/toolsets')
    toolsets.value = Array.isArray(payload)
      ? payload
      : (payload.toolsets || payload.data || [])
  } catch (error) {
    toast.add({ title: '无法加载工具集', description: String(error instanceof Error ? error.message : error), color: 'error' })
  } finally {
    loading.value = false
  }
}

watch(isConfigured, (ok) => {
  if (!import.meta.client) {
    loading.value = false
    return
  }
  if (ok) void load()
  else loading.value = false
}, { immediate: true })

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return toolsets.value
  return toolsets.value.filter((item) => {
    return [item.name, item.label, item.description, ...(item.tools || [])]
      .some(value => String(value || '').toLowerCase().includes(q))
  })
})
</script>

<template>
  <div class="panel">
    <div class="panel__toolbar">
      <UiInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="搜索工具"
        class="panel__search"
      />
    </div>

    <SettingsNeedConnection v-if="!isConfigured" />

    <div
      v-else-if="loading"
      class="panel__loading"
    >
      <UiIcon
        name="i-lucide-loader-circle"
        :size="24"
        spin
      />
    </div>
    <div
      v-else
      class="panel__list"
    >
      <UiCard
        v-for="item in filtered"
        :key="item.name"
      >
        <div class="toolset">
          <div class="toolset__text">
            <p class="toolset__name">
              {{ item.label || item.name }}
            </p>
            <p class="toolset__desc">
              {{ item.description || '暂无描述' }}
            </p>
          </div>
          <UiBadge :color="item.enabled ? 'success' : 'neutral'">
            {{ item.enabled ? '已启用' : '未启用' }}
          </UiBadge>
          <UiBadge
            v-if="item.configured === false"
            color="warning"
          >
            未配置
          </UiBadge>
        </div>
        <div
          v-if="item.tools?.length"
          class="toolset__tools"
        >
          <UiBadge
            v-for="tool in item.tools"
            :key="tool"
            color="neutral"
            variant="outline"
          >
            {{ tool }}
          </UiBadge>
        </div>
      </UiCard>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.panel {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1rem;
}

.panel__toolbar {
  display: flex;
  width: 100%;
  min-width: 0;
}

.panel__search {
  min-width: 0;
  flex: 1 1 auto;
  width: 100%;

  :deep(.ui-input-wrap) {
    width: 100%;
  }
}

.panel__loading {
  display: flex;
  justify-content: center;
  padding: 4rem 0;
}

.panel__list {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.75rem;
}

.toolset {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.5rem;
}

.toolset__text {
  min-width: 0;
  flex: 1 1 10rem;
}

.toolset__name {
  @include truncate;
  margin: 0;
  font-weight: 500;
}

.toolset__desc {
  @include line-clamp(3);
  margin: 0.25rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.toolset :deep(.ui-badge) {
  flex-shrink: 0;
}

.toolset__tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.75rem;

  :deep(.ui-badge) {
    max-width: 100%;
    overflow-wrap: anywhere;
    white-space: normal;
  }
}
</style>
