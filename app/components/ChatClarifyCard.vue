<script setup lang="ts">
import type { ChatClarifyQuestion, ChatToolEvent } from '~/types/hermes'
import { parseToolArgs } from '~/utils/format'
import {
  bareChoice,
  choiceLetter,
  clarifyStagedAnswer,
  isRecommendedChoice,
  parseClarifyRequest,
  readClarifyBatchResult,
  readClarifyResult,
  replayLockedStage,
  type ClarifyStage
} from '~/utils/serverPrompt'

const emptyStage: ClarifyStage = { choices: [], draft: '' }

const props = defineProps<{
  tool?: ChatToolEvent
}>()

const chat = useChatController()

const page = ref(0)
const activeIndex = ref(0)
const otherFocused = ref('')
const staged = ref<Record<string, ClarifyStage>>({})
const formRef = ref<HTMLElement | null>(null)

const fromArgs = computed(() => parseClarifyRequest('args', parseToolArgs(props.tool?.args)))
const request = computed(() => chat.clarify.value)
const pending = computed(() => Boolean(request.value) && (!props.tool || props.tool.status === 'running'))
const settled = computed(() => Boolean(props.tool && props.tool.status !== 'running'))
const settledResult = computed(() => readClarifyResult(props.tool?.result ?? props.tool?.resultText))
const batchSettled = computed(() => readClarifyBatchResult(props.tool?.result ?? props.tool?.resultText))
const liveQuestions = computed(() => request.value?.questions ?? [])
const previewQuestions = computed(() => fromArgs.value?.questions ?? [])
const isBatch = computed(() => liveQuestions.value.length > 0 || previewQuestions.value.length > 0)
const questions = computed<ChatClarifyQuestion[]>(() => {
  if (isBatch.value) return liveQuestions.value.length ? liveQuestions.value : previewQuestions.value
  const text = request.value?.question || fromArgs.value?.question || settledResult.value.question || ''
  const options = request.value?.choices ?? fromArgs.value?.choices ?? []
  if (!text && !options.length) return []
  return [{
    qid: 'single',
    question: text,
    choices: options.length ? options : null,
    multiSelect: Boolean(request.value?.multiSelect ?? fromArgs.value?.multiSelect) && options.length > 0
  }]
})
const question = computed(() => questions.value[0]?.question || '')
const currentQuestion = computed(() => questions.value[page.value] || questions.value[0] || null)
const isLastPage = computed(() => !isBatch.value || page.value >= questions.value.length - 1)
const batchReady = computed(() => Boolean(request.value?.requestId) && (!isBatch.value || liveQuestions.value.length > 0))
const busy = computed(() => Boolean(chat.pendingClarify.value) || (pending.value && !batchReady.value))
const skipped = computed(() => !settledResult.value.error && !settledResult.value.answer)

function stageFor(qid: string) {
  return staged.value[qid] ?? emptyStage
}

function setStage(qid: string, next: ClarifyStage) {
  staged.value = { ...staged.value, [qid]: next }
}

function stagedAnswer(row: ChatClarifyQuestion) {
  return clarifyStagedAnswer(row, stageFor(row.qid))
}

const answeredCount = computed(() => questions.value.filter(row => stagedAnswer(row) !== null).length)
const allStaged = computed(() => questions.value.length > 0 && answeredCount.value === questions.value.length)
const canContinue = computed(() => Boolean(currentQuestion.value && stagedAnswer(currentQuestion.value)))
const canPrimary = computed(() => {
  if (!canContinue.value) return false
  if (isBatch.value && isLastPage.value) return allStaged.value
  return true
})

function firstUnansweredIndex() {
  const index = questions.value.findIndex(row => stagedAnswer(row) === null)
  return index < 0 ? Math.max(0, questions.value.length - 1) : index
}

function replayLocked() {
  const locked = request.value?.lockedAnswers
  if (!locked) {
    staged.value = {}
    return
  }
  const next: Record<string, ClarifyStage> = {}
  for (const row of questions.value) {
    const answer = locked[row.qid]
    if (answer === undefined) continue
    next[row.qid] = replayLockedStage(row, answer)
  }
  staged.value = next
}

watch(() => request.value?.requestId, () => {
  activeIndex.value = 0
  otherFocused.value = ''
  replayLocked()
  page.value = isBatch.value ? firstUnansweredIndex() : 0
}, { immediate: true })

watch(() => questions.value.length, (count) => {
  if (page.value >= count) page.value = Math.max(0, count - 1)
})

watch(() => currentQuestion.value?.qid, () => {
  activeIndex.value = 0
  otherFocused.value = ''
})

function selectChoice(row: ChatClarifyQuestion, choice: string, index: number) {
  const current = stageFor(row.qid)
  const choices = row.multiSelect
    ? current.choices.includes(choice)
      ? current.choices.filter(item => item !== choice)
      : [...current.choices, choice]
    : [choice]
  setStage(row.qid, { choices, draft: '' })
  activeIndex.value = index
}

function onDraft(row: ChatClarifyQuestion, value: string) {
  setStage(row.qid, { choices: [], draft: value })
}

