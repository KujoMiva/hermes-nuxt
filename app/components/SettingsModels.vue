<script setup lang="ts">
import { GLOBAL_REASONING_EFFORTS } from '~/utils/modelSettings'

defineOptions({ name: 'SettingsModels' })

const { isConfigured, profile } = useConnection()
const settings = useModelSettings()
const query = ref('')

function loadSettings() {
  if (!import.meta.client) return
  if (isConfigured.value) void settings.hydrate(true)
}

onMounted(loadSettings)
onActivated(loadSettings)

watch(profile, () => {
  if (!import.meta.client) return
  if (isConfigured.value) void settings.hydrate(true)
})

const {
  aliases,
  providers,
  loading,
  loaded,
  serverDefault,
  serverProvider,
  currentContext
} = settings.catalog

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

function pickCatalogModel(modelId: string, providerId: string) {
  settings.onProviderChange(providerId)
  settings.selectedModel.value = modelId
}

function auxSummary(task: string) {
  const current = settings.auxiliary.value.find(item => item.task === task)
  if (!current || !current.provider || current.provider === 'auto') return '跟随主模型'
  return `${current.provider} / ${current.model || '—'}`
}

const reasoningItems = GLOBAL_REASONING_EFFORTS.map(item => ({
  label: item.label,
  value: item.value
}))

const staleSlots = computed(() => {
  return settings.switchStaleAux.value.length
    ? settings.switchStaleAux.value
    : settings.persistentStaleAux.value
})

const showRestWarning = computed(() => !settings.restAvailable.value)
</script>

