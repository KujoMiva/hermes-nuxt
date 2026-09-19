<script setup lang="ts">
import type { HermesSession } from '~/types/hermes'
import { displayTitle } from '~/utils/format'

defineOptions({ name: 'SidebarSessionMenu' })

const session = defineModel<HermesSession | null>('session', { default: null })
const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  closeSidebar: []
}>()

const route = useRoute()
const sessions = useSessions()
const chat = useChatController()
const toast = useToast()

const renameOpen = ref(false)
const deleteOpen = ref(false)
const forkOpen = ref(false)
const renameValue = ref('')
const acting = ref(false)

watch([open, renameOpen, deleteOpen, forkOpen], ([menu, rename, remove, fork]) => {
  if (!menu && !rename && !remove && !fork) session.value = null
})

async function leaveIfCurrent(id: string) {
  const viewing = chat.isActiveId(id) || route.params.id === id
  if (!viewing) return
  chat.resetLocal()
  if (route.path !== '/') await navigateTo('/')
}

function startRename() {
  if (!session.value) return
  renameValue.value = session.value.title?.trim() || displayTitle(session.value)
  open.value = false
  renameOpen.value = true
}

function startDelete() {
  open.value = false
  deleteOpen.value = true
}

function startFork() {
  open.value = false
  forkOpen.value = true
}

async function saveRename() {
  const item = session.value
  const title = renameValue.value.trim()
  if (!item) return
  if (!title) {
    toast.add({ title: '请填写标题', color: 'warning' })
    return
  }
  acting.value = true
  try {
    await sessions.rename(item.id, title)
    renameOpen.value = false
    toast.add({ title: '已重命名', color: 'success' })
  } catch (error) {
    toast.add({
      title: '无法重命名',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    acting.value = false
  }
}

async function confirmFork() {
  const item = session.value
  if (!item) return
  acting.value = true
  try {
    if (chat.isActiveId(item.id) && chat.busy.value) await chat.stop()
    const forked = await sessions.fork(item.id)
    forkOpen.value = false
    toast.add({ title: '已创建分支', description: '原会话还在，请在新会话里继续。', color: 'success' })
    await sessions.refresh()
    emit('closeSidebar')
    await navigateTo(`/chat/${forked.id}`)
  } catch (error) {
    toast.add({
      title: '无法创建分支',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    acting.value = false
  }
}

async function togglePin() {
  const item = session.value
  if (!item) return
  const next = !item.pinned
  open.value = false
  acting.value = true
  try {
    await sessions.pin(item.id, next)
    toast.add({ title: next ? '已置顶' : '已取消置顶', color: 'success' })
  } catch (error) {
    toast.add({
      title: next ? '无法置顶' : '无法取消置顶',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    acting.value = false
  }
}

async function archiveSelected() {
  const item = session.value
  if (!item) return
  open.value = false
  acting.value = true
  try {
    await sessions.archive(item.id)
    toast.add({ title: '已归档', description: '可在控制台的「已归档对话」里查看。', color: 'success' })
    await leaveIfCurrent(item.id)
  } catch (error) {
    toast.add({
      title: '无法归档',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    acting.value = false
  }
}

async function unarchiveSelected() {
  const item = session.value
  if (!item) return
  open.value = false
  acting.value = true
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
    acting.value = false
  }
}

async function confirmDelete() {
  const item = session.value
  if (!item) return
  acting.value = true
  try {
    await sessions.remove(item.id)
    deleteOpen.value = false
    toast.add({ title: '会话已删除', color: 'success' })
    await leaveIfCurrent(item.id)
  } catch (error) {
    toast.add({
      title: '无法删除',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <UiSheet
    v-model:open="open"
    labelled-by="session-menu-title"
  >
    <p
      id="session-menu-title"
      class="session-menu__title"
    >
      {{ session ? displayTitle(session) : '会话' }}
    </p>
    <div class="session-menu">
      <button
        v-if="!session?.archived"
        type="button"
        class="session-menu__item"
        :disabled="acting"
        @click="togglePin"
      >
        <UiIcon
          :name="session?.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin'"
          :size="18"
        />
        {{ session?.pinned ? '取消置顶' : '置顶' }}
      </button>
      <button
        v-if="session?.archived"
        type="button"
        class="session-menu__item"
        :disabled="acting"
        @click="unarchiveSelected"
      >
        <UiIcon
          name="i-lucide-archive-restore"
          :size="18"
        />
        取消归档
      </button>
      <button
        type="button"
        class="session-menu__item"
        @click="startRename"
      >
        <UiIcon
          name="i-lucide-pencil"
          :size="18"
        />
        重命名
      </button>
      <button
        v-if="!session?.archived"
        type="button"
        class="session-menu__item"
        :disabled="acting"
        @click="startFork"
      >
        <UiIcon
          name="i-lucide-git-fork"
          :size="18"
        />
        创建分支
      </button>
      <button
        v-if="!session?.archived"
        type="button"
        class="session-menu__item"
        :disabled="acting"
        @click="archiveSelected"
      >
        <UiIcon
          name="i-lucide-archive"
          :size="18"
        />
        归档
      </button>
      <button
        type="button"
        class="session-menu__item is-danger"
        @click="startDelete"
      >
        <UiIcon
          name="i-lucide-trash"
          :size="18"
        />
        删除
      </button>
    </div>
  </UiSheet>

  <UiModal v-model:open="renameOpen">
    <template #content>
      <form
        class="rename"
        @submit.prevent="saveRename"
      >
        <p class="rename__title">
          修改标题
        </p>
        <p class="rename__desc">
          这个标题会同步到 Hermes。
        </p>
        <UiInput
          v-model="renameValue"
          placeholder="标题"
          autofocus
        />
        <div class="rename__actions">
          <UiButton
            color="neutral"
            variant="outline"
            label="取消"
            @click="renameOpen = false"
          />
          <UiButton
            type="submit"
            label="保存"
            :loading="acting"
          />
        </div>
      </form>
    </template>
  </UiModal>

  <UiConfirm
    v-model:open="forkOpen"
    icon="i-lucide-git-fork"
    title="从这条会话创建分支？"
    :description="session ? `会复制「${displayTitle(session)}」的全部消息到新会话。原会话会保留。` : ''"
    confirm-label="创建分支"
    :loading="acting"
    @confirm="confirmFork"
  />

  <UiConfirm
    v-model:open="deleteOpen"
    tone="danger"
    title="删除这个会话？"
    :description="session ? `「${displayTitle(session)}」会从服务器上删除，无法恢复。` : ''"
    confirm-label="删除"
    :loading="acting"
    @confirm="confirmDelete"
  />
</template>

<style lang="scss" scoped>
.session-menu__title {
  margin: 0 0 0.55rem;
  overflow: hidden;
  font-size: 1.05rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-menu {
  display: flex;
  flex-direction: column;
  padding-bottom: 0.2rem;
}

.session-menu__item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.75rem;
  min-height: 2.75rem;
  border: 0;
  border-radius: 0.7rem;
  background: transparent;
  padding: 0.35rem 0.4rem;
  color: var(--color-text-strong);
  font-size: 0.9375rem;
  text-align: start;

  :deep(.ui-icon) {
    color: var(--color-text-muted);
  }

  &:hover {
    background: var(--color-elevated);
  }

  &.is-danger {
    color: var(--color-error);

    :deep(.ui-icon) {
      color: var(--color-error);
    }
  }

  &:disabled {
    opacity: 0.55;
  }
}

.rename {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 1.1rem 1.15rem 1.15rem;
}

.rename__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.rename__desc {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.rename__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
</style>
