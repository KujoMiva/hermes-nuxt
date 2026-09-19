<script setup lang="ts">
import type { ReasoningEffort } from '~/types/hermes'

defineOptions({ name: 'ChatComposerBar' })

const chat = useChatController()
const { isConfigured } = useConnection()
const {
  groups: modelGroups,
  loading: modelsLoading,
  currentLabel: defaultModelLabel,
  serverDefault,
  serverProvider,
  refresh: refreshModels
} = useModelCatalog()

const sheet = ref<'model' | 'effort' | null>(null)
const query = ref('')
const expensiveConfirm = ref<{ id: string, provider: string, message: string } | null>(null)
const confirmingExpensive = ref(false)

const effortChip = computed(() => reasoningEffortTitle(chat.activeReasoningEffort.value))

const modelLabel = computed(() => {
  const id = chat.sessionModel.value?.trim()
  if (id && !isGenericModel(id)) return displayModel(id) || id
  return defaultModelLabel.value
})

function isActiveModel(id: string, groupId = '') {
  if (id !== chat.activeModel.value) return false
  const selectedProvider = chat.activeProvider.value
  if (!groupId || !selectedProvider) return true
  return groupId === selectedProvider
}

const modelRows = computed(() => {
  const q = query.value.trim().toLowerCase()
  const rows = modelGroups.value.flatMap((group) => {
    const matches = (group.models || []).filter((item) => {
      if (q) {
        return [item.id, item.name, group.name, group.id]
          .some(value => String(value || '').toLowerCase().includes(q))
      }
      if (/-image(?:-|$)/i.test(item.id)) return false
      return true
    })
    const selected = matches.filter(item => isActiveModel(item.id, group.id))
    const rest = matches.filter(item => !isActiveModel(item.id, group.id))
    const limited = q ? rest : rest.slice(0, 18)
    return [...selected, ...limited].map(item => ({
      id: item.id,
      name: item.name || item.id,
      provider: group.name || group.id,
      groupId: group.id,
      isDefault: item.id === serverDefault.value && (!item.provider || item.provider === serverProvider.value),
      selected: isActiveModel(item.id, group.id)
    }))
  })
  return rows.slice().sort((left, right) => Number(right.selected) - Number(left.selected))
})

async function openSheet(next: 'model' | 'effort') {
  if (!isConfigured.value) {
    await navigateTo('/login')
    return
  }
  sheet.value = next
  if (next === 'model') {
    query.value = ''
    await refreshModels()
  }
}

async function chooseModel(id: string, provider = '', confirmExpensiveModel = false) {
  const result = await chat.setSessionModel(id, provider, { confirmExpensiveModel })
  if (result && typeof result === 'object' && result.confirmRequired) {
    sheet.value = null
    expensiveConfirm.value = { id, provider, message: result.confirmMessage }
    return
  }
  if (result === false) return
  expensiveConfirm.value = null
  sheet.value = null
}

async function confirmExpensiveModel() {
  const pending = expensiveConfirm.value
  if (!pending) return
  confirmingExpensive.value = true
  try {
    await chooseModel(pending.id, pending.provider, true)
  } finally {
    confirmingExpensive.value = false
  }
}

async function chooseEffort(id: ReasoningEffort) {
  sheet.value = null
  await chat.setSessionReasoningEffort(id)
}

onMounted(() => {
  if (isConfigured.value) void refreshModels()
})
</script>

