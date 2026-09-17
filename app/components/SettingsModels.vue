<script setup lang="ts">
defineOptions({ name: 'SettingsModels' })

const { isConfigured } = useConnection()
const {
  aliases,
  providers,
  loading,
  loaded,
  refresh,
  serverDefault,
  serverProvider,
  currentContext
} = useModelCatalog()
const query = ref('')

watch(isConfigured, (ok) => {
  if (!import.meta.client) return
  if (ok) void refresh()
}, { immediate: true })

const visibleProviders = computed(() => {
  return providers.value.filter(row => row.authenticated || row.models?.length)
})

const filteredAliases = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return aliases.value
  return aliases.value.filter(item => item.id.toLowerCase().includes(q))
})

const filteredProviders = computed(() => {
  const q = query.value.trim().toLowerCase()
  return visibleProviders.value.map((item) => {
    if (!q) return item
    const nameHit = [item.name, item.id].some(value => String(value || '').toLowerCase().includes(q))
    if (nameHit) return item
    return {
      ...item,
      models: (item.models || []).filter(opt =>
        [opt.id, opt.name].some(value => String(value || '').toLowerCase().includes(q))
      )
    }
  }).filter((item) => {
    if (!q) return true
    return Boolean(item.models?.length)
      || [item.name, item.id].some(value => String(value || '').toLowerCase().includes(q))
  })
})

const hasMatches = computed(() => filteredAliases.value.length + filteredProviders.value.length > 0)

function isDefaultModel(modelId: string, providerId?: string) {
  if (!serverDefault.value || modelId !== serverDefault.value) return false
  if (!serverProvider.value || !providerId) return true
  return providerId === serverProvider.value
}
</script>

<template>
  <div class="panel">
    <div class="panel__toolbar">
      <UiInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="搜索模型"
        class="panel__search"
      />
    </div>

    <SettingsNeedConnection v-if="!isConfigured" />

    <div
      v-else-if="loading && !loaded"
      class="panel__loading"
    >
      <UiIcon
        name="i-lucide-loader-circle"
        :size="24"
        spin
      />
    </div>

    <template v-else>
      <UiCard>
        <dl class="summary">
          <div>
            <dt>当前模型</dt>
            <dd>{{ serverDefault || '—' }}</dd>
          </div>
          <div>
            <dt>供应商</dt>
            <dd>{{ serverProvider || '—' }}</dd>
          </div>
          <div v-if="currentContext">
            <dt>上下文</dt>
            <dd>{{ currentContext.toLocaleString() }}</dd>
          </div>
        </dl>
      </UiCard>

      <section
        v-if="filteredAliases.length"
        class="panel__section"
      >
        <h2>API 别名</h2>
        <div class="panel__chips">
          <UiBadge
            v-for="item in filteredAliases"
            :key="item.id"
            color="neutral"
            variant="outline"
          >
            {{ item.id }}
          </UiBadge>
        </div>
      </section>

      <section
        v-if="filteredProviders.length"
        class="panel__section"
      >
        <h2>已认证供应商</h2>
        <UiCard
          v-for="item in filteredProviders"
          :key="item.id"
        >
          <div class="provider">
            <p>{{ item.name }}</p>
            <UiBadge :color="item.authenticated ? 'success' : 'neutral'">
              {{ item.authenticated ? '已认证' : '未认证' }}
            </UiBadge>
          </div>
          <div class="panel__chips">
            <UiBadge
              v-for="opt in item.models || []"
              :key="opt.id"
              :color="isDefaultModel(opt.id, item.id) ? 'success' : 'neutral'"
              variant="outline"
            >
              {{ opt.name || opt.id }}{{ isDefaultModel(opt.id, item.id) ? ' · 默认' : '' }}
            </UiBadge>
            <span
              v-if="!item.models?.length"
              class="panel__muted"
            >
              未返回模型列表
            </span>
          </div>
        </UiCard>
      </section>

      <p
        v-if="!hasMatches"
        class="panel__empty"
      >
        {{ query ? '没有匹配的模型。' : '暂无可用模型目录。' }}
      </p>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.panel {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1.25rem;
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

.summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
  margin: 0;

  @include sm {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  dt {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.75rem;
  }

  dd {
    @include truncate;
    margin: 0.2rem 0 0;
    font-weight: 500;
  }
}

.panel__section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  h2 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 500;
  }
}

.provider {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;

  p {
    @include truncate;
    min-width: 0;
    flex: 1;
    margin: 0;
    font-weight: 500;
  }

  :deep(.ui-badge) {
    flex-shrink: 0;
  }
}

.panel__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;

  :deep(.ui-badge) {
    max-width: 100%;
    overflow-wrap: anywhere;
    white-space: normal;
  }
}

.panel__muted,
.panel__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.panel__empty {
  font-size: 0.875rem;
}
</style>
