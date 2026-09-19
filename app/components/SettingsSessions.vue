<script setup lang="ts">
import type { HermesSession } from '~/types/hermes'
import { displayTitle } from '~/utils/format'
import { nestedGet } from '~/utils/modelSettings'
import { sessionMeta, visibleArchivedSessions } from '~/utils/sessionGroups'

defineOptions({ name: 'SettingsSessions' })

const DEFAULT_AUTO_ARCHIVE_DAYS = 3

function asConfig(value: unknown) {
  if (!value || typeof value !== 'object') return {}
  const rec = value as Record<string, unknown>
  if (rec.config && typeof rec.config === 'object' && rec.agent == null && rec.model == null) {
    return rec.config as Record<string, unknown>
  }
  return rec
}

const { isConfigured } = useConnection()
const dashboard = useDashboardApi()
const sessions = useSessions()
const toast = useToast()

const query = ref('')
const busyId = ref('')
const deleteOpen = ref(false)
const pendingDelete = ref<HermesSession | null>(null)
const autoReady = ref(false)
const autoEnabled = ref(false)
const autoDays = ref(DEFAULT_AUTO_ARCHIVE_DAYS)
const autoSaving = ref(false)

const archived = computed(() => visibleArchivedSessions(sessions.archivedItems.value))

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return archived.value
  return archived.value.filter(item =>
    [item.title, item.preview, item.id, item.model]
      .some(value => String(value || '').toLowerCase().includes(needle))
  )
})

async function loadList() {
  if (!isConfigured.value) return
  await sessions.loadArchived()
}

async function loadAutoArchive() {
  if (!isConfigured.value) {
    autoReady.value = false
    return
  }
  try {
    const config = asConfig(await dashboard.request('config'))
    const days = Number(nestedGet(config, 'sessions.auto_archive_days'))
    autoEnabled.value = Boolean(nestedGet(config, 'sessions.auto_archive'))
    autoDays.value = Number.isFinite(days) && days > 0 ? Math.round(days) : DEFAULT_AUTO_ARCHIVE_DAYS
    autoReady.value = true
  } catch {
    autoReady.value = false
  }
}

