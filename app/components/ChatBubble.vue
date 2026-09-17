<script setup lang="ts">
import type { ChatThreadMessage } from '~/types/hermes'
import { chatMediaSrc } from '~/utils/imageRefs'
import { stopKindLabel } from '~/utils/chatRun'

const props = defineProps<{
  message: ChatThreadMessage
}>()

const copied = ref(false)
const failed = ref<Record<string, boolean>>({})
const stopLabel = computed(() => stopKindLabel(props.message.stopKind))

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
        v-if="message.role === 'user' && message.content"
        class="bubble__user"
      >
        {{ message.content }}
      </div>

      <div
        v-else-if="message.role !== 'user'"
        class="bubble__assistant"
      >
        <ToolRunSummary
          v-if="message.tools?.length"
          :tools="message.tools"
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
        <div
          v-else-if="message.streaming && !stopLabel"
          class="bubble__dots"
        >
          <span /><span /><span />
        </div>
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
  max-width: 100%;
  min-width: 0;
  border-radius: 1.125rem;
  background: var(--color-elevated);
  padding: 0.65rem 1rem;
  color: var(--color-text-strong);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.bubble__assistant {
  display: flex;
  min-width: 0;
  width: 100%;
  flex-direction: column;
  gap: 0.5rem;
}

.bubble__md {
  min-width: 0;
  max-width: 100%;
  padding: 0.25rem;
}

.bubble__dots {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  height: 1.5rem;
  padding-inline: 0.25rem;
  color: var(--color-text-muted);

  span {
    width: 0.35rem;
    height: 0.35rem;
    border-radius: var(--radius-pill);
    background: currentColor;
    animation: bounce 0.9s infinite;

    &:nth-child(2) {
      animation-delay: 150ms;
    }

    &:nth-child(3) {
      animation-delay: 300ms;
    }
  }
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

@keyframes bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
  }

  40% {
    transform: translateY(-3px);
  }
}
</style>
