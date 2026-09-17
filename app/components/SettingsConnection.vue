<script setup lang="ts">
defineOptions({ name: 'SettingsConnection' })

const connection = useConnection()
const { request } = useGateway()
const toast = useToast()

const form = reactive({
  systemPrompt: connection.systemPrompt.value || ''
})

async function savePrompt() {
  connection.apply({ systemPrompt: form.systemPrompt })
  try {
    await request('config.set', {
      key: 'prompt',
      value: form.systemPrompt.trim() || 'clear'
    })
    toast.add({ title: '系统提示已保存到当前 Profile', color: 'success' })
  } catch (error) {
    toast.add({
      title: '已保存在本机，网关未接受',
      description: error instanceof Error ? error.message : String(error),
      color: 'warning'
    })
  }
}

watch(
  () => connection.systemPrompt.value,
  (systemPrompt) => {
    form.systemPrompt = systemPrompt || ''
  }
)
</script>

<template>
  <div class="connection">
    <p class="connection__lead">
      当前连接在登录时确定。换网关请到设置首页退出后重新登录。
    </p>
    <UiCard>
      <div class="connection__form">
        <UiFormField
          label="当前网关"
          hint="浏览器只连本控制台；本控制台再连远程网关。"
        >
          <UiInput
            :model-value="connection.endpointHref.value"
            readonly
          />
        </UiFormField>
        <UiFormField
          label="附加系统提示（可选）"
          hint="写入当前 Profile 的 custom_prompt，叠加在 SOUL.md 之上。"
        >
          <UiTextarea
            v-model="form.systemPrompt"
            :rows="4"
            placeholder="提示词..."
          />
        </UiFormField>
        <UiButton
          color="neutral"
          label="保存提示"
          icon="i-lucide-save"
          @click="savePrompt"
        />
      </div>
    </UiCard>
  </div>
</template>

<style lang="scss" scoped>
.connection {
  width: 100%;
  max-width: 42rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.connection__lead {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.connection__form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.connection__form :deep(.ui-input[readonly]) {
  color: var(--color-text-muted);
  cursor: default;
}
</style>
