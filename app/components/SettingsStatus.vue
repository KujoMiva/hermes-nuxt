<script setup lang="ts">
defineOptions({ name: 'SettingsStatus' })

const { request } = useHermes()
const { capabilities, serverModel, testConnection, isConfigured } = useConnection()
const toast = useToast()
const health = ref<Record<string, unknown> | null>(null)
const detailed = ref<Record<string, unknown> | null>(null)
const loading = ref(true)

async function refresh() {
  if (!isConfigured.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    await testConnection()
    health.value = await request('/health')
    try {
      detailed.value = await request('/health/detailed')
    } catch {
      detailed.value = null
    }
  } catch (error) {
    toast.add({ title: '无法读取状态', description: String(error instanceof Error ? error.message : error), color: 'error' })
  } finally {
    loading.value = false
  }
}

watch(isConfigured, (ok) => {
  if (!import.meta.client) {
    loading.value = false
    return
  }
  if (ok) void refresh()
  else loading.value = false
}, { immediate: true })

const featureEntries = computed(() => {
  const features = (capabilities.value?.features || {}) as Record<string, unknown>
  return Object.entries(features).map(([key, value]) => ({
    key,
    enabled: value === true || (typeof value === 'object' && value != null && (value as { enabled?: boolean }).enabled === true),
    value
  }))
})

const endpointEntries = computed(() => {
  const endpoints = (capabilities.value?.endpoints || {}) as Record<string, { method?: string, path?: string }>
  return Object.entries(endpoints).map(([key, value]) => ({
    key,
    method: value.method || 'GET',
    path: value.path || ''
  }))
})
</script>

<template>
  <div class="panel">
    <div class="panel__toolbar">
      <p class="panel__lead">
        健康检查、能力探测与远程网关 RPC。这能确认当前连接是否可用。
      </p>
      <UiButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="loading"
        :disabled="!isConfigured"
        label="刷新"
        @click="refresh"
      />
    </div>

    <SettingsNeedConnection v-if="!isConfigured" />

    <template v-else>
      <div class="panel__stats">
        <UiCard>
          <p class="stat-label">
            存活探测
          </p>
          <p class="stat-value">
            {{ String(health?.status || '未知') }}
          </p>
        </UiCard>
        <UiCard>
          <p class="stat-label">
            广告模型
          </p>
          <p class="stat-value">
            {{ serverModel || '—' }}
          </p>
        </UiCard>
        <UiCard>
          <p class="stat-label">
            详细就绪
          </p>
          <p class="stat-value">
            {{ String(detailed?.status || '未提供') }}
          </p>
        </UiCard>
      </div>

      <section>
        <h2 class="panel__heading">
          能力开关
        </h2>
        <div class="panel__chips">
          <UiBadge
            v-for="item in featureEntries"
            :key="item.key"
            :color="item.enabled ? 'success' : 'neutral'"
          >
            {{ item.key }}
          </UiBadge>
        </div>
      </section>

      <section>
        <h2 class="panel__heading">
          可用端点
        </h2>
        <ul class="endpoint-list">
          <li
            v-for="item in endpointEntries"
            :key="item.key"
            class="endpoint-card"
          >
            <p class="endpoint-card__name">
              {{ item.key }}
            </p>
            <p class="endpoint-card__row">
              <span class="endpoint-card__method">{{ item.method }}</span>
              <span class="endpoint-card__path">{{ item.path }}</span>
            </p>
          </li>
        </ul>
        <div class="panel__table-wrap">
          <table>
            <thead>
              <tr>
                <th>能力</th>
                <th>方法</th>
                <th>路径</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in endpointEntries"
                :key="item.key"
              >
                <td>{{ item.key }}</td>
                <td>{{ item.method }}</td>
                <td class="is-mono">
                  {{ item.path }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <UiCard v-if="detailed">
        <p class="panel__heading">
          就绪检查
        </p>
        <pre class="panel__pre">{{ JSON.stringify(detailed, null, 2) }}</pre>
      </UiCard>
    </template>
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
  flex-direction: column;
  align-items: stretch;
  gap: 0.75rem;

  @include sm {
    flex-direction: row;
    align-items: center;
  }

  :deep(.ui-btn) {
    flex-shrink: 0;
    align-self: flex-start;
  }
}

.panel__lead {
  margin: 0;
  min-width: 0;
  flex: 1;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.panel__stats {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;

  @include sm {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.stat-label {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.stat-value {
  margin: 0.25rem 0 0;
  overflow: hidden;
  font-size: 1.125rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel__heading {
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.panel__pre {
  margin: 0;
  overflow-x: auto;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.panel__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;

  :deep(.ui-badge) {
    max-width: 100%;
    overflow-wrap: anywhere;
  }
}

.panel__table-wrap {
  display: none;
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;

  @include sm {
    display: block;
  }
}

.endpoint-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;

  @include sm {
    display: none;
  }
}

.endpoint-card {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  background: var(--color-surface);
  padding: 0.7rem 0.8rem;
}

.endpoint-card__name {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.endpoint-card__row {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 0.5rem;
  margin: 0.3rem 0 0;
}

.endpoint-card__method {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.endpoint-card__path {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  word-break: break-word;
}

table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 0.875rem;
}

th,
td {
  padding: 0.5rem 0.75rem;
  text-align: start;
  overflow-wrap: anywhere;
}

th:nth-child(1),
td:nth-child(1) {
  width: 34%;
}

th:nth-child(2),
td:nth-child(2) {
  width: 4.25rem;
}

thead {
  background: var(--color-elevated);
  color: var(--color-text-muted);
}

th {
  font-weight: 500;
}

tbody tr {
  border-top: 1px solid var(--color-border);
}

td:nth-child(2) {
  color: var(--color-text-muted);
}

.is-mono {
  overflow-wrap: anywhere;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  word-break: break-word;
}
</style>