<template>
  <div class="panel">
    <SettingsNeedConnection v-if="!isConfigured" />

    <div
      v-else-if="settings.hydrating.value && !loaded"
      class="panel__loading"
    >
      <UiIcon
        name="i-lucide-loader-circle"
        :size="24"
        spin
      />
    </div>

    <template v-else>
      <p class="panel__lead">
        这里改的是 Profile 默认模型，只影响<strong>新对话</strong>。进行中的会话请用输入框下方的模型菜单切换。
      </p>

      <p
        v-if="showRestWarning"
        class="panel__banner"
      >
        当前网关没有 dashboard 的 <code>/api/model/set</code>。可以保存 API Key，但无法在网页写入默认模型。
      </p>

      <UiCard>
        <div class="defaults">
          <div class="defaults__summary">
            <div>
              <dt>当前默认</dt>
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
          </div>

          <div class="defaults__row">
            <UiFormField label="供应商">
              <UiSelect
                :model-value="settings.selectedProvider.value"
                :items="settings.providerItems.value"
                @update:model-value="settings.onProviderChange"
              />
            </UiFormField>
          </div>

          <template v-if="settings.needsSetup.value">
            <template v-if="settings.setupIsApiKey.value">
              <UiFormField
                :label="`粘贴 ${settings.selectedProviderRow.value?.keyEnv || 'API Key'}`"
                hint="写入网关本机 ~/.hermes/.env。保存后选择模型再点应用。"
              >
                <UiInput
                  :model-value="settings.apiKeyDraft.value"
                  type="password"
                  autocomplete="off"
                  placeholder="sk-…"
                  @update:model-value="settings.apiKeyDraft.value = $event"
                  @keydown.enter.prevent="settings.activateApiKey"
                />
              </UiFormField>
              <div class="defaults__actions">
                <UiButton
                  size="sm"
                  :loading="settings.activating.value"
                  :disabled="!settings.apiKeyDraft.value.trim()"
                  label="激活"
                  @click="settings.activateApiKey"
                />
              </div>
            </template>
            <p
              v-else
              class="panel__muted"
            >
              {{ settings.selectedProviderRow.value?.name || '该供应商' }} 使用
              {{ settings.selectedProviderRow.value?.authType || 'OAuth' }} 登录，需要在网关本机完成
              <code>hermes model</code> 或桌面端授权，网页无法代替浏览器登录。
            </p>
          </template>

          <template v-else>
            <UiFormField label="模型">
              <UiSelect
                v-model="settings.selectedModel.value"
                :items="settings.modelItems.value"
              />
            </UiFormField>
            <div class="defaults__actions">
              <UiButton
                size="sm"
                :loading="settings.applying.value"
                :disabled="!settings.selectedProvider.value || !settings.selectedModel.value"
                label="应用"
                icon="i-lucide-check"
                @click="settings.applyMainModel"
              />
              <UiButton
                v-if="settings.selectedProviderRow.value?.authenticated"
                size="sm"
                color="neutral"
                variant="ghost"
                :disabled="settings.applying.value"
                label="断开"
                @click="settings.disconnectProvider"
              />
              <UiButton
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-refresh-cw"
                label="刷新目录"
                :loading="loading"
                @click="settings.hydrate(true)"
              />
            </div>
          </template>

          <div
            v-if="settings.reasoningSupported.value || settings.fastSupported.value"
            class="defaults__toggles"
          >
            <UiFormField
              v-if="settings.reasoningSupported.value"
              label="默认思考强度"
            >
              <UiSelect
                :model-value="settings.reasoningEffort.value"
                :items="reasoningItems"
                @update:model-value="settings.setReasoning"
              />
            </UiFormField>
            <label
              v-if="settings.fastSupported.value"
              class="defaults__fast"
            >
              <span>Fast 模式</span>
              <UiSwitch
                :model-value="settings.fastOn.value"
                :disabled="settings.applying.value"
                @update:model-value="settings.setFast"
              />
            </label>
          </div>

          <p
            v-if="settings.errorText.value"
            class="panel__error"
          >
            {{ settings.errorText.value }}
          </p>

          <div
            v-if="staleSlots.length"
            class="panel__warn"
          >
            <p>
              这些辅助任务仍钉在其他供应商（{{ staleSlots[0].provider }}）：
              {{ staleSlots.map(item => settings.auxTaskLabel(item.task)).join('、') }}。
              主模型切换不会自动改它们，可能继续扣旧账号的额度。
            </p>
            <UiButton
              size="xs"
              color="neutral"
              variant="outline"
              :disabled="settings.applying.value"
              label="全部跟随主模型"
              @click="settings.resetAuxiliaryModels"
            />
          </div>
        </div>
      </UiCard>

      <section class="panel__section">
        <div class="panel__section-head">
          <div>
            <h2>辅助任务</h2>
            <p>视觉、压缩、标题等后台槽位。留空或 auto 表示跟随主模型。</p>
          </div>
          <UiButton
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="!serverDefault || settings.applying.value"
            label="全部跟随主模型"
            @click="settings.resetAuxiliaryModels"
          />
        </div>

        <UiCard
          v-for="meta in settings.AUX_TASKS"
          :key="meta.key"
        >
          <div class="aux">
            <div class="aux__text">
              <p>{{ meta.label }}</p>
              <span>{{ meta.hint }}</span>
            </div>
            <template v-if="settings.editingAuxTask.value === meta.key">
              <div class="aux__edit">
                <UiSelect
                  v-model="settings.auxDraftProvider.value"
                  :items="settings.readyProviderItems.value"
                />
                <UiSelect
                  v-model="settings.auxDraftModel.value"
                  :items="settings.auxModelsForDraft.value"
                />
                <div class="aux__edit-actions">
                  <UiButton
                    size="xs"
                    label="保存"
                    :loading="settings.applying.value"
                    @click="settings.applyAuxiliaryDraft"
                  />
                  <UiButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    label="取消"
                    @click="settings.editingAuxTask.value = ''"
                  />
                </div>
              </div>
            </template>
            <div
              v-else
              class="aux__current"
            >
              <p>{{ auxSummary(meta.key) }}</p>
              <div class="aux__actions">
                <UiButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :disabled="!serverDefault || settings.applying.value"
                  label="跟随主模型"
                  @click="settings.setAuxiliaryToMain(meta.key)"
                />
                <UiButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  :disabled="settings.applying.value"
                  label="更改"
                  @click="settings.beginAuxiliaryEdit(meta.key)"
                />
              </div>
            </div>
          </div>
        </UiCard>
      </section>

      <SettingsCustomEndpoints
        :applying="settings.applying.value"
        :endpoints="settings.endpoints.value"
        @save="settings.saveEndpoint"
        @activate="settings.activateEndpoint"
        @remove="settings.deleteEndpoint"
      />

      <div class="panel__toolbar">
        <UiInput
          v-model="query"
          icon="i-lucide-search"
          placeholder="搜索模型目录"
          class="panel__search"
        />
      </div>

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
        <h2>供应商目录</h2>
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
            <button
              v-for="opt in item.models || []"
              :key="opt.id"
              type="button"
              class="model-chip"
              :class="{ 'is-default': isDefaultModel(opt.id, item.id) }"
              @click="pickCatalogModel(opt.id, item.id)"
            >
              {{ opt.name || opt.id }}{{ isDefaultModel(opt.id, item.id) ? ' · 默认' : '' }}
            </button>
            <span
              v-if="!item.models?.length"
              class="panel__muted"
            >
              {{ item.warning || '未返回模型列表' }}
            </span>
          </div>
        </UiCard>
      </section>

      <p
        v-if="!hasMatches && query"
        class="panel__empty"
      >
        没有匹配的模型。
      </p>
    </template>

    <UiConfirm
      v-model:open="settings.confirmOpen.value"
      title="确认使用该模型？"
      :description="settings.confirmMessage.value"
      confirm-label="仍然使用"
      @confirm="settings.confirmExpensive"
    />
  </div>