async function persistAuto() {
  if (!autoReady.value) return
  autoSaving.value = true
  try {
    await dashboard.request('config', {
      method: 'PUT',
      body: {
        config: {
          sessions: {
            auto_archive: autoEnabled.value,
            auto_archive_days: autoDays.value
          }
        }
      }
    })
  } catch (error) {
    toast.add({
      title: '无法更新自动归档',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    autoSaving.value = false
  }
}

function onAutoToggle(value: boolean) {
  autoEnabled.value = value
  void persistAuto()
}

function onDaysUpdate(value: string) {
  autoDays.value = Math.max(1, Math.round(Number(value) || 1))
}

async function unarchive(item: HermesSession) {
  busyId.value = item.id
  try {
    await sessions.archive(item.id, false)
    toast.add({ title: '已取消归档', color: 'success' })
  } catch (error) {
    toast.add({
      title: '无法取消归档',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    busyId.value = ''
  }
}

function startDelete(item: HermesSession) {
  pendingDelete.value = item
  deleteOpen.value = true
}

async function confirmDelete() {
  const item = pendingDelete.value
  if (!item) return
  busyId.value = item.id
  try {
    await sessions.remove(item.id)
    deleteOpen.value = false
    pendingDelete.value = null
    toast.add({ title: '会话已删除', color: 'success' })
  } catch (error) {
    toast.add({
      title: '无法删除',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    busyId.value = ''
  }
}

async function openSession(id: string) {
  await navigateTo(`/chat/${id}`)
}

watch(isConfigured, (ok) => {
  if (!import.meta.client) return
  if (ok) {
    void loadList()
    void loadAutoArchive()
    return
  }
  autoReady.value = false
}, { immediate: true })

onActivated(() => {
  if (!import.meta.client || !isConfigured.value) return
  void loadList()
})
</script>

<template>
  <div class="panel">
    <p class="panel__lead">
      已归档对话会从侧边栏隐藏，但会保留全部消息。在会话菜单里选择「归档」即可。
    </p>

    <SettingsNeedConnection v-if="!isConfigured" />

    <template v-else>
      <SettingsRow
        v-if="autoReady"
        icon="i-lucide-timer"
        title="自动归档闲置会话"
        description="一段时间没用的会话会移到这里。已置顶的不会被归档，也不会删除内容。"
      >
        <template #trailing>
          <UiSwitch
            :model-value="autoEnabled"
            :disabled="autoSaving"
            aria-label="自动归档闲置会话"
            @update:model-value="onAutoToggle"
          />
        </template>
      </SettingsRow>

      <SettingsRow
        v-if="autoReady && autoEnabled"
        icon="i-lucide-clock"
        title="归档前闲置天数"
      >
        <template #trailing>
          <div class="auto-days">
            <UiInput
              :model-value="String(autoDays)"
              type="number"
              :disabled="autoSaving"
              aria-label="归档前闲置天数"
              class="auto-days__input"
              @update:model-value="onDaysUpdate"
              @blur="persistAuto"
            />
            <span>天</span>
          </div>
        </template>
      </SettingsRow>

      <div class="panel__toolbar">
        <UiInput
          v-model="query"
          icon="i-lucide-search"
          placeholder="搜索已归档会话"
          class="panel__search"
        />
      </div>

      <div
        v-if="sessions.loadingArchived.value"
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
          :key="item.id"
        >
          <div class="archive-card">
            <button
              type="button"
              class="archive-card__main"
              @click="openSession(item.id)"
            >
              <p class="archive-card__title">
                {{ displayTitle(item) }}
              </p>
              <p
                v-if="item.preview"
                class="archive-card__preview"
              >
                {{ item.preview }}
              </p>
              <p class="archive-card__meta">
                {{ sessionMeta(item) }}
              </p>
            </button>
            <div class="archive-card__actions">
              <UiButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-archive-restore"
                label="取消归档"
                :loading="busyId === item.id"
                :disabled="Boolean(busyId) && busyId !== item.id"
                @click="unarchive(item)"
              />
              <UiButton
                color="error"
                variant="ghost"
                size="sm"
                square
                icon="i-lucide-trash"
                aria-label="永久删除"
                :disabled="Boolean(busyId)"
                @click="startDelete(item)"
              />
            </div>
          </div>
        </UiCard>
        <p
          v-if="!filtered.length"
          class="panel__empty"
        >
          {{ query.trim() ? '没有匹配的归档。' : '暂无归档。归档一个对话后会显示在这里。' }}
        </p>
      </div>
    </template>

    <UiConfirm
      v-model:open="deleteOpen"
      tone="danger"
      title="删除这个会话？"
      :description="pendingDelete ? `「${displayTitle(pendingDelete)}」会从服务器上删除，无法恢复。` : ''"
      confirm-label="删除"
      :loading="Boolean(busyId) && busyId === pendingDelete?.id"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style lang="scss" scoped>
.panel {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.75rem;
}

.panel__lead {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  line-height: 1.45;
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
  flex-direction: column;
  gap: 0.65rem;
}

.panel__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.auto-days {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}

.auto-days__input {
  width: 4.5rem;

  :deep(.ui-input-wrap) {
    min-height: 2rem;
    padding-inline: 0.45rem;
  }

  :deep(.ui-input) {
    padding: 0.3rem 0.2rem;
    font-size: 0.875rem;
    text-align: center;
  }
}

.archive-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.7rem;

  @include sm {
    flex-direction: row;
    align-items: center;
  }
}

.archive-card__main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: stretch;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: start;
}

.archive-card__title {
  @include truncate;
  margin: 0;
  color: var(--color-text-strong);
  font-weight: 600;
  line-height: 1.3;
}

.archive-card__preview {
  @include line-clamp(2);
  margin: 0.2rem 0 0;
  color: var(--color-text-toned);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.archive-card__meta {
  margin: 0.2rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.archive-card__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 0.15rem;
}
</style>
