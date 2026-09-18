<script setup lang="ts">
import type { ChatThreadMessage } from '~/types/hermes'
import { chatMediaSrc } from '~/utils/imageRefs'
import { stopKindLabel } from '~/utils/chatRun'
import { visibleTools } from '~/utils/toolRun'

const props = defineProps<{
  message: ChatThreadMessage
}>()

const chat = useChatController()
const copied = ref(false)
const editing = ref(false)
const saving = ref(false)
const confirmOpen = ref(false)
const draft = ref('')
const editorRef = ref<HTMLTextAreaElement | null>(null)
const failed = ref<Record<string, boolean>>({})
const stopLabel = computed(() => stopKindLabel(props.message.stopKind))
const tools = computed(() => visibleTools(props.message.tools || []))
const canEdit = computed(() => props.message.role === 'user' && Boolean(props.message.content?.trim()))
const canCommit = computed(() => Boolean(draft.value.trim()) && draft.value.trim() !== props.message.content.trim())

const hasLaterTurns = computed(() => {
  const index = chat.messages.value.findIndex(item => item.id === props.message.id)
  if (index < 0) return false
  return index < chat.messages.value.length - 1 || chat.busy.value
})

function hasTextSelection() {
  if (!import.meta.client) return false
  const selection = window.getSelection()
  return Boolean(selection && !selection.isCollapsed && selection.toString().length > 0)
}

async function copy() {
  await navigator.clipboard.writeText(props.message.content || '')
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1500)
}

function srcOf(ref: string) {
  return chatMediaSrc(ref)
}

function syncEditorHeight() {
  const el = editorRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

async function startEdit() {
  if (!canEdit.value || editing.value || saving.value) return
  if (hasTextSelection()) return
  draft.value = props.message.content
  editing.value = true
  await nextTick()
  const el = editorRef.value
  if (!el) return
  el.focus()
  el.setSelectionRange(el.value.length, el.value.length)
  syncEditorHeight()
}

function cancelEdit() {
  if (saving.value) return
  editing.value = false
  confirmOpen.value = false
  draft.value = props.message.content
}

function requestCommit() {
  if (saving.value || !canCommit.value) {
    if (!canCommit.value) cancelEdit()
    return
  }
  if (hasLaterTurns.value) {
    confirmOpen.value = true
    return
  }
  void commitEdit()
}

async function commitEdit() {
  const text = draft.value.trim()
  if (!text || text === props.message.content.trim()) {
    cancelEdit()
    return
  }
  saving.value = true
  confirmOpen.value = false
  try {
    await chat.editMessage(props.message.id, text)
    editing.value = false
  } finally {
    saving.value = false
  }
}

function onEditorKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
    return
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    requestCommit()
  }
}
</script>

<template>
  <article
    class="bubble"
    :class="{ 'is-user': message.role === 'user' }"
  >
    <div
      v-if="message.role !== 'user'"
      class="bubble__avatar"
    >
      <ProfileAvatar
        seed="hermes"
        :size="32"
      />
    </div>

    <div
      class="bubble__body"
      :class="{ 'is-user': message.role === 'user' }"
    >
      <div
        v-if="message.images?.length"
        class="bubble__images"
      >
        <img
          v-for="(src, index) in message.images"
          v-show="!failed[src]"
          :key="index"
          :src="srcOf(src)"
          alt="附件图片"
          @error="failed[src] = true"
        >
      </div>

      <div
        v-if="message.role === 'user' && editing"
        class="bubble__editor"
      >
        <textarea
          ref="editorRef"
          v-model="draft"
          class="bubble__editor-input"
          rows="1"
          :disabled="saving"
          @input="syncEditorHeight"
          @keydown="onEditorKeydown"
        />
        <div class="bubble__editor-actions">
          <UiButton
            color="neutral"
            variant="ghost"
            size="xs"
            label="取消"
            :disabled="saving"
            @click="cancelEdit"
          />
          <UiButton
            color="primary"
            size="xs"
            label="发送"
            :loading="saving"
            :disabled="!canCommit || saving"
            @click="requestCommit"
          />
        </div>
      </div>

      <button
        v-else-if="message.role === 'user' && message.content"
        type="button"
        class="bubble__user"
        aria-label="点击编辑消息"
        @click="startEdit"
      >
        {{ message.content }}
        <span
          class="bubble__edit-icon"
          aria-hidden="true"
        >
          <UiIcon
            name="i-lucide-pencil"
            :size="12"
          />
        </span>
      </button>

      <div
        v-else-if="message.role !== 'user'"
        class="bubble__assistant"
      >
        <ThinkingDisclosure
          v-if="message.reasoning"
          :text="message.reasoning"
          :pending="Boolean(message.reasoningLive)"
          :started-at="message.reasoningStartedAt"
          :ended-at="message.reasoningEndedAt"
        />

        <ToolRunSummary
          v-if="tools.length"
          :tools="tools"
          :live="Boolean(message.streaming)"
        />

        <div
          v-if="message.content"
          class="bubble__md"
        >
          <MarkdownContent
            :source="message.content"
            :live="Boolean(message.streaming && message.stopKind !== 'stopping')"
          />
        </div>
        <ChatWaitingFace
          v-else-if="message.streaming && !stopLabel && !message.reasoning && !tools.length"
        />
        <p
          v-if="stopLabel && (!message.streaming || message.stopKind === 'stopping')"
          class="bubble__stop"
        >
          {{ stopLabel }}
        </p>

        <div
          v-if="message.content && !message.streaming"
          class="bubble__copy"
        >
          <UiButton
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="copied ? '已复制' : '复制'"
            @click="copy"
          />
        </div>
      </div>
    </div>
  </article>

  <UiConfirm
    v-model:open="confirmOpen"
    title="重新生成之后的对话？"
    description="修改这条消息会删除它之后的全部回复，并按新内容重新发送。"
    confirm-label="重新发送"
    :loading="saving"
    @confirm="commitEdit"
    @cancel="confirmOpen = false"
  />
