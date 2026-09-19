<script setup lang="ts">
import type { ProbeResult, PublicSession } from '#shared/types/gateway'
import { joinRemoteUrl, splitRemoteUrl, type RemoteUrlScheme } from '#shared/utils/remote-url'
import { readCachedGatewayUrl, writeCachedGatewayUrl } from '~/utils/gatewayUrlCache'
import { safeInternalPath } from '~/utils/nav'

definePageMeta({
  layout: false
})

const { session } = useSessionInfo()
const route = useRoute()

const urlScheme = ref<RemoteUrlScheme>('http')
const remoteHost = ref('')
const username = ref('')
const password = ref('')
const token = ref('')
const showPassword = ref(false)
const showToken = ref(false)
const probe = ref<ProbeResult | null>(null)
const probeStatus = ref<'idle' | 'probing' | 'done' | 'error'>('idle')
const submitting = ref(false)
const error = ref(String(route.query.error || ''))
let probeSeq = 0

const schemeItems = [
  { label: 'http://', value: 'http' },
  { label: 'https://', value: 'https' }
]

const remoteHostModel = computed({
  get: () => remoteHost.value,
  set: (value: string) => {
    const trimmed = value.trim()
    if (/^https?:\/\//i.test(trimmed)) {
      applyGatewayUrl(trimmed)
      return
    }
    remoteHost.value = value
  }
})

const trimmedUrl = computed(() => joinRemoteUrl(urlScheme.value, remoteHost.value))
const loginKind = computed(() => {
  if (!probe.value || probe.value.authMode === 'unknown') {
    return null
  }

  if (probe.value.authMode !== 'oauth') {
    return 'token' as const
  }

  if (probe.value.providers.length > 0 && probe.value.providers.every(item => item.supportsPassword)) {
    return 'password' as const
  }

  return 'oauth' as const
})

const providerLabel = computed(() => {
  const providers = probe.value?.providers ?? []

  if (providers.length === 0) {
    return '身份提供方'
  }

  return providers.map(item => item.displayName || item.name).join(' / ')
})

const passwordProvider = computed(
  () => probe.value?.providers.find(item => item.supportsPassword)?.name || 'basic'
)

const urlHint = computed(() => {
  if (probeStatus.value === 'probing') {
    return '正在检测网关认证方式…'
  }
  if (probeStatus.value === 'done' && probe.value) {
    return `已到达 ${probe.value.baseUrl}${probe.value.version ? ` · ${probe.value.version}` : ''}`
  }
  return '填写 host:port，路径前缀例如 /hermes 也可以。'
})

const alertText = computed(() => {
  if (error.value) return error.value
  if (probeStatus.value === 'error') {
    return probe.value?.error || '无法连接到该 Hermes 网关。'
  }
  return ''
})

watch(trimmedUrl, (url, _previous, onCleanup) => {
  const seq = ++probeSeq
  error.value = ''
  probe.value = null

  if (!url || !/^https?:\/\//i.test(url)) {
    probeStatus.value = 'idle'
    return
  }

  probeStatus.value = 'probing'
  const timer = window.setTimeout(async () => {
    try {
      const result = await $fetch<ProbeResult>('/api/probe', {
        method: 'POST',
        body: { url }
      })

      if (seq !== probeSeq) {
        return
      }

      probe.value = result
      probeStatus.value = result.reachable ? 'done' : 'error'
    } catch (caught) {
      if (seq !== probeSeq) {
        return
      }

      probeStatus.value = 'error'
      error.value = fetchErrorMessage(caught)
    }
  }, 500)

  onCleanup(() => window.clearTimeout(timer))
})

async function submitPassword() {
  if (!probe.value?.baseUrl) {
    return
  }

  submitting.value = true
  error.value = ''

  try {
    session.value = await $fetch<PublicSession>('/api/login', {
      method: 'POST',
      body: {
        password: password.value,
        provider: passwordProvider.value,
        url: probe.value.baseUrl,
        username: username.value
      }
    })
    rememberGatewayUrl(session.value.baseUrl || probe.value.baseUrl)
    await navigateTo(safeInternalPath(route.query.redirect), { replace: true })
  } catch (caught) {
    error.value = fetchErrorMessage(caught)
  } finally {
    submitting.value = false
  }
}

async function submitToken() {
  if (!probe.value?.baseUrl) {
    return
  }

  submitting.value = true
  error.value = ''

  try {
    session.value = await $fetch<PublicSession>('/api/login', {
      method: 'POST',
      body: {
        token: token.value,
        url: probe.value.baseUrl
      }
    })
    rememberGatewayUrl(session.value.baseUrl || probe.value.baseUrl)
    await navigateTo(safeInternalPath(route.query.redirect), { replace: true })
  } catch (caught) {
    error.value = fetchErrorMessage(caught)
  } finally {
    submitting.value = false
  }
}

function startOauth() {
  if (!probe.value?.baseUrl) {
    return
  }

  window.location.href = `/api/oauth/start?url=${encodeURIComponent(probe.value.baseUrl)}`
}

function rememberGatewayUrl(url: string | undefined) {
  if (url) {
    writeCachedGatewayUrl(url)
  }
}

function onSchemeChange(value: string) {
  if (value === 'http' || value === 'https') {
    urlScheme.value = value
  }
}

function applyGatewayUrl(raw: string) {
  const parsed = splitRemoteUrl(raw)
  urlScheme.value = parsed.scheme
  remoteHost.value = parsed.host
  void nextTick(() => {
    const el = document.querySelector<HTMLInputElement>('input[name="hermes-url"]')
    if (el && el.value !== parsed.host) {
      el.value = parsed.host
    }
  })
}

onMounted(() => {
  const cached = readCachedGatewayUrl()
  if (cached) {
    applyGatewayUrl(cached)
  }
})

