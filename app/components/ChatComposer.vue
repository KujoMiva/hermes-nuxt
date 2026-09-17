<script setup lang="ts">
import { isAbortError } from '~/composables/useHermes'
import { CHAT_IMAGE_MAX_BYTES } from '~/utils/uploadImage'

type DraftImage = {
  id: string
  preview: string
  file: File
  progress: number | null
}

const chat = useChatController()
const { isConfigured } = useConnection()
const toast = useToast()

const input = ref('')
const images = ref<DraftImage[]>([])
const fileRef = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const expanded = ref(false)
const uploading = ref(false)
const dragging = ref(false)
const uploadIndex = ref(0)
const uploadPercent = ref(0)
let uploadAbort: AbortController | null = null

const canSend = computed(() => Boolean(input.value.trim() || images.value.length) && !uploading.value)
const canSteer = computed(() => Boolean(input.value.trim()))
const uploadLabel = computed(() => {
  const total = images.value.length
  if (!total) return '正在上传图片…'
  if (total === 1) return `正在上传图片 ${uploadPercent.value}%`
  return `正在上传 ${uploadIndex.value}/${total} · ${uploadPercent.value}%`
})
const placeholder = computed(() => {
  if (uploading.value) return uploadLabel.value
  if (!chat.busy.value) return '请输入消息...'
  return canSteer.value ? '发送引导，在下一个工具边界生效' : 'Agent 正在工作，输入可引导'
})

function draftId() {
  return `img_${Math.random().toString(36).slice(2, 10)}`
}

function addFiles(files: File[]) {
  if (uploading.value) return
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      toast.add({
        title: '图片过大',
        description: '不能超过 20MB',
        color: 'error'
      })
      continue
    }
    images.value.push({
      id: draftId(),
      preview: URL.createObjectURL(file),
      file,
      progress: null
    })
  }
}

function removeDraft(index: number) {
  if (uploading.value) return
  const [draft] = images.value.splice(index, 1)
  if (draft) URL.revokeObjectURL(draft.preview)
}

function patchDraft(id: string, progress: number) {
  const draft = images.value.find(item => item.id === id)
  if (draft) draft.progress = progress
}

async function uploadDraft(draft: DraftImage, loadedBytes: { done: number, total: number }) {
  patchDraft(draft.id, 0)
  const stored = await chat.attachImage(draft.file, (progress) => {
    patchDraft(draft.id, progress.percent)
    const loaded = loadedBytes.done + progress.loaded
    uploadPercent.value = Math.min(100, Math.round((loaded / loadedBytes.total) * 100))
  })
  patchDraft(draft.id, 100)
  loadedBytes.done += Math.max(draft.file.size, 1)
  uploadPercent.value = Math.min(100, Math.round((loadedBytes.done / loadedBytes.total) * 100))
  return stored.ref
}

function syncTextareaHeight() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  const next = el.scrollHeight
  el.style.height = `${next}px`
  const styles = getComputedStyle(el)
  const line = Number.parseFloat(styles.lineHeight)
  const pad = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom)
  expanded.value = next > line + pad + 1
}

watch(input, async () => {
  await nextTick()
  syncTextareaHeight()
})

async function onFiles(event: Event) {
  const inputEl = event.target as HTMLInputElement
  addFiles(Array.from(inputEl.files || []))
  inputEl.value = ''
}

function onPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files || [])
  if (!files.some(file => file.type.startsWith('image/'))) return
  event.preventDefault()
  addFiles(files)
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const files = Array.from(event.dataTransfer?.files || [])
  if (!files.length) return
  event.preventDefault()
  addFiles(files)
}