</template>

<style lang="scss" scoped>
.bubble {
  display: flex;
  width: 100%;
  gap: 0.75rem;

  &.is-user {
    justify-content: flex-end;
  }
}

.bubble__avatar {
  display: none;
  flex-shrink: 0;
  margin-top: 0.15rem;

  @include sm {
    display: block;
  }
}

.bubble__body {
  max-width: 100%;
  min-width: 0;

  &:not(.is-user) {
    width: 100%;
    flex: 1;
  }

  &.is-user {
    display: flex;
    max-width: 92%;
    flex-direction: column;
    align-items: flex-end;

    @include sm {
      max-width: 80%;
    }
  }
}

.bubble__images {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;

  img {
    max-height: 10rem;
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    object-fit: cover;
  }
}

.bubble__user {
  position: relative;
  max-width: 100%;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 1.125rem;
  background: var(--color-elevated);
  padding: 0.65rem 1.85rem 0.65rem 1rem;
  color: var(--color-text-strong);
  font: inherit;
  font-size: 0.875rem;
  line-height: 1.45;
  text-align: left;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    border-color: var(--color-border);
  }
}

.bubble__edit-icon {
  position: absolute;
  right: 0.45rem;
  bottom: 0.4rem;
  display: flex;
  color: var(--color-text-muted);
  opacity: 1;
  pointer-events: none;
  transition: opacity 0.15s ease;

  @media (hover: hover) and (pointer: fine) {
    opacity: 0;
  }
}

.bubble__user:hover .bubble__edit-icon,
.bubble__user:focus-visible .bubble__edit-icon {
  opacity: 1;
}

.bubble__editor {
  display: flex;
  width: min(100%, 28rem);
  min-width: 12rem;
  flex-direction: column;
  gap: 0.45rem;
  border: 1px solid var(--color-border);
  border-radius: 1.125rem;
  background: var(--color-elevated);
  padding: 0.65rem 0.85rem 0.55rem;
}

.bubble__editor-input {
  width: 100%;
  min-height: 1.25rem;
  max-height: 12rem;
  border: 0;
  background: transparent;
  color: var(--color-text-strong);
  font: inherit;
  font-size: 0.875rem;
  line-height: 1.45;
  outline: none;
  overflow-y: auto;
  resize: none;
}

.bubble__editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.25rem;
}

.bubble__assistant {
  display: flex;
  min-width: 0;
  width: 100%;
  flex-direction: column;
  gap: 0.35rem;
}

.bubble__md {
  min-width: 0;
  max-width: 100%;
  padding: 0.25rem;
}

.bubble__copy {
  display: flex;
  align-items: center;
}

.bubble__stop {
  margin: 0;
  padding-inline: 0.25rem;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  line-height: 1.4;
}
</style>
