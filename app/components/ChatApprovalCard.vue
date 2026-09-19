<script setup lang="ts">
const chat = useChatController()
const moreOpen = ref(false)
const confirmAlways = ref(false)
const root = ref<HTMLElement | null>(null)

const request = computed(() => chat.approval.value)
const busy = computed(() => Boolean(chat.pendingApproval.value))
const listed = computed(() => request.value?.choices)
const allowSession = computed(() => listed.value ? listed.value.includes('session') : true)
const allowAlways = computed(() => (
  request.value?.smart_denied === true
    ? Boolean(listed.value?.includes('always'))
    : listed.value ? listed.value.includes('always') : true
))
const hasMore = computed(() => allowSession.value || allowAlways.value)
const command = computed(() => (request.value?.command || '').trim())
const alwaysHint = computed(() => {
  const pattern = request.value?.tool_name || '这条命令'
  return `这会将“${pattern}”模式加入永久允许列表。Hermes 对类似命令将不再询问，包括当前会话和未来会话。`
})

function closeMore() {
  moreOpen.value = false
}

async function respond(choice: string) {
  closeMore()
  confirmAlways.value = false
  await chat.resolveApproval(choice)
}

function onDocPointer(event: PointerEvent) {
  if (!moreOpen.value) return
  if (root.value?.contains(event.target as Node)) return
  closeMore()
}

onMounted(() => document.addEventListener('pointerdown', onDocPointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer))
</script>

<template>
  <section
    v-if="request"
    ref="root"
    class="approval"
  >
    <div class="approval__card">
      <div class="approval__head">
        <UiIcon
          name="i-lucide-terminal"
          :size="14"
        />
        命令
      </div>
      <pre
        v-if="command"
        class="approval__command"
      >{{ command }}</pre>
      <p
        v-else
        class="approval__fallback"
      >
        {{ request.tool_name || '危险操作等待审批' }}
      </p>
      <div class="approval__actions">
        <UiButton
          size="xs"
          color="neutral"
          variant="ghost"
          label="拒绝"
          :disabled="busy"
          @click="respond('deny')"
        />
        <div
          v-if="hasMore"
          class="approval__more"
        >
          <UiButton
            size="xs"
            color="neutral"
            variant="soft"
            :disabled="busy"
            aria-label="更多审批选项"
            @click="moreOpen = !moreOpen"
          >
            始终允许…
            <UiIcon
              name="i-lucide-chevron-down"
              :size="12"
            />
          </UiButton>
          <div
            v-if="moreOpen"
            class="approval__menu"
          >
            <button
              v-if="allowSession"
              type="button"
              @click="respond('session')"
            >
              允许本会话
            </button>
            <button
              v-if="allowAlways"
              type="button"
              @click="closeMore(); confirmAlways = true"
            >
              始终允许…
            </button>
            <button
              type="button"
              class="is-danger"
              @click="respond('deny')"
            >
              拒绝
            </button>
          </div>
        </div>
        <UiButton
          size="xs"
          color="primary"
          :disabled="busy"
          :loading="busy"
          @click="respond('once')"
        >
          运行
          <span class="approval__enter">↵</span>
        </UiButton>
      </div>
    </div>

    <UiConfirm
      v-model:open="confirmAlways"
      title="始终允许此命令？"
      :description="alwaysHint"
      confirm-label="始终允许"
      tone="danger"
      :loading="busy"
      @confirm="respond('always')"
      @cancel="confirmAlways = false"
    />
  </section>
</template>

<style lang="scss" scoped>
.approval {
  width: 100%;
  min-width: 0;
  margin: 0.35rem 0 0.15rem;
}

.approval__card {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 0.9rem;
  background: var(--color-surface);
}

.approval__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.65rem 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;

  :deep(.ui-icon) {
    display: block;
  }
}

.approval__command {
  margin: 0;
  max-height: 10rem;
  overflow: auto;
  padding: 0.5rem 0.65rem;
  color: var(--color-text-strong);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.approval__fallback {
  margin: 0;
  padding: 0.5rem 0.65rem;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}

.approval__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
  padding: 0.25rem 0.5rem 0.5rem;
}

.approval__enter {
  margin-left: 0.15rem;
  opacity: 0.6;
  font-size: 0.625rem;
}

.approval__more {
  position: relative;
}

.approval__menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 0.3rem);
  z-index: 12;
  display: grid;
  min-width: 9.5rem;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 0.7rem;
  background: var(--color-surface);
  box-shadow: var(--shadow);

  button {
    border: 0;
    background: transparent;
    padding: 0.45rem 0.7rem;
    color: var(--color-text);
    font: inherit;
    font-size: 0.8125rem;
    text-align: start;

    &:hover {
      background: var(--color-elevated);
    }

    &.is-danger {
      color: var(--color-error);
    }
  }
}
</style>