async function onSubmit() {
  if (chat.busy.value) {
    const text = input.value.trim()
    if (text) {
      input.value = ''
      await chat.steer(text)
    }
    return
  }
  if (!isConfigured.value) {
    await navigateTo('/login')
    return
  }
  const text = input.value
  const drafts = [...images.value]
  if (!text.trim() && !drafts.length) return
  input.value = ''

  const refs: string[] = []
  if (drafts.length) {
    uploading.value = true
    uploadIndex.value = 0
    uploadPercent.value = 0
    uploadAbort?.abort()
    uploadAbort = new AbortController()
    try {
      const loadedBytes = {
        done: 0,
        total: drafts.reduce((sum, draft) => sum + Math.max(draft.file.size, 1), 0)
      }
      for (const [index, draft] of drafts.entries()) {
        uploadIndex.value = index + 1
        refs.push(await uploadDraft(draft, loadedBytes))
      }
      for (const draft of drafts) URL.revokeObjectURL(draft.preview)
      images.value = []
    } catch (error) {
      if (isAbortError(error)) return
      input.value = text
      for (const draft of images.value) draft.progress = null
      toast.add({
        title: '无法发送图片',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
      return
    } finally {
      uploading.value = false
      uploadAbort = null
    }
  }

  await chat.send(text, refs)
}

onBeforeUnmount(() => {
  uploadAbort?.abort()
  for (const draft of images.value) URL.revokeObjectURL(draft.preview)
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (chat.busy.value && !canSteer.value) return
    void onSubmit()
  }
}

async function unqueueSteer() {
  const text = chat.clearPendingSteer().trim()
  if (!text) return
  if (!input.value.trim()) {
    input.value = text
    await nextTick()
    syncTextareaHeight()
  }
}

const choiceLabel: Record<string, string> = {
  once: '允许一次',
  session: '本会话允许',
  always: '始终允许',
  deny: '拒绝'
}
</script>

<template>
  <div
    class="composer"
    :class="{ 'is-dragging': dragging }"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop="onDrop"
  >
    <div
      v-if="chat.approval.value"
      class="composer__approval"
    >
      <div class="composer__approval-title">
        <UiIcon
          name="i-lucide-shield-alert"
          :size="16"
        />
        需要你确认一次工具调用
      </div>
      <p class="composer__approval-body">
        {{ chat.approval.value.command || chat.approval.value.tool_name || '危险操作等待审批' }}
      </p>
      <div class="composer__row">
        <UiButton
          v-for="choice in (chat.approval.value.choices || ['once', 'deny'])"
          :key="choice"
          size="xs"
          :color="choice === 'deny' ? 'error' : 'primary'"
          :variant="choice === 'deny' ? 'outline' : 'solid'"
          :disabled="Boolean(chat.pendingApproval.value)"
          :loading="Boolean(chat.pendingApproval.value)"
          @click="chat.resolveApproval(choice)"
        >
          {{ choiceLabel[choice] || choice }}
        </UiButton>
      </div>
    </div>

    <div
      v-if="chat.pendingSteer.value"
      class="composer__queued"
    >
      <div class="composer__queued-head">
        <span class="composer__queued-title">
          <UiIcon
            name="i-lucide-navigation"
            :size="14"
          />
          排队中的引导
        </span>
        <UiButton
          size="xs"
          color="neutral"
          variant="ghost"
          label="撤回"
          aria-label="撤回排队中的引导"
          @click="unqueueSteer"
        />
      </div>
      <p class="composer__queued-body">
        {{ chat.pendingSteer.value }}
      </p>
    </div>

    <div
      v-if="images.length"
      class="composer__images"
    >
      <button
        v-for="(item, index) in images"
        :key="item.id"
        type="button"
        class="composer__thumb"
        :class="{ 'is-busy': uploading }"
        :disabled="uploading"
        :aria-label="uploading ? `上传中 ${item.progress ?? 0}%` : '移除图片'"
        @click="removeDraft(index)"
      >
        <img
          :src="item.preview"
          alt="待发送图片"
        >
        <span
          v-if="uploading"
          class="composer__thumb-progress"
          role="progressbar"
          :aria-valuenow="item.progress ?? 0"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`上传中 ${item.progress ?? 0}%`"
        >
          <svg
            class="composer__thumb-ring"
            viewBox="0 0 36 36"
            aria-hidden="true"
          >
            <circle
              class="composer__thumb-ring-track"
              cx="18"
              cy="18"
              r="14"
              pathLength="100"
            />
            <circle
              class="composer__thumb-ring-value"
              cx="18"
              cy="18"
              r="14"
              pathLength="100"
              stroke-dasharray="100"
              :stroke-dashoffset="100 - (item.progress ?? 0)"
            />
          </svg>
          <span class="composer__thumb-pct">{{ item.progress ?? 0 }}</span>
        </span>
        <span
          v-else
          class="composer__thumb-x"
        >
          <UiIcon
            name="i-lucide-x"
            :size="12"
          />
        </span>
      </button>
    </div>

    <ChatComposerBar />

    <div
      class="composer__bar"
      :class="{ 'is-expanded': expanded }"
    >
      <UiButton
        icon="i-lucide-plus"
        color="neutral"
        variant="ghost"
        size="sm"
        square
        pill
        aria-label="添加图片"
        :disabled="uploading"
        @click="fileRef?.click()"
      />
      <input
        ref="fileRef"
        type="file"
        accept="image/*"
        multiple
        class="composer__file"
        @change="onFiles"
      >
      <textarea
        ref="textareaRef"
        v-model="input"
        rows="1"
        class="composer__input"
        :placeholder="placeholder"
        @paste="onPaste"
        @input="syncTextareaHeight"
        @keydown="onKeydown"
      />
      <UiButton
        v-if="chat.busy.value && canSteer"
        color="primary"
        variant="solid"
        size="sm"
        pill
        icon="i-lucide-navigation"
        label="引导"
        aria-label="发送引导"
        @click="onSubmit"
      />
      <UiButton
        v-else-if="chat.busy.value"
        color="error"
        variant="soft"
        size="sm"
        square
        pill
        icon="i-lucide-square"
        :loading="chat.stopping.value"
        :disabled="chat.stopping.value"
        aria-label="停止"
        @click="chat.stop()"
      />
      <UiButton
        v-else
        :color="canSend ? 'primary' : 'neutral'"
        :variant="canSend ? 'solid' : 'soft'"
        size="sm"
        square
        pill
        :icon="uploading ? undefined : 'i-lucide-arrow-up'"
        :loading="uploading"
        :disabled="!canSend"
        aria-label="发送"
        @click="onSubmit"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.composer {
  width: 100%;
  max-width: 48rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  pointer-events: none;

  @media (hover: hover) and (pointer: fine) {
    pointer-events: auto;
  }

  &.is-dragging {
    outline: 2px dashed var(--color-border);
    outline-offset: 4px;
    border-radius: 1.25rem;
  }
}

.composer__approval {
  border-radius: 1.25rem;
  background: var(--color-warning-bg);
  padding: 0.75rem;
  pointer-events: auto;
}

.composer__approval-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
}

.composer__approval-body {
  margin: 0.5rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  white-space: pre-wrap;
}

.composer__queued {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: 1.25rem;
  background: var(--color-surface);
  box-shadow: var(--shadow);
  padding: 0.55rem 0.7rem 0.65rem;
  pointer-events: auto;
}

.composer__queued-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.composer__queued-title {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 0.35rem;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-weight: 500;
}

.composer__queued-body {
  margin: 0;
  max-height: 6rem;
  overflow-y: auto;
  color: var(--color-text);
  font-size: 0.8125rem;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.composer__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.composer__images {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-inline: 0.25rem;
  pointer-events: auto;
}

.composer__thumb {
  position: relative;
  width: 3.5rem;
  height: 3.5rem;
  overflow: hidden;
  border: 0;
  border-radius: 0.85rem;
  padding: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &.is-busy {
    cursor: default;
  }
}

.composer__thumb-x {
  position: absolute;
  inset: auto 0.15rem 0.15rem auto;
  display: flex;
  width: 1rem;
  height: 1rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill);
  background: rgb(15 15 20 / 65%);
  color: #fff;
}

.composer__thumb-progress {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(15 15 20 / 46%);
  pointer-events: none;
}

.composer__thumb-ring {
  width: 2.25rem;
  height: 2.25rem;
  transform: rotate(-90deg);
}

.composer__thumb-ring-track,
.composer__thumb-ring-value {
  fill: none;
  stroke-width: 2.75;
}

.composer__thumb-ring-track {
  stroke: rgb(255 255 255 / 28%);
}

.composer__thumb-ring-value {
  stroke: #fff;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.12s ease;
}

.composer__thumb-pct {
  position: absolute;
  color: #fff;
  font-size: 0.625rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 1;
}

.composer__bar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid var(--color-border);
  border-radius: 1.5rem;
  background: var(--color-surface);
  box-shadow: var(--shadow-composer);
  padding: 0.3rem;

  :deep(.ui-btn),
  .composer__input {
    pointer-events: auto;
  }

  :deep(.ui-icon) {
    display: block;
  }

  &.is-expanded {
    align-items: flex-end;

    :deep(.ui-btn) {
      transform: none;
    }
  }
}

.composer__file {
  display: none;
}

.composer__input {
  --composer-line: 1.5rem;
  --composer-pad: 0.25rem;
  height: 2rem;
  min-height: 2rem;
  max-height: calc(var(--composer-line) * 6 + var(--composer-pad) * 2);
  flex: 1;
  resize: none;
  overflow-y: auto;
  border: 0;
  background: transparent;
  padding: var(--composer-pad) 0.2rem;
  font-size: 1rem;
  line-height: var(--composer-line);
  outline: none;

  &::placeholder {
    color: var(--color-text-dimmed);
  }
}
</style>