</template>

<style lang="scss" scoped>
.panel {
  width: 100%;
  max-width: 42rem;
  margin: 0 auto;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1.25rem;
}

.panel__lead,
.panel__banner {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  line-height: 1.5;
}

.panel__banner {
  border-radius: var(--radius-sm);
  background: var(--color-warning-bg);
  padding: 0.75rem 0.9rem;
  color: var(--color-warning);
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

.defaults {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.defaults__summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;

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

.defaults__row,
.defaults__actions,
.defaults__toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.defaults__toggles {
  align-items: flex-end;
}

.defaults__fast {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.35rem;
  font-size: 0.8125rem;
}

.panel__section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;

  h2 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
  }
}

.panel__section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;

  p {
    margin: 0.2rem 0 0;
    color: var(--color-text-muted);
    font-size: 0.75rem;
  }
}

.provider,
.aux {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 0.5rem;
}

.provider {
  align-items: center;
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

.aux {
  flex-direction: column;
}

.aux__text {
  min-width: 0;

  p {
    margin: 0;
    font-weight: 600;
  }

  span {
    color: var(--color-text-muted);
    font-size: 0.75rem;
  }
}

.aux__current,
.aux__edit {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 0.5rem;
}

.aux__current p {
  margin: 0;
  color: var(--color-text-toned);
  font-size: 0.8125rem;
}

.aux__actions,
.aux__edit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
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

.model-chip {
  display: inline-flex;
  max-width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xs);
  background: transparent;
  padding: 0.12rem 0.45rem;
  color: var(--color-text-toned);
  font-size: 0.6875rem;
  font-weight: 500;
  overflow-wrap: anywhere;
  text-align: start;
  white-space: normal;

  &.is-default {
    border-color: transparent;
    background: var(--color-success-bg);
    color: var(--color-success);
  }
}

.panel__muted,
.panel__empty,
.panel__error {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.panel__empty {
  font-size: 0.875rem;
}

.panel__error {
  color: var(--color-error);
}

.panel__warn {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-radius: var(--radius-sm);
  background: var(--color-warning-bg);
  padding: 0.75rem 0.9rem;
  color: var(--color-warning);
  font-size: 0.75rem;

  p {
    margin: 0;
  }
}
</style>
