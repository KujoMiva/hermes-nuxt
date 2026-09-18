<script setup lang="ts">
import type { HermesSkill } from '~/types/hermes'
import { asSkillList } from '~/utils/format'

defineOptions({ name: 'SettingsSkills' })

const gateway = useGateway()
const { isConfigured } = useConnection()
const toast = useToast()
const loading = ref(true)
const skills = ref<HermesSkill[]>([])
const query = ref('')
const category = ref('')

async function load() {
  if (!isConfigured.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    skills.value = asSkillList(await gateway.request('skills.manage', { action: 'list' })) as HermesSkill[]
  } catch (error) {
    toast.add({ title: '无法加载技能', description: String(error instanceof Error ? error.message : error), color: 'error' })
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

const categories = computed(() => {
  const set = new Set(skills.value.map(item => item.category).filter(Boolean) as string[])
  return [...set]
})

const filtered = computed(() => {
  return skills.value.filter((item) => {
    if (category.value && item.category !== category.value) return false
    const q = query.value.trim().toLowerCase()
    if (!q) return true
    return [item.name, item.description, item.category].some(value => String(value || '').toLowerCase().includes(q))
  })
})
</script>

<template>
  <div class="panel">
    <div class="panel__toolbar">
      <UiInput
        v-model="query"
        icon="i-lucide-search"
        placeholder="搜索技能"
        class="panel__search"
      />
    </div>

    <SettingsNeedConnection v-if="!isConfigured" />

    <template v-else>
      <div class="panel__chips">
        <UiButton
          size="xs"
          :variant="!category ? 'solid' : 'outline'"
          color="neutral"
          label="全部"
          @click="category = ''"
        />
        <UiButton
          v-for="item in categories"
          :key="item"
          size="xs"
          :variant="category === item ? 'solid' : 'outline'"
          color="neutral"
          :label="item"
          @click="category = item"
        />
      </div>

      <div
        v-if="loading"
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
        class="panel__grid"
      >
        <UiCard
          v-for="skill in filtered"
          :key="skill.name"
        >
          <div class="skill-card">
            <div class="skill-card__text">
              <p class="skill-card__name">
                {{ skill.name }}
              </p>
              <p class="skill-card__desc">
                {{ skill.description || '暂无描述' }}
              </p>
            </div>
            <UiBadge
              v-if="skill.category"
              color="neutral"
            >
              {{ skill.category }}
            </UiBadge>
          </div>
        </UiCard>
        <p
          v-if="!filtered.length"
          class="panel__empty"
        >
          没有匹配的技能。
        </p>
      </div>
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

.panel__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;

  :deep(.ui-btn) {
    max-width: 100%;
  }

  :deep(.ui-btn__label) {
    @include truncate;
  }
}

.panel__loading {
  display: flex;
  justify-content: center;
  padding: 4rem 0;
}

.panel__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;

  @include sm {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @include lg {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.panel__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  grid-column: 1 / -1;
}

.skill-card {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 0.5rem;
}

.skill-card__text {
  min-width: 0;
  flex: 1;
}

.skill-card__name {
  @include truncate;
  margin: 0;
  font-weight: 500;
}

.skill-card :deep(.ui-badge) {
  @include truncate;
  flex-shrink: 0;
  max-width: 7.5rem;
}

.skill-card__desc {
  @include line-clamp(3);
  margin: 0.25rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}
</style>
