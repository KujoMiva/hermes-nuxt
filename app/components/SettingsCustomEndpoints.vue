<script setup lang="ts">
import type { CustomEndpoint } from '~/types/hermes'

defineOptions({ name: 'SettingsCustomEndpoints' })

const props = defineProps<{
  applying: boolean
  endpoints: CustomEndpoint[]
}>()

const emit = defineEmits<{
  save: [payload: {
    id?: string
    name: string
    base_url: string
    model: string
    api_key?: string
    context_length?: number
    discover_models?: boolean
    make_default?: boolean
  }]
  activate: [id: string]
  remove: [id: string]
}>()

const toast = useToast()
const dashboard = useDashboardApi()
const formOpen = ref(false)
const probing = ref(false)
const confirmId = ref('')
const form = reactive({
  id: '',
  name: '',
  baseUrl: '',
  model: '',
  apiKey: '',
  contextLength: '',
  discoverModels: true,
  makeDefault: false
})

function resetForm() {
  form.id = ''
  form.name = ''
  form.baseUrl = ''
  form.model = ''
  form.apiKey = ''
  form.contextLength = ''
  form.discoverModels = true
  form.makeDefault = false
}

function startCreate() {
  resetForm()
  form.makeDefault = !props.endpoints.length
  formOpen.value = true
}

function startEdit(item: CustomEndpoint) {
  form.id = item.id
  form.name = item.name
  form.baseUrl = item.base_url
  form.model = item.model
  form.apiKey = ''
  form.contextLength = item.context_length ? String(item.context_length) : ''
  form.discoverModels = item.discover_models !== false
  form.makeDefault = Boolean(item.is_current)
  formOpen.value = true
}

function payload() {
  const contextLength = Number.parseInt(form.contextLength, 10)
  return {
    id: form.id.trim() || undefined,
    name: form.name.trim(),
    base_url: form.baseUrl.trim(),
    model: form.model.trim(),
    api_key: form.apiKey.trim() || undefined,
    context_length: Number.isFinite(contextLength) && contextLength > 0 ? contextLength : undefined,
    discover_models: form.discoverModels,
    make_default: form.makeDefault
  }
}

async function probe() {
  if (!form.baseUrl.trim()) {
    toast.add({ title: '请先填写 Base URL', color: 'warning' })
    return
  }
  probing.value = true
  try {
    const result = await dashboard.request<{ ok?: boolean, reachable?: boolean, message?: string, models?: string[] }>(
      '/providers/custom-endpoints/validate',
      {
        method: 'POST',
        body: payload(),
        timeout: 20_000
      }
    )
    if (result.models?.length && !form.model) form.model = result.models[0]
    toast.add({
      title: result.ok ? '端点可达' : '探测完成',
      description: result.message || (result.reachable ? '已连通' : '无法连通'),
      color: result.ok ? 'success' : 'warning'
    })
  } catch (error) {
    toast.add({
      title: '无法探测端点',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    probing.value = false
  }
}

async function submit() {
  if (!form.name.trim() || !form.baseUrl.trim() || !form.model.trim()) {
    toast.add({ title: '名称、URL 和模型都必填', color: 'warning' })
    return
  }
  emit('save', payload())
  formOpen.value = false
}
</script>

<template>
  <section class="endpoints">
    <div class="endpoints__head">
      <div>
        <h2>自定义端点</h2>
        <p>OpenAI 兼容的本地或私有接口，例如 Ollama、vLLM、LM Studio。</p>
      </div>
      <UiButton
        size="sm"
        color="neutral"
        variant="outline"
        icon="i-lucide-plus"
        label="添加"
        @click="startCreate"
      />
    </div>

    <p
      v-if="!endpoints.length && !formOpen"
      class="endpoints__empty"
    >
      还没有自定义端点。
    </p>

    <UiCard
      v-for="item in endpoints"
      :key="item.id"
    >
      <div class="endpoint">
        <div class="endpoint__text">
          <p class="endpoint__name">
            {{ item.name }}
            <UiBadge
              v-if="item.is_current"
              color="success"
            >
              当前默认
            </UiBadge>
          </p>
          <p class="endpoint__meta">
            {{ item.model }} · {{ item.base_url }}
          </p>
        </div>
        <div class="endpoint__actions">
          <UiButton
            size="xs"
            color="neutral"
            variant="ghost"
            label="设为默认"
            :disabled="item.is_current || applying"
            @click="emit('activate', item.id)"
          />
          <UiButton
            size="xs"
            color="neutral"
            variant="ghost"
            label="编辑"
            @click="startEdit(item)"
          />
          <UiButton
            size="xs"
            color="error"
            variant="ghost"
            label="删除"
            :disabled="applying"
            @click="confirmId = item.id"
          />
        </div>
      </div>
    </UiCard>

    <UiCard v-if="formOpen">
      <div class="form">
        <UiFormField :label="form.id ? '编辑端点' : '新的端点'">
          <UiInput
            v-model="form.name"
            placeholder="名称，例如 home-ollama"
          />
        </UiFormField>
        <UiFormField
          label="Base URL"
          hint="需要包含 /v1，例如 http://127.0.0.1:11434/v1"
        >
          <UiInput
            v-model="form.baseUrl"
            placeholder="http://127.0.0.1:11434/v1"
          />
        </UiFormField>
        <UiFormField label="默认模型">
          <UiInput
            v-model="form.model"
            placeholder="llama3.2"
          />
        </UiFormField>
        <UiFormField
          label="API Key（可选）"
          hint="已保存的密钥不会回显。留空表示不改。"
        >
          <UiInput
            v-model="form.apiKey"
            type="password"
            autocomplete="off"
            placeholder="sk-…"
          />
        </UiFormField>
        <UiFormField
          label="上下文长度（可选）"
        >
          <UiInput
            v-model="form.contextLength"
            inputmode="numeric"
            placeholder="例如 131072"
          />
        </UiFormField>
        <div class="form__toggles">
          <label class="form__toggle">
            <UiSwitch v-model="form.discoverModels" />
            自动发现模型
          </label>
          <label class="form__toggle">
            <UiSwitch v-model="form.makeDefault" />
            保存后设为默认
          </label>
        </div>
        <div class="form__actions">
          <UiButton
            size="sm"
            color="neutral"
            variant="outline"
            :loading="probing"
            label="探测"
            @click="probe"
          />
          <UiButton
            size="sm"
            color="neutral"
            variant="ghost"
            label="取消"
            @click="formOpen = false"
          />
          <UiButton
            size="sm"
            :loading="applying"
            label="保存"
            icon="i-lucide-save"
            @click="submit"
          />
        </div>
      </div>
    </UiCard>

    <UiConfirm
      :open="Boolean(confirmId)"
      tone="danger"
      title="删除这个端点？"
      description="会从当前 Profile 的 config.yaml 里移除，不会动正在进行的对话。"
      confirm-label="删除"
      @update:open="value => { if (!value) confirmId = '' }"
      @confirm="emit('remove', confirmId); confirmId = ''"
    />
  </section>
</template>

<style lang="scss" scoped>
.endpoints {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.endpoints__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;

  h2 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
  }

  p {
    margin: 0.2rem 0 0;
    color: var(--color-text-muted);
    font-size: 0.75rem;
  }
}

.endpoints__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}

.endpoint {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.65rem;
}

.endpoint__name {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-weight: 600;
}

.endpoint__meta {
  @include truncate;
  margin: 0.2rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.endpoint__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.form__toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.form__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8125rem;
}

.form__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.4rem;
}
</style>
