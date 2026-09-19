<script setup lang="ts">
const chat = useChatController()
const password = ref('')

const open = computed(() => Boolean(chat.sudo.value))
const busy = computed(() => Boolean(chat.pendingSudo.value))
const command = computed(() => (chat.sudo.value?.command || '').trim())

watch(() => chat.sudo.value?.requestId, () => {
  password.value = ''
})

async function submit() {
  if (!password.value.trim() || busy.value) return
  await chat.resolveSudo(password.value)
}

async function cancel() {
  if (busy.value || !chat.sudo.value) return
  await chat.resolveSudo('')
}

function onOpen(value: boolean) {
  if (!value) void cancel()
}
</script>

<template>
  <UiModal
    :open="open"
    @update:open="onOpen"
  >
    <template #content>
      <form
        class="sudo"
        @submit.prevent="submit"
      >
        <div class="sudo__icon">
          <UiIcon
            name="i-lucide-lock"
            :size="22"
          />
        </div>
        <p class="sudo__title">
          管理员密码
        </p>
        <p class="sudo__desc">
          输入 sudo 密码前，请先检查命令。密码会发给执行命令的 agent，并在本次会话中缓存。
        </p>
        <pre
          v-if="command"
          class="sudo__command"
        >{{ command }}</pre>
        <p
          v-else
          class="sudo__missing"
        >
          此 agent 未提供命令。如果无法在对话中确认，请取消。
        </p>
        <UiInput
          v-model="password"
          type="password"
          placeholder="sudo 密码"
          :disabled="busy"
          autofocus
        />
        <div class="sudo__actions">
          <UiButton
            color="neutral"
            variant="outline"
            label="取消"
            :disabled="busy"
            @click="cancel"
          />
          <UiButton
            color="primary"
            type="submit"
            label="发送"
            :disabled="busy || !password.trim()"
            :loading="busy"
          />
        </div>
      </form>
    </template>
  </UiModal>
</template>

<style lang="scss" scoped>
.sudo {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 1.25rem 1.1rem 1.05rem;
}

.sudo__icon {
  display: flex;
  width: 2.6rem;
  height: 2.6rem;
  align-items: center;
  justify-content: center;
  align-self: center;
  margin-bottom: 0.75rem;
  border-radius: 50%;
  background: var(--color-elevated);
  color: var(--color-text-strong);
}

.sudo__title {
  margin: 0;
  color: var(--color-text-strong);
  font-size: 1.05rem;
  font-weight: 650;
  text-align: center;
}

.sudo__desc {
  margin: 0.4rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  line-height: 1.5;
  text-align: center;
}

.sudo__command {
  margin: 0.75rem 0 0;
  max-height: 8rem;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 0.7rem;
  background: var(--color-elevated);
  padding: 0.55rem 0.7rem;
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.sudo__missing {
  margin: 0.75rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  line-height: 1.45;
  text-align: center;
}

.sudo :deep(.ui-input-wrap) {
  margin-top: 0.75rem;
}

.sudo__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
  margin-top: 1rem;

  :deep(.ui-btn) {
    min-height: 2.6rem;
    width: 100%;
    border-radius: 0.85rem;
  }
}
</style>
