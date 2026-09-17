<script setup lang="ts">
import { chatBubbleMemo } from '~/utils/sessionMessages'

const chat = useChatController()
const { inset: keyboardInset, sync: syncVisualViewport } = useVisualViewport()
const viewport = ref<HTMLElement | null>(null)
const threadEl = ref<HTMLElement | null>(null)
const stickToBottom = ref(true)

let ignoreScroll = false
let resizeObserver: ResizeObserver | null = null

function scrollToBottom() {
  const el = viewport.value
  if (!el) return
  ignoreScroll = true
  el.scrollTop = el.scrollHeight
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight
    ignoreScroll = false
  })
}

function onViewportScroll() {
  if (ignoreScroll) return
  const el = viewport.value
  if (!el) return
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 96
}

async function followBottom(force = false) {
  if (force) stickToBottom.value = true
  if (!stickToBottom.value) return
  await nextTick()
  scrollToBottom()
}

function bindThreadObserver(el: HTMLElement | null) {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (!el || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => {
    if (stickToBottom.value) scrollToBottom()
  })
  resizeObserver.observe(el)
}

watch(threadEl, (el) => {
  bindThreadObserver(el)
})

watch(() => chat.loadingHistory.value, (loading) => {
  if (!loading) followBottom(true)
})

watch(() => chat.messages.value.length, () => {
  followBottom(true)
})

watch(() => chat.messages.value.at(-1)?.content, () => {
  followBottom()
})

watch(() => chat.messages.value.at(-1)?.tools?.length, () => {
  followBottom()
})

watch(() => {
  const last = chat.messages.value.at(-1)
  const tool = last?.tools?.at(-1)
  return `${last?.reasoning || ''}\0${tool?.preview || ''}\0${tool?.status || ''}\0${last?.stopKind || ''}`
}, () => {
  followBottom()
})

watch(keyboardInset, () => {
  if (stickToBottom.value) scrollToBottom()
})

function onComposerFocusIn() {
  syncVisualViewport()
  void followBottom(true)
}

onMounted(() => {
  followBottom(true)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div
    class="chat-pane"
    :style="{ '--keyboard-inset': `${keyboardInset}px` }"
  >
    <div
      ref="viewport"
      class="chat-pane__viewport"
      @scroll.passive="onViewportScroll"
    >
      <div
        v-if="chat.loadingHistory.value"
        class="chat-pane__status"
      >
        <UiIcon
          name="i-lucide-loader-circle"
          :size="24"
          spin
        />
      </div>

      <div
        v-else-if="!chat.messages.value.length && !chat.liveHint.value"
        class="chat-empty"
      >
        <div class="chat-empty__logo">
          <AppLogo />
        </div>
        <h1>有什么可以帮你？</h1>
      </div>

      <div
        v-else
        ref="threadEl"
        class="chat-pane__thread"
      >
        <p
          v-if="chat.liveHint.value"
          class="chat-pane__hint"
        >
          {{ chat.liveHint.value }}
        </p>
        <ChatBubble
          v-for="message in chat.messages.value"
          :key="message.id"
          v-memo="chatBubbleMemo(message)"
          :message="message"
        />
        <p
          v-if="chat.errorText.value && !chat.liveHint.value && !chat.busy.value"
          class="chat-pane__error"
        >
          {{ chat.errorText.value }}
        </p>
      </div>
    </div>

    <div
      class="chat-pane__composer"
      @focusin="onComposerFocusIn"
    >
      <ChatComposer />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.chat-pane {
  position: relative;
  display: flex;
  height: calc(100% - var(--keyboard-inset, 0px));
  min-height: 0;
  flex-direction: column;
}

.chat-pane__viewport {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  padding: 0 0.75rem;

  @include sm {
    padding: 0 1.5rem;
  }
}

.chat-pane__status {
  display: flex;
  justify-content: center;
  padding: 3rem 0;
  color: var(--color-text-muted);
}

.chat-empty {
  display: flex;
  min-height: 60vh;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1rem 1rem 8rem;
  text-align: center;
}

.chat-empty__logo {
  display: flex;
  width: 4.5rem;
  height: 4.5rem;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  box-shadow: var(--shadow);
}

.chat-empty h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.02em;

  @include sm {
    font-size: 1.875rem;
  }
}

.chat-pane__thread {
  width: 100%;
  max-width: 48rem;
  margin: 0 auto;
  padding: 1.5rem 0 9.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.chat-pane__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.8125rem;
}

.chat-pane__error {
  margin: 0;
  color: var(--color-error);
  font-size: 0.875rem;
  text-align: center;
}

.chat-pane__composer {
  position: absolute;
  inset: auto 0 0;
  z-index: 10;
  padding: 0.55rem 0.85rem max(1.15rem, calc(0.7rem + env(safe-area-inset-bottom)));
  background: linear-gradient(
    to top,
    var(--color-surface) 0%,
    var(--color-surface) 46%,
    color-mix(in srgb, var(--color-surface) 70%, transparent) 72%,
    transparent 100%
  );
  pointer-events: none;

  @include sm {
    padding: 0.65rem 1.5rem max(1.35rem, calc(0.85rem + env(safe-area-inset-bottom)));
  }
}
</style>
