<script setup lang="ts">
defineOptions({ name: 'SettingsHub' })

const {
  isConfigured,
  connected,
  connecting,
  lastError,
  endpointHref,
  capabilities,
  testConnection,
  logout
} = useConnection()
const colorMode = useColorMode()
const { collapseDetails } = useRunDisplay()
const catalog = useModelCatalog()
const profiles = useProfiles()
const sessions = useSessions()
const jobs = useJobs()
const countsReady = ref(false)
const confirmLogout = ref(false)

async function confirmAndLogout() {
  confirmLogout.value = false
  await logout()
}

onMounted(async () => {
  if (isConfigured.value) {
    try {
      await testConnection()
    } catch {
      // banner handles it
    }
    await Promise.allSettled([
      jobs.refresh(),
      catalog.refresh(),
      profiles.refresh()
    ])
  }
  countsReady.value = true
})

const host = computed(() => endpointHref.value)
const profileName = computed(() => profiles.currentName.value || 'Default')
const hostMode = computed(() => {
  if (connecting.value) return '正在连接…'
  if (!isConfigured.value) return '远程网关 · 未登录'
  return `远程网关 · ${profileName.value}`
})
const currentModel = computed(() => catalog.currentLabel.value)

const hermesVersion = computed(() => {
  const caps = capabilities.value
  if (!caps) return connected.value ? '就绪' : '—'
  if (typeof caps.version === 'string' && caps.version.trim()) {
    const text = caps.version.trim()
    return text.startsWith('v') || text.startsWith('V') ? text : `v${text}`
  }
  const runtime = caps.runtime
  if (runtime && typeof runtime === 'object') {
    const rec = runtime as Record<string, unknown>
    const version = rec.version || rec.hermes_version || rec.release
    if (typeof version === 'string' && version.trim()) {
      const text = version.trim()
      return /^v/i.test(text) || /^\d/.test(text)
        ? (text.startsWith('v') || text.startsWith('V') ? text : `v${text}`)
        : text
    }
  }
  return connected.value ? '就绪' : '—'
})

const sessionCount = computed(() => {
  if (!isConfigured.value) return null
  return sessions.items.value.length
})

const jobCount = computed(() => {
  if (!isConfigured.value) return null
  if (!countsReady.value && !jobs.items.value.length) return null
  return jobs.items.value.length
})

const banner = computed(() => {
  if (!isConfigured.value) return '尚未登录 · 填写远程网关地址'
  if (connecting.value) return ''
  if (connected.value) return ''
  const detail = lastError.value?.replace(/\s+/g, ' ').trim()
  return detail
    ? `连接异常 · ${detail.slice(0, 48)}`
    : '未连通 · 请检查地址和密钥'
})

const appearance = computed({
  get() {
    return colorMode.preference === 'dark' || colorMode.preference === 'light'
      ? colorMode.preference
      : 'system'
  },
  set(value: 'dark' | 'light' | 'system') {
    colorMode.preference = value
  }
})

const appearanceItems = [
  { value: 'system' as const, icon: 'i-lucide-circle-dot', label: '自动' },
  { value: 'light' as const, icon: 'i-lucide-sun', label: '浅色' },
  { value: 'dark' as const, icon: 'i-lucide-moon', label: '深色' }
]

const statusDots = computed(() => [
  {
    icon: 'i-lucide-link',
    value: isConfigured.value ? (connected.value ? '已连接' : '可更新') : '未配置',
    warn: !connected.value
  },
  {
    icon: 'i-lucide-layers',
    value: connected.value ? '运行中' : '等待',
    warn: !connected.value
  },
  {
    icon: 'i-lucide-activity',
    value: connected.value ? 'RPC·就绪' : '未就绪',
    warn: !connected.value
  },
  {
    icon: 'i-lucide-smartphone',
    value: sessionCount.value == null ? '—' : `${compactNumber(sessionCount.value)} 会话`,
    warn: !connected.value
  },
  {
    icon: 'i-lucide-cloud-upload',
    value: hermesVersion.value,
    warn: !connected.value,
    dot: !connected.value
  }
])

