<script setup lang="ts">
import type { HermesSession } from '~/types/hermes'
import { groupChatSessions } from '~/utils/sessionGroups'

const open = defineModel<boolean>('open', { default: false })
const { collapsed } = useSidebarDisplay()
const route = useRoute()
const { connected, connecting, isConfigured, lastError, testConnection, endpointHref, profile } = useConnection()
const profiles = useProfiles()
const avatars = useProfileAvatars()
const sessions = useSessions()
const chat = useChatController()
const toast = useToast()
const profileSheet = ref(false)

const expanded = ref<Record<string, boolean>>({ home: true })
const menuSession = ref<HermesSession | null>(null)
const menuOpen = ref(false)

onMounted(async () => {
  if (isConfigured.value) {
    try {
      await testConnection()
    } catch {
      // banner handles it
    }
    await Promise.allSettled([
      sessions.refresh(),
      profiles.refresh()
    ])
  }
})

async function newChat() {
  chat.resetLocal()
  open.value = false
  await navigateTo('/')
}

function collapseSidebar() {
  collapsed.value = true
  open.value = false
}

async function openSession(id: string) {
  open.value = false
  await navigateTo(`/chat/${id}`)
}

function openMenu(item: HermesSession) {
  menuSession.value = item
  menuOpen.value = true
}

const isSearching = computed(() => Boolean(sessions.query.value.trim()))

const canLoadMore = computed(() => {
  return sessions.hasMore.value && !isSearching.value
})

const searchHint = computed(() => {
  if (sessions.searching.value) return '全库搜索中'
  const count = sessions.filtered.value.length
  return count ? `${count} 个会话` : '无匹配'
})

function isExpanded(id: string) {
  return expanded.value[id] ?? (id === 'home')
}

function toggleWorkspace(id: string) {
  expanded.value[id] = !isExpanded(id)
}

const host = computed(() => endpointHref.value)
const workspaceName = computed(() => profile.value?.trim() || '会话')
const currentProfile = computed(() => profiles.current.value)
const profileName = computed(() => currentProfile.value?.name || 'Default')
const profileAvatarSrc = computed(() => {
  const item = currentProfile.value
  if (!item) return ''
  return avatars.url(item.localId) || avatars.url(item.id)
})