async function submit() {
  if (isBatch.value) {
    if (!allStaged.value) return
    const answers: Record<string, string> = {}
    for (const row of questions.value) answers[row.qid] = stagedAnswer(row) || ''
    await chat.lockClarify(answers)
    return
  }
  const row = currentQuestion.value
  if (!row) return
  await chat.resolveClarify({ answer: stagedAnswer(row) || '' })
}

function goPrev() {
  if (page.value <= 0) return
  page.value -= 1
}

function goNext() {
  if (!canPrimary.value) return
  if (isBatch.value && !isLastPage.value) {
    page.value += 1
    return
  }
  void submit()
}

async function skip() {
  await chat.resolveClarify(isBatch.value ? {} : { answer: '' })
}

function onFormKey(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  if ((event.target as HTMLElement | null)?.closest('textarea')) return
  event.preventDefault()
  goNext()
}

function onWindowKey(event: KeyboardEvent) {
  if (!pending.value || busy.value) return
  const row = currentQuestion.value
  const options = row?.choices ?? []
  if (!row || !options.length) return
  if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
  const active = document.activeElement as HTMLElement | null
  if (active && active.matches('a[href], button, input, select, textarea, [role="button"]')) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const count = options.length + 1
    activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count
    if (!row.multiSelect) setStage(row.qid, { choices: [], draft: '' })
    return
  }
  if (/^[1-9]$/.test(event.key) || (event.key.length === 1 && event.key.toLowerCase() >= 'a' && event.key.toLowerCase() <= 'z')) {
    const index = /^[1-9]$/.test(event.key)
      ? Number(event.key) - 1
      : event.key.toLowerCase().charCodeAt(0) - 97
    if (index < options.length) {
      event.preventDefault()
      selectChoice(row, options[index]!, index)
    } else if (index === options.length) {
      event.preventDefault()
      activeIndex.value = index
    }
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const choice = options[activeIndex.value]
    if (choice && !stagedAnswer(row)) selectChoice(row, choice, activeIndex.value)
    else goNext()
  }
}

onMounted(() => window.addEventListener('keydown', onWindowKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKey))
</script>

<template>
  <form
    v-if="pending || (settled && (question || batchSettled.responses.length))"
    ref="formRef"
    class="clarify"
    :data-clarify-choices="currentQuestion?.choices?.length || undefined"
    :data-clarify-batch="isBatch ? questions.length : undefined"
    :data-clarify-page="isBatch ? page + 1 : undefined"
    @submit.prevent="goNext"
    @keydown="onFormKey"
  >
    <div
      class="clarify__shell"
      :data-clarify-settled="settled ? '' : undefined"
    >
      <template v-if="pending && currentQuestion">
        <div class="clarify__question">
          <div class="clarify__heading">
            <p
              v-if="isBatch"
              class="is-meta"
            >
              {{ page + 1 }} / {{ questions.length }}
            </p>
            <p>{{ currentQuestion.question }}</p>
          </div>
          <UiIcon
            name="i-lucide-circle-help"
            :size="16"
          />
        </div>

        <div class="clarify__block">
          <div
            v-if="currentQuestion.choices?.length"
            class="clarify__list"
            role="group"
          >
            <button
              v-for="(choice, index) in currentQuestion.choices"
              :key="`${currentQuestion.qid}-${index}-${choice}`"
              type="button"
              class="clarify__row"
              :class="{
                'is-active': activeIndex === index,
                'is-selected': stageFor(currentQuestion.qid).choices.includes(choice)
              }"
              :disabled="busy"
              :aria-pressed="stageFor(currentQuestion.qid).choices.includes(choice)"
              @click="selectChoice(currentQuestion, choice, index)"
            >
              <span
                class="clarify__key"
                :class="{
                  'is-on': stageFor(currentQuestion.qid).choices.includes(choice),
                  'is-preview': activeIndex === index && !stageFor(currentQuestion.qid).choices.includes(choice)
                }"
              >{{ choiceLetter(index) }}</span>
              <span class="clarify__label">
                {{ bareChoice(choice) }}
                <span
                  v-if="isRecommendedChoice(choice)"
                  class="clarify__rec"
                >(Recommended)</span>
              </span>
            </button>
            <label
              class="clarify__row is-other"
              :class="{ 'is-active': activeIndex === currentQuestion.choices.length }"
            >
              <span
                class="clarify__key"
                :class="{
                  'is-on': Boolean(stageFor(currentQuestion.qid).draft.trim()),
                  'is-preview': otherFocused === currentQuestion.qid || activeIndex === currentQuestion.choices.length
                }"
              >{{ choiceLetter(currentQuestion.choices.length) }}</span>
              <textarea
                rows="1"
                class="clarify__other"
                :value="stageFor(currentQuestion.qid).draft"
                :disabled="busy"
                placeholder="其他 (输入你的答案)"
                @focus="setStage(currentQuestion.qid, { choices: [], draft: stageFor(currentQuestion.qid).draft }); otherFocused = currentQuestion.qid; activeIndex = currentQuestion.choices!.length"
                @blur="otherFocused = ''"
                @input="onDraft(currentQuestion, ($event.target as HTMLTextAreaElement).value)"
              />
            </label>
          </div>
          <textarea
            v-else
            rows="1"
            class="clarify__other is-solo"
            :value="stageFor(currentQuestion.qid).draft"
            :disabled="busy"
            placeholder="输入你的答案…"
            @input="onDraft(currentQuestion, ($event.target as HTMLTextAreaElement).value)"
          />
        </div>
      </template>

      <template v-else-if="batchSettled.responses.length">
        <div
          v-for="(row, index) in batchSettled.responses"
          :key="`${index}-${row.question}`"
          class="clarify__block"
        >
          <div
            v-if="row.question"
            class="clarify__question"
          >
            <p>{{ row.question }}</p>
            <UiIcon
              name="i-lucide-circle-help"
              :size="16"
            />
          </div>
          <p
            class="clarify__answer"
            :class="{ 'is-skip': !row.answer.trim() }"
          >
            {{ row.answer.trim() || '已跳过' }}
          </p>
        </div>
      </template>

      <template v-else-if="settled">
        <div
          v-if="question"
          class="clarify__question"
        >
          <p>{{ question }}</p>
          <UiIcon
            name="i-lucide-circle-help"
            :size="16"
          />
        </div>
        <p
          class="clarify__answer"
          :class="{ 'is-error': Boolean(settledResult.error), 'is-skip': skipped }"
        >
          {{ settledResult.error || settledResult.answer || '已跳过' }}
        </p>
      </template>
    </div>

    <div
      v-if="pending"
      class="clarify__actions"
    >
      <UiButton
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="busy"
        label="跳过"
        @click="skip"
      />
      <UiButton
        v-if="isBatch && page > 0"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="busy"
        label="上一题"
        @click="goPrev"
      />
      <UiButton
        size="xs"
        color="primary"
        type="submit"
        :disabled="busy || !canPrimary"
        :loading="Boolean(chat.pendingClarify.value)"
      >
        {{ isBatch && isLastPage ? '确认并继续' : '继续' }}
        <span class="clarify__enter">⏎</span>
      </UiButton>
    </div>
  </form>