const connectionLabel = computed(() => {
  if (!isConfigured.value) return '未配置'
  if (connecting.value) return '连接中'
  if (connected.value) return '已连接'
  return '异常'
})

const shortcuts = computed(() => [
  {
    to: '/settings?tab=connection',
    icon: 'i-lucide-plug',
    label: '连接设置',
    value: connectionLabel.value
  },
  {
    to: '/settings?tab=profiles',
    icon: 'i-lucide-atom',
    label: 'Profiles',
    value: isConfigured.value ? profileName.value : '—'
  },
  {
    to: '/jobs',
    icon: 'i-lucide-clock',
    label: '定时任务',
    value: jobCount.value == null ? '—' : `${compactNumber(jobCount.value)} 活跃`
  },
  {
    to: '/settings?tab=status',
    icon: 'i-lucide-activity',
    label: '服务器状态',
    value: connected.value ? '正常' : (isConfigured.value ? '异常' : '—')
  }
])
</script>

<template>
  <div class="hub">
    <UiCard>
      <div class="hub__host">
        <ProfileAvatar
          class="hub__host-icon"
          seed="hermes"
          :size="44"
        />
        <div class="hub__host-text">
          <p class="hub__host-name">
            {{ host }}
          </p>
          <p class="hub__host-status">
            {{ hostMode }}
          </p>
        </div>
        <UiButton
          to="/settings?tab=connection"
          active-class=""
          exact-active-class=""
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-arrow-left-right"
          label="管理"
        />
      </div>
      <div class="hub__dots">
        <div
          v-for="item in statusDots"
          :key="item.icon"
          class="hub__dot"
          :class="{ 'is-warn': item.warn }"
        >
          <span class="hub__dot-icon">
            <UiIcon
              :name="item.icon"
              :size="16"
            />
            <i
              v-if="item.dot"
              class="hub__dot-badge"
            />
          </span>
          <p class="hub__dot-value">
            {{ item.value }}
          </p>
        </div>
      </div>
      <NuxtLink
        v-if="banner"
        class="hub__banner"
        :to="isConfigured ? '/settings?tab=connection' : '/login'"
        active-class=""
        exact-active-class=""
      >
        <span class="hub__banner-text">{{ banner }}</span>
        <span class="hub__banner-action">
          查看
          <UiIcon
            name="i-lucide-chevron-right"
            :size="14"
          />
        </span>
      </NuxtLink>
    </UiCard>

    <div class="hub__shortcuts">
      <NuxtLink
        v-for="item in shortcuts"
        :key="item.label"
        :to="item.to"
        class="hub__shortcut"
        active-class=""
        exact-active-class=""
      >
        <UiIcon
          :name="item.icon"
          :size="20"
        />
        <p class="hub__shortcut-value">
          {{ item.value }}
        </p>
        <p class="hub__shortcut-label">
          {{ item.label }}
        </p>
      </NuxtLink>
    </div>

    <div class="hub__rows">
      <SettingsRow
        icon="i-lucide-palette"
        title="显示设置"
        description="切换明暗主题"
      >
        <template #trailing>
          <div class="hub__appearance">
            <button
              v-for="item in appearanceItems"
              :key="item.value"
              type="button"
              class="hub__appearance-btn"
              :class="{ 'is-active': appearance === item.value }"
              :aria-label="item.label"
              @click="appearance = item.value"
            >
              <UiIcon
                :name="item.icon"
                :size="14"
              />
            </button>
          </div>
        </template>
      </SettingsRow>
      <SettingsRow
        icon="i-lucide-list"
        title="收起工具调用详情"
        description="折叠后只保留一行摘要，点开再看每一步"
      >
        <template #trailing>
          <UiSwitch
            v-model="collapseDetails"
            aria-label="收起工具调用详情"
          />
        </template>
      </SettingsRow>
      <SettingsRow
        icon="i-lucide-sparkles"
        title="技能"
        description="查看服务器当前配置的技能清单"
        to="/settings?tab=skills"
      />
      <SettingsRow
        icon="i-lucide-wrench"
        title="工具集"
        description="已解析的工具集与具体工具"
        to="/settings?tab=tools"
      />
      <SettingsRow
        icon="i-lucide-cpu"
        title="模型"
        :description="currentModel === '默认模型' ? '配置默认模型、密钥与端点' : currentModel"
        to="/settings?tab=models"
      />
      <SettingsRow
        icon="i-lucide-log-out"
        title="退出登录"
        description="断开当前远程网关，回到登录页"
      >
        <template #trailing>
          <UiButton
            color="error"
            variant="ghost"
            size="sm"
            label="退出"
            @click="confirmLogout = true"
          />
        </template>
      </SettingsRow>
    </div>

    <UiConfirm
      v-model:open="confirmLogout"
      tone="danger"
      title="退出登录？"
      description="会断开当前远程网关会话。下次用同一地址重新登录即可。"
      confirm-label="退出"
      @confirm="confirmAndLogout"
    />
  </div>