async function chooseProfile(localId: string) {
  if (localId === currentProfile.value?.localId) {
    profileSheet.value = false
    return
  }
  try {
    await profiles.select(localId)
  } catch (error) {
    toast.add({
      title: '切换身份失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
    return
  }
  profileSheet.value = false
  open.value = false
  chat.resetLocal()
  try {
    await testConnection()
  } catch {
    // banner / toast from testConnection
  }
  await navigateTo('/')
}

async function goManageProfiles() {
  profileSheet.value = false
  open.value = false
  await navigateTo('/settings?tab=profiles')
}

const workspaces = computed(() => groupChatSessions(sessions.filtered.value, {
  label: workspaceName.value,
  hint: profile.value?.trim() ? '配置文件' : 'default'
}))

const homeEmptyText = computed(() => {
  if (sessions.searching.value) return '搜索中…'
  if (sessions.loading.value) return '加载中…'
  if (sessions.query.value.trim()) return '没有匹配的会话'
  return '暂无会话'
})

watch(() => route.params.id, (id) => {
  if (!id) return
  const group = workspaces.value.find(item => item.sessions.some(session => session.id === id))
  if (group) expanded.value[group.id] = true
})
</script>

<template>
  <aside
    class="sidebar"
    :class="{ 'is-open': open, 'is-collapsed': collapsed }"
  >
    <div class="sidebar__header">
      <h2 class="sidebar__heading">
        会话
      </h2>
      <div class="sidebar__header-actions">
        <UiButton
          color="neutral"
          variant="ghost"
          size="sm"
          square
          icon="i-lucide-refresh-cw"
          aria-label="刷新会话"
          :loading="sessions.loading.value"
          @click="sessions.refresh()"
        />
        <UiButton
          class="sidebar__collapse"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          icon="i-lucide-panel-left-close"
          aria-label="收起侧边栏"
          @click="collapseSidebar"
        />
      </div>
    </div>
    <SidebarSearch
      v-model="sessions.query.value"
      :searching="sessions.searching.value"
    />

    <div class="sidebar__body">
      <nav class="sidebar__nav">
        <div class="nav-row">
          <button
            type="button"
            class="nav-row__main"
            @click="newChat"
          >
            <UiIcon
              name="i-lucide-message-square"
              :size="16"
            />
            <span class="nav-row__label">发起新会话</span>
          </button>
        </div>
      </nav>

      <SidebarSessionGroup
        v-if="isSearching"
        label="搜索结果"
        :hint="searchHint"
        icon="i-lucide-search"
        :expanded="true"
        :sessions="sessions.filtered.value"
        :active-id="String(route.params.id || '')"
        fill
        :show-pin="true"
        :empty-text="homeEmptyText"
        @open="openSession"
        @menu="openMenu"
      />

      <template v-else>
        <SidebarSessionGroup
          v-for="space in workspaces"
          :key="space.id"
          :label="space.label"
          :hint="space.hint"
          :icon="space.icon"
          :expanded="isExpanded(space.id)"
          :sessions="space.sessions"
          :active-id="String(route.params.id || '')"
          :fill="space.id === 'home'"
          :show-pin="true"
          :empty-text="homeEmptyText"
          :show-load-more="space.id === 'home' && canLoadMore"
          :loading-more="sessions.loadingMore.value"
          @toggle="toggleWorkspace(space.id)"
          @open="openSession"
          @menu="openMenu"
          @load-more="sessions.loadMore()"
        />
      </template>
    </div>

    <div class="sidebar__footer">
      <button
        type="button"
        class="host-chip"
        aria-label="切换 Profile"
        @click="profileSheet = true"
      >
        <ProfileAvatar
          class="host-chip__avatar"
          :seed="currentProfile?.localId || 'hermes'"
          :src="profileAvatarSrc"
          :size="28"
        />
        <span class="host-chip__text">
          <span class="host-chip__label">
            {{ connecting ? '正在连接…' : profileName }}
          </span>
          <span class="host-chip__hint">
            <span
              class="host-chip__dot"
              :class="{
                'is-ok': connected,
                'is-bad': Boolean(lastError)
              }"
            />
            {{ host }}
          </span>
        </span>
      </button>
      <UiButton
        to="/settings"
        color="neutral"
        variant="soft"
        size="sm"
        square
        pill
        icon="i-lucide-settings"
        aria-label="设置"
        @click="open = false"
      />
    </div>

    <ProfileSwitchSheet
      v-model:open="profileSheet"
      @select="chooseProfile"
      @manage="goManageProfiles"
    />

    <SidebarSessionMenu
      v-model:session="menuSession"
      v-model:open="menuOpen"
      @close-sidebar="open = false"
    />
  </aside>
</template>

<style lang="scss" scoped>
.sidebar {
  display: flex;
  width: var(--sidebar-width);
  flex-shrink: 0;
  flex-direction: column;
  min-height: 0;
  background: var(--color-bg);
  border-inline-end: 1px solid var(--color-border);

  @include md {
    overflow: hidden;
    transition: width 0.22s ease, border-inline-end-width 0.22s ease, visibility 0s;

    > * {
      box-sizing: border-box;
      min-width: var(--sidebar-width);
    }

    &.is-collapsed {
      width: 0;
      min-width: 0;
      border-inline-end-width: 0;
      pointer-events: none;
      visibility: hidden;
      transition: width 0.22s ease, border-inline-end-width 0.22s ease, visibility 0s 0.22s;
    }
  }

  @include until-md {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 50;
    width: min(var(--sidebar-width), 82vw);
    height: 100%;
    border-inline-end: 0;
    transform: translateX(-100%);
    visibility: hidden;
    box-shadow: none;
    pointer-events: none;
    transition: transform 0.2s ease, visibility 0.2s ease;

    &.is-open {
      transform: translateX(0);
      visibility: visible;
      box-shadow: 8px 0 32px rgb(15 15 20 / 12%);
      pointer-events: auto;
    }
  }

  :deep(.ui-icon) {
    display: block;
  }
}

.sidebar__header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: calc(0.9rem + env(safe-area-inset-top, 0px)) 0.55rem 0.45rem 1rem;
}

.sidebar__heading {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 650;
  letter-spacing: -0.03em;
  line-height: 1;
}

.sidebar__header-actions {
  display: flex;
  align-items: center;
  gap: 0.1rem;
}

.sidebar__collapse {
  @include until-md {
    display: none;
  }
}

.sidebar__body {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding: 0.15rem 0.45rem 0.35rem;
}

.sidebar__nav {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  margin-bottom: 0.2rem;
}

.nav-row {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  min-height: 2.5rem;
  padding-inline: 0.15rem;
  border-radius: 0.7rem;
  color: var(--color-text-toned);
}

.nav-row__main {
  display: flex;
  min-width: 0;
  min-height: 2.5rem;
  flex: 1;
  align-items: center;
  gap: 0.65rem;
  border: 0;
  background: transparent;
  padding: 0 0.4rem;
  color: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  text-align: start;
}

.nav-row__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.2;
}

.sidebar__footer {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.45rem;
  padding: 0.55rem 0.7rem max(1.1rem, calc(0.7rem + env(safe-area-inset-bottom)));
}

.host-chip {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.55rem;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  padding: 0.32rem 0.7rem 0.32rem 0.35rem;
  text-align: start;
  box-shadow: var(--shadow);
}

.host-chip__avatar {
  flex-shrink: 0;
}

.host-chip__dot {
  display: inline-block;
  width: 0.4rem;
  height: 0.4rem;
  flex-shrink: 0;
  border-radius: var(--radius-pill);
  background: #a1a1aa;

  &.is-ok {
    background: var(--color-success);
  }

  &.is-bad {
    background: var(--color-error);
  }
}

.host-chip__text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.host-chip__label,
.host-chip__hint {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.host-chip__label {
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.2;
}

.host-chip__hint {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.08rem;
  color: var(--color-text-muted);
  font-size: 0.625rem;
  line-height: 1.2;
}
</style>