</template>

<style lang="scss" scoped>
.clarify {
  display: grid;
  gap: 1rem;
  width: 100%;
  min-width: 0;
  margin: 0.35rem 0;
}

.clarify__shell {
  display: grid;
  gap: 0.75rem;
  border-radius: 1.5rem;
  background: var(--color-elevated);
  padding: 0.85rem 0.9rem;
}

.clarify__block {
  display: grid;
  gap: 0.4rem;
}

.clarify__heading {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 0.2rem;
}

.clarify__question {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;

  p {
    margin: 0;
    min-width: 0;
    flex: 1;
    color: var(--color-text-strong);
    font-size: 0.9375rem;
    font-weight: 500;
    line-height: 1.45;
    white-space: pre-wrap;
  }

  :deep(.ui-icon) {
    flex-shrink: 0;
    margin-top: 0.15rem;
    color: var(--color-text-dimmed);
  }

  p.is-meta {
    color: var(--color-text-dimmed);
    font-size: 0.6875rem;
    font-weight: 400;
    line-height: 1rem;
  }
}

.clarify__list {
  display: grid;
  gap: 1px;
}

.clarify__row {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: flex-start;
  gap: 0.5rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  padding: 0.25rem 0.4rem;
  color: var(--color-text-muted);
  font: inherit;
  text-align: start;

  &:hover,
  &.is-active,
  &.is-selected {
    background: color-mix(in srgb, var(--color-text) 6%, transparent);
    color: var(--color-text-strong);
  }

  &.is-other {
    align-items: center;
  }
}

.clarify__key {
  display: inline-flex;
  width: 1.15rem;
  height: 1.15rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  margin-top: 0.12rem;
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1;

  &.is-preview {
    border-color: var(--color-text-strong);
    color: var(--color-text-strong);
  }

  &.is-on {
    border-color: var(--color-inverted);
    background: var(--color-inverted);
    color: var(--color-text-invert);
  }
}

.clarify__label {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
  line-height: 1.45;
}

.clarify__rec {
  color: var(--color-text-dimmed);
}

.clarify__other {
  width: 100%;
  min-width: 0;
  flex: 1;
  resize: none;
  border: 0;
  background: transparent;
  padding: 0.15rem 0;
  color: var(--color-text);
  font: inherit;
  line-height: 1.45;
  outline: none;

  &.is-solo {
    margin-top: 0.15rem;
  }

  &::placeholder {
    color: var(--color-text-dimmed);
  }
}

.clarify__answer {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.45;
  white-space: pre-wrap;

  &.is-error {
    color: var(--color-error);
  }

  &.is-skip {
    color: var(--color-text-dimmed);
    font-style: italic;
  }
}

.clarify__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.25rem;
}

.clarify__enter {
  margin-left: 0.15rem;
  opacity: 0.7;
  font-size: 0.625rem;
}
</style>
