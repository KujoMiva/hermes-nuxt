<script setup lang="ts">
const { isConfigured } = useConnection()
const {
  groups,
  loading,
  currentId,
  currentLabel,
  refresh,
  select,
  isSelected
} = useModelCatalog()

const open = ref(false)
const query = ref('')
const root = ref<HTMLElement | null>(null)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const selected = currentId.value
  return groups.value.map((group) => {
    const models = (group.models || []).filter((item) => {
      if (!q) return true
      return [item.id, item.name, group.name, group.id]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q))
    }).slice()
      .sort((left, right) => {
        if (left.id === selected) return -1
        if (right.id === selected) return 1
        return 0
      })
    const limited = q ? models : models.slice(0, 28)
    return {
      ...group,
      models: limited,
      hidden: Math.max(0, models.length - limited.length)
    }
  }).filter(group => group.models.length)
})

async function toggle() {
  if (!isConfigured.value) return
  open.value = !open.value
  if (open.value) {
    query.value = ''
    await refresh()
  }
}

function choose(id: string, provider = '') {
  select(id, provider)
  open.value = false
}

function onDocumentClick(event: MouseEvent) {
  if (!open.value || !root.value) return
  if (!root.value.contains(event.target as Node)) open.value = false
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentClick)
  document.addEventListener('keydown', onKey)
  if (isConfigured.value) void refresh()
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div
    ref="root"
    class="model-switch"
  >
    <button
      type="button"
      class="model-switch__button"
      :disabled="!isConfigured"
      :title="currentId || '选择模型'"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
    >
      <span class="model-switch__label">{{ currentLabel }}</span>
      <UiIcon
        name="i-lucide-chevron-down"
        :size="12"
      />
    </button>

    <div
      v-if="open"
      class="model-switch__menu"
      role="listbox"
    >
      <UiInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="搜索模型"
      />
      <p
        v-if="loading"
        class="model-switch__hint"
      >
        加载模型目录…
      </p>
      <div
        v-else
        class="model-switch__groups"
      >
        <section
          v-for="group in filtered"
          :key="group.id"
          class="model-switch__group"
        >
          <p class="model-switch__group-name">
            {{ group.name }}
          </p>
          <button
            v-for="item in group.models"
            :key="`${group.id}:${item.id}`"
            type="button"
            class="model-switch__option"
            :class="{ 'is-active': isSelected(item) }"
            @click="choose(item.id, group.id)"
          >
            {{ item.name || item.id }}
          </button>
          <p
            v-if="group.hidden"
            class="model-switch__hint"
          >
            还有 {{ group.hidden }} 个，输入关键字筛选
          </p>
        </section>
        <p
          v-if="!filtered.length"
          class="model-switch__hint"
        >
          {{ query ? '没有匹配的模型' : '暂无可用模型目录' }}
        </p>
      </div>
      <NuxtLink
        to="/settings?tab=models"
        class="model-switch__more"
        @click="open = false"
      >
        模型设置
      </NuxtLink>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.model-switch {
  position: relative;
  min-width: 0;
  max-width: 100%;
}

.model-switch__button {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 0.15rem;
  min-width: 0;
  border: 0;
  border-radius: 0.4rem;
  background: transparent;
  padding: 0;
  color: var(--color-text-toned);
  font: inherit;
  font-size: inherit;
  line-height: inherit;

  &:hover:not(:disabled),
  &[aria-expanded='true'] {
    color: var(--color-text-strong);
  }

  &:disabled {
    opacity: 0.6;
  }

  :deep(.ui-icon) {
    display: block;
    flex-shrink: 0;
    color: var(--color-text-muted);
  }
}

.model-switch__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-switch__menu {
  position: absolute;
  top: calc(100% + 0.45rem);
  left: 0;
  z-index: 60;
  display: flex;
  width: min(22rem, 78vw);
  max-height: min(24rem, calc(100vh - var(--navbar-height) - 2rem));
  flex-direction: column;
  gap: 0.55rem;
  overflow: hidden;
  border-radius: 0.9rem;
  background: var(--color-surface);
  box-shadow: 0 12px 36px rgb(15 15 20 / 16%);
  padding: 0.65rem;

  @include until-md {
    position: fixed;
    top: calc(var(--navbar-height) + 0.4rem);
    left: 0.75rem;
    right: 0.75rem;
    width: auto;
  }

  :deep(.ui-input-wrap) {
    min-height: 2.1rem;
  }
}

.model-switch__groups {
  min-height: 0;
  flex: 1;
  overflow: auto;
  scrollbar-width: thin;
}

.model-switch__group + .model-switch__group {
  margin-top: 0.65rem;
}

.model-switch__group-name {
  margin: 0 0 0.28rem;
  color: var(--color-text-muted);
  font-size: 0.6875rem;
  font-weight: 600;
}

.model-switch__option {
  display: block;
  width: 100%;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  padding: 0.38rem 0.5rem;
  color: var(--color-text-strong);
  font-size: 0.75rem;
  text-align: start;

  &:hover,
  &.is-active {
    background: var(--color-elevated);
  }

  &.is-active {
    font-weight: 600;
  }
}

.model-switch__hint {
  margin: 0.25rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.6875rem;
}

.model-switch__more {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  text-align: center;

  &:hover {
    color: var(--color-text-strong);
  }
}
</style>