<template>
  <div class="composer-bar">
    <div class="composer-bar__meta">
      <button
        type="button"
        class="composer-chip"
        :class="{ 'is-open': sheet === 'model' }"
        aria-label="选择模型"
        @click="openSheet('model')"
      >
        <span class="composer-chip__label">{{ modelLabel }}</span>
      </button>
      <button
        type="button"
        class="composer-chip composer-chip--fixed"
        :class="{ 'is-open': sheet === 'effort' }"
        aria-label="思考强度"
        @click="openSheet('effort')"
      >
        <span class="composer-chip__label">{{ effortChip }}</span>
      </button>
    </div>

    <UiSheet
      :open="sheet === 'model'"
      labelled-by="composer-model-title"
      @update:open="value => { if (!value) sheet = null }"
    >
      <div class="sheet-head">
        <div>
          <p
            id="composer-model-title"
            class="sheet-head__title"
          >
            选择模型
          </p>
          <p class="sheet-head__desc">
            仅对当前会话生效，从下一轮回复开始。
          </p>
        </div>
      </div>
      <UiInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="搜索模型"
      />
      <p
        v-if="modelsLoading"
        class="sheet-hint"
      >
        加载模型目录…
      </p>
      <div
        v-else
        class="sheet-list"
      >
        <button
          v-for="item in modelRows"
          :key="`${item.groupId}:${item.id}`"
          type="button"
          class="sheet-option"
          :class="{ 'is-active': item.selected }"
          @click="chooseModel(item.id, item.groupId)"
        >
          <span class="sheet-option__text">
            <span class="sheet-option__title">{{ item.name }}</span>
            <span class="sheet-option__hint">
              {{ item.provider }}{{ item.isDefault ? ' · 默认' : '' }}
            </span>
          </span>
          <UiIcon
            v-if="item.selected"
            name="i-lucide-check"
            :size="16"
          />
        </button>
        <p
          v-if="!modelRows.length"
          class="sheet-hint"
        >
          {{ query ? '没有匹配的模型' : '暂无可用模型目录' }}
        </p>
      </div>
    </UiSheet>

    <UiSheet
      :open="sheet === 'effort'"
      labelled-by="composer-effort-title"
      @update:open="value => { if (!value) sheet = null }"
    >
      <div class="sheet-head">
        <div>
          <p
            id="composer-effort-title"
            class="sheet-head__title"
          >
            思考强度
          </p>
          <p class="sheet-head__desc">
            当前会话的思考强度，打开对话时从网关读取。
          </p>
        </div>
      </div>
      <div class="sheet-list">
        <button
          v-for="item in REASONING_EFFORTS"
          :key="item.id || 'follow'"
          type="button"
          class="sheet-option"
          :class="{ 'is-active': (chat.activeReasoningEffort.value || '') === item.id }"
          @click="chooseEffort(item.id)"
        >
          <span class="sheet-option__text">
            <span class="sheet-option__title">{{ item.title }}</span>
            <span
              v-if="item.description"
              class="sheet-option__hint"
            >{{ item.description }}</span>
          </span>
          <UiIcon
            v-if="(chat.activeReasoningEffort.value || '') === item.id"
            name="i-lucide-check"
            :size="16"
          />
        </button>
      </div>
    </UiSheet>

    <UiConfirm
      :open="Boolean(expensiveConfirm)"
      title="确认使用该模型？"
      :description="expensiveConfirm?.message"
      confirm-label="仍然切换"
      :loading="confirmingExpensive"
      @update:open="value => { if (!value) expensiveConfirm = null }"
      @confirm="confirmExpensiveModel"
      @cancel="expensiveConfirm = null"
    />
  </div>
</template>

<style lang="scss" scoped>
.composer-bar {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
  padding-inline: 0.35rem;
  pointer-events: none;
}

.composer-bar__meta {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  justify-content: flex-end;
  gap: 0.55rem;
}

.composer-chip {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.28rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0.22rem 0;
  color: var(--color-text-muted);
  font-size: 0.6875rem;
  line-height: 1.5;
  pointer-events: auto;

  .composer-bar__meta > & {
    max-width: none;
    flex: 0 1 auto;
  }

  .composer-bar__meta > &:first-child {
    min-width: 0;
    overflow: hidden;
  }

  &--fixed {
    flex: 0 0 auto;
  }

  &.is-open {
    color: var(--color-text-strong);
  }

  :deep(.ui-icon) {
    display: block;
    flex-shrink: 0;
  }
}

.composer-chip__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.5;
}

.sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

:deep(.ui-input-wrap) {
  flex-shrink: 0;
  margin-bottom: 0.75rem;
}

.sheet-head__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.sheet-head__desc {
  margin: 0.2rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.sheet-hint {
  margin: 0.35rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.sheet-list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.55rem;
  overflow-y: auto;
  margin-top: 0.35rem;
  padding-bottom: 0.35rem;

  :deep(.ui-btn) {
    width: 100%;
  }
}

.sheet-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: 0.95rem;
  background: var(--color-surface);
  padding: 0.8rem 0.9rem;
  color: var(--color-text-toned);
  text-align: start;

  &.is-active {
    background: var(--color-elevated);
    border-color: var(--color-accented);
    color: var(--color-text-strong);
  }

  :deep(.ui-icon) {
    margin-left: auto;
    color: var(--color-text-strong);
  }
}

.sheet-option__text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.15rem;
}

.sheet-option__title {
  overflow: hidden;
  color: var(--color-text-strong);
  font-size: 0.875rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sheet-option__hint {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