function fetchErrorMessage(caught: unknown): string {
  const record = caught as {
    data?: { message?: string, statusMessage?: string }
    message?: string
    statusMessage?: string
  }
  return record.data?.statusMessage || record.data?.message || record.statusMessage || record.message || '登录失败'
}
</script>

<template>
  <div class="login">
    <div class="login__panel">
      <div class="login__brand">
        <div class="login__logo">
          <AppLogo />
        </div>
        <h1 class="login__title">
          Hermes
        </h1>
        <p class="login__lead">
          用远程网关地址进入聊天
        </p>
      </div>

      <UiCard>
        <form
          class="login__form"
          @submit.prevent="loginKind === 'password' ? submitPassword() : loginKind === 'token' ? submitToken() : undefined"
        >
          <UiFormField
            label="网关 URL"
            :hint="urlHint"
          >
            <div class="login__url">
              <UiSelect
                :model-value="urlScheme"
                :items="schemeItems"
                aria-label="协议"
                name="hermes-url-scheme"
                @update:model-value="onSchemeChange"
              />
              <UiInput
                v-model="remoteHostModel"
                placeholder="127.0.0.1:9119"
                autocomplete="url"
                name="hermes-url"
                spellcheck="false"
              />
            </div>
          </UiFormField>

          <template v-if="loginKind === 'password'">
            <UiFormField
              label="用户名"
              :hint="`该网关使用用户名和密码（${providerLabel}）`"
            >
              <UiInput
                v-model="username"
                autocomplete="username"
                name="hermes-username"
                :disabled="submitting"
                required
              />
            </UiFormField>
            <UiFormField label="密码">
              <UiInput
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                name="hermes-password"
                :disabled="submitting"
                required
              >
                <template #trailing>
                  <UiButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    square
                    :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </UiInput>
            </UiFormField>
            <UiButton
              class="login__submit"
              type="submit"
              color="neutral"
              label="登录"
              icon="i-lucide-log-in"
              :loading="submitting"
              :disabled="submitting"
            />
          </template>

          <template v-else-if="loginKind === 'oauth'">
            <p class="login__oauth">
              该网关使用 {{ providerLabel }}。浏览器会跳到网关完成授权（RFC 8252 native PKCE）。
            </p>
            <UiButton
              class="login__submit"
              type="button"
              color="neutral"
              :label="`使用 ${providerLabel} 登录`"
              icon="i-lucide-log-in"
              @click="startOauth"
            />
          </template>

          <template v-else-if="loginKind === 'token'">
            <UiFormField
              label="会话令牌"
              hint="未开启认证门禁的网关使用 X-Hermes-Session-Token / ?token=。"
            >
              <UiInput
                v-model="token"
                :type="showToken ? 'text' : 'password'"
                autocomplete="off"
                name="hermes-token"
                placeholder="粘贴远程网关 .env 中的会话令牌"
                :disabled="submitting"
                required
              >
                <template #trailing>
                  <UiButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    square
                    :icon="showToken ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    :aria-label="showToken ? '隐藏令牌' : '显示令牌'"
                    @click="showToken = !showToken"
                  />
                </template>
              </UiInput>
            </UiFormField>
            <UiButton
              class="login__submit"
              type="submit"
              color="neutral"
              label="连接"
              icon="i-lucide-log-in"
              :loading="submitting"
              :disabled="submitting"
            />
          </template>

          <p
            class="login__error"
            :class="{ 'is-on': Boolean(alertText) }"
            role="alert"
            aria-live="polite"
          >
            {{ alertText }}
          </p>
        </form>
      </UiCard>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.login {
  display: flex;
  min-height: 100%;
  align-items: center;
  justify-content: center;
  padding: calc(1.5rem + env(safe-area-inset-top, 0px)) 1.15rem calc(1.75rem + env(safe-area-inset-bottom, 0px));
  background: var(--color-bg);
}

.login__panel {
  width: 100%;
  max-width: 24.5rem;
}

.login__brand {
  margin-bottom: 1.15rem;
  text-align: center;
}

.login__logo {
  width: 3.5rem;
  height: 3.5rem;
  margin: 0 auto 0.85rem;
  overflow: hidden;
  border-radius: 50%;
  box-shadow: var(--shadow);
}

.login__title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.login__lead {
  margin: 0.35rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.login__form {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  :deep(.ui-input-wrap .ui-btn) {
    width: auto;
    min-width: 1.75rem;
    min-height: 1.75rem;
    flex-shrink: 0;
  }
}

.login__url {
  display: flex;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);

  &:focus-within {
    border-color: var(--color-inverted);
  }

  :deep(.ui-select) {
    width: auto;
    min-width: 6.75rem;
    flex: 0 0 auto;
    min-height: 2.5rem;
    border: 0;
    border-right: 1px solid var(--color-border);
    border-radius: 0;
    appearance: none;
    background-color: var(--color-bg);
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%237d899c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>");
    background-repeat: no-repeat;
    background-position: right 0.5rem center;
    background-size: 0.9rem;
    padding: 0 1.55rem 0 0.75rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  :deep(.ui-input-wrap) {
    flex: 1;
    min-width: 0;
  }

  :deep(.ui-input-wrap--plain .ui-input) {
    border: 0;
    border-radius: 0;
    background: transparent;
  }
}

.login__submit {
  width: 100%;
  min-height: 2.5rem;
}

.login__oauth {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.login__error {
  @include line-clamp(2);
  margin: 0;
  height: 2.275rem;
  color: var(--color-error);
  font-size: 0.8125rem;
  line-height: 1.4;
  visibility: hidden;

  &.is-on {
    visibility: visible;
  }
}
</style>
