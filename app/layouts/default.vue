<script setup lang="ts">
const route = useRoute()
const chat = useChatController()
const sessions = useSessions()

const sidebarOpen = ref(false)
const { collapsed } = useSidebarDisplay()

const jobsChrome = useJobsChrome()

const titles: Record<string, string> = {
  '/': '新对话',
  '/jobs': '定时任务',
  '/settings': '控制台'
}

const tabTitles: Record<string, string> = {
  connection: '连接设置',
  profiles: 'Profiles',
  skills: '技能',
  tools: '工具集',
  models: '模型',
  status: '服务器状态'
}

const isChat = computed(() => route.path === '/' || route.path.startsWith('/chat/'))
const isSettings = computed(() => route.path === '/settings')
const isJobs = computed(() => route.path === '/jobs' || route.path.startsWith('/jobs/'))
const isJobsList = computed(() => route.path === '/jobs')
const isJobsNew = computed(() => route.path === '/jobs/new')
const isJobsHistory = computed(() => isJobs.value && route.path.endsWith('/history'))
const isJobsEdit = computed(() => /^\/jobs\/[^/]+$/.test(route.path) && !isJobsNew.value)
const isStack = computed(() => isSettings.value || isJobs.value)

const title = computed(() => {
  if (isChat.value) {
    const activeId = chat.storedSessionId.value || chat.sessionId.value
    if (!activeId) return '新对话'
    const session = sessions.find(activeId)
    return session ? displayTitle(session) : '对话'
  }
  if (isJobsNew.value) return '新建定时任务'
  if (isJobsHistory.value) return '执行历史'
  if (isJobsEdit.value) return '编辑定时任务'
  if (route.path === '/settings') {
    const tab = route.query.tab
    if (typeof tab === 'string' && tabTitles[tab]) return tabTitles[tab]
    return '控制台'
  }
  return titles[route.path] || 'Hermes Agent'
})

const router = useRouter()

function goBack() {
  if (router.options.history.state.back) {
    router.back()
    return
  }
  void navigateTo('/')
}

async function newChat() {
  chat.resetLocal()
  sidebarOpen.value = false
  await navigateTo('/')
}

function openSidebar() {
  sidebarOpen.value = true
  collapsed.value = false
}

watch(() => route.fullPath, () => {
  sidebarOpen.value = false
})
</script>

<template>
  <div
    class="shell"
    :class="{ 'is-sidebar-collapsed': collapsed }"
  >
    <div
      class="shell__overlay"
      :class="{ 'is-open': sidebarOpen }"
      @click="sidebarOpen = false"
    />
    <AppSidebar
      v-if="!isStack"
      v-model:open="sidebarOpen"
    />

    <div
      class="shell__main"
      :class="{ 'is-settings': isStack }"
    >
      <header
        class="shell__navbar"
        :class="{ 'is-settings': isStack }"
      >
        <UiButton
          v-if="isStack"
          class="shell__navbtn"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          pill
          icon="i-lucide-chevron-left"
          aria-label="返回"
          @click="goBack"
        />
        <UiButton
          v-else
          class="shell__navbtn shell__menu"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          pill
          icon="i-lucide-menu"
          aria-label="打开菜单"
          @click="openSidebar"
        />
        <div
          class="shell__titles"
          :class="{ 'is-settings': isStack }"
        >
          <p class="shell__title">
            {{ title }}
          </p>
        </div>
        <div class="shell__actions">
          <UiButton
            v-if="isChat"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            icon="i-lucide-plus"
            aria-label="新对话"
            @click="newChat"
          />
          <UiButton
            v-else-if="isJobsList"
            to="/jobs/new"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            icon="i-lucide-plus"
            aria-label="新建任务"
          />
          <UiButton
            v-else-if="isJobsEdit"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            icon="i-lucide-trash"
            aria-label="删除任务"
            @click="jobsChrome.deleteHandler.value?.()"
          />
          <UiButton
            v-else-if="isJobsHistory"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            icon="i-lucide-refresh-cw"
            aria-label="刷新历史"
            @click="jobsChrome.refreshHandler.value?.()"
          />
          <UiButton
            v-else-if="!isSettings && !isJobs"
            to="/settings"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            icon="i-lucide-settings"
            class="shell__settings"
            aria-label="设置"
          />
        </div>
      </header>
      <main class="shell__body">
        <slot />
      </main>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.shell {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--color-bg);
}

.shell__overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgb(15 15 20 / 32%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;

  &.is-open {
    opacity: 1;
    pointer-events: auto;
    transition: opacity 0.32s ease 0.12s;
  }

  @include md {
    display: none;
  }
}

.shell__main {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--color-surface);

  &.is-settings {
    background: var(--color-bg);
  }
}

.shell__navbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.5rem;
  box-sizing: content-box;
  height: var(--navbar-height);
  padding: env(safe-area-inset-top, 0px) 0.75rem 0;
  background: color-mix(in srgb, var(--color-surface) 90%, transparent);
  box-shadow: 0 1px 0 rgb(0 0 0 / 4%);
  backdrop-filter: blur(12px);

  &.is-settings {
    background: color-mix(in srgb, var(--color-bg) 92%, transparent);
    box-shadow: none;
  }
}

.shell__navbtn {
  flex-shrink: 0;
}

.shell__menu {
  @include md {
    display: none;
  }
}

.shell.is-sidebar-collapsed .shell__menu {
  @include md {
    display: inline-flex;
  }
}

.shell__titles {
  min-width: 0;
  max-width: calc(100vw - 7.5rem);
  flex: 1;
  text-align: center;

  @include sm {
    text-align: start;
  }

  &.is-settings {
    text-align: center;
  }
}

.shell__title {
  margin: 0;
  overflow: hidden;
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shell__actions {
  display: flex;
  width: 2rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
}

.shell__settings {
  display: none;

  @include sm {
    display: inline-flex;
  }
}

.shell__body {
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
</style>