</template>

<style lang="scss" scoped>
.hub {
  width: 100%;
  max-width: 42rem;
  margin: 0 auto;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.85rem 1rem calc(1.5rem + env(safe-area-inset-bottom, 0px));

  @include sm {
    padding: 1.25rem 1.5rem calc(2rem + env(safe-area-inset-bottom, 0px));
  }

  :deep(.ui-card) {
    border-radius: 1.5rem;
    box-shadow: 0 1px 3px rgb(15 15 20 / 6%);
    padding: 1.05rem 1.05rem 0.95rem;
  }
}

.hub__host {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;

  :deep(.ui-btn) {
    flex-shrink: 0;
  }
}

.hub__host-icon {
  width: 2.75rem;
  height: 2.75rem;
}

.hub__host-text {
  min-width: 0;
  flex: 1;
}

.hub__host-name {
  margin: 0;
  overflow: hidden;
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hub__host-status {
  margin: 0.12rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.hub__dots {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.3rem;
  margin-top: 1.05rem;
}

.hub__dot {
  min-width: 0;
  text-align: center;
  color: var(--color-text-toned);

  &.is-warn {
    color: var(--color-warning);

    .hub__dot-value {
      color: var(--color-warning);
    }
  }
}

.hub__dot-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hub__dot-badge {
  position: absolute;
  top: -0.12rem;
  right: -0.18rem;
  width: 0.42rem;
  height: 0.42rem;
  border: 1.5px solid var(--color-surface);
  border-radius: 50%;
  background: var(--color-warning);
}

.hub__dot-value {
  @include truncate;
  margin: 0.28rem 0 0;
  color: var(--color-text-strong);
  font-size: 10px;
  font-weight: 500;
  line-height: 1.2;
}

.hub__banner {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
  color: var(--color-warning);
  font-size: 0.75rem;
  line-height: 1.35;
}

.hub__banner-text {
  @include truncate;
  min-width: 0;
  flex: 1;
}

.hub__banner-action {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.05rem;
}

.hub__shortcuts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.55rem;
}

.hub__shortcut {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  border-radius: 1.35rem;
  background: var(--color-surface);
  box-shadow: var(--shadow);
  padding: 0.85rem 0.3rem 0.75rem;
  text-align: center;
  color: var(--color-text-toned);
}

.hub__shortcut-value {
  @include truncate;
  max-width: 100%;
  margin: 0.45rem 0 0;
  color: var(--color-text-strong);
  font-size: 0.78rem;
  font-weight: 650;
  line-height: 1.15;
}

.hub__shortcut-label {
  @include truncate;
  max-width: 100%;
  margin: 0.18rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.68rem;
  line-height: 1.2;
}

.hub__rows {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.hub__appearance {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}

.hub__appearance-btn {
  display: flex;
  width: 1.7rem;
  height: 1.7rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--color-text-muted);

  &.is-active {
    background: var(--color-inverted);
    color: var(--color-text-invert);
  }
}
</style>
