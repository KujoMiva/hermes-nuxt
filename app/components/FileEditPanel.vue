<script setup lang="ts">
import type { FileEditPreview } from '~/utils/fileEditPreview'
import { highlightTokens } from '~/utils/mdSyntax'

const props = defineProps<{
  preview: FileEditPreview
}>()

const root = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
const full = ref(false)
const clipped = ref(false)

const rows = computed(() => props.preview.lines.map(line => ({
  kind: line.kind,
  no: line.no,
  text: line.text,
  tokens: highlightTokens(line.text, props.preview.lang)
})))

function measure() {
  const el = root.value
  const content = inner.value
  if (!el || !content) {
    clipped.value = false
    return
  }
  clipped.value = content.offsetHeight > el.clientHeight + 1 || content.offsetWidth > el.clientWidth + 1
}

function onPeekWheel() {
  if (full.value) return
  const el = root.value
  if (!el) return
  el.scrollTop = 0
  el.scrollLeft = 0
}

let observer: ResizeObserver | null = null

onMounted(() => {
  observer = new ResizeObserver(() => measure())
  if (root.value) observer.observe(root.value)
  if (inner.value) observer.observe(inner.value)
  void nextTick(measure)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

watch([rows, full], async () => {
  await nextTick()
  measure()
})

function expand() {
  full.value = true
}

function collapse() {
  full.value = false
  void nextTick(() => {
    root.value?.scrollTo({ top: 0, left: 0 })
    measure()
  })
}
</script>

<template>
  <div
    class="file-edit"
    :class="{ 'is-full': full }"
    role="region"
    :aria-label="preview.basename"
  >
    <div
      ref="root"
      class="file-edit__scroll"
      @wheel="onPeekWheel"
    >
      <div
        ref="inner"
        class="file-edit__inner"
      >
        <div
          v-for="(line, index) in rows"
          :key="index"
          class="file-edit__row"
          :class="`is-${line.kind}`"
        >
          <span
            class="file-edit__no"
            aria-hidden="true"
          >{{ line.no ?? '' }}</span>
          <code class="file-edit__code"><template
            v-for="(token, tokenIndex) in line.tokens"
            :key="tokenIndex"
          ><span
            v-if="token[0]"
            :class="`md-syn md-syn--${token[0]}`"
          >{{ token[1] }}</span><template v-else>{{ token[1] }}</template></template></code>
        </div>
        <p
          v-if="preview.truncated"
          class="file-edit__more"
        >
          … 还有 {{ preview.truncated }} 行
        </p>
      </div>
    </div>
    <button
      v-if="!full && clipped"
      type="button"
      class="file-edit__reveal"
      aria-label="展开全部"
      @click="expand"
    >
      <span class="file-edit__reveal-icon">
        <UiIcon
          name="i-lucide-chevron-down"
          :size="14"
        />
      </span>
    </button>
    <button
      v-else-if="full"
      type="button"
      class="file-edit__reveal"
      aria-label="收起"
      @click="collapse"
    >
      <span class="file-edit__reveal-icon is-up">
        <UiIcon
          name="i-lucide-chevron-down"
          :size="14"
        />
      </span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.file-edit {
  position: relative;
  overflow: clip;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  line-height: 1.375rem;
  tab-size: 4;
}

.file-edit__scroll {
  overflow: clip;
  max-height: 5.5rem;
}

.file-edit.is-full {
  display: flex;
  flex-direction: column;
}

.file-edit.is-full .file-edit__scroll {
  overflow: auto;
  max-height: 70vh;
  overscroll-behavior: contain;
  overscroll-behavior-x: contain;
}

.file-edit__inner {
  display: table;
  width: 100%;
  border-collapse: collapse;
}

.file-edit__row {
  display: table-row;
}

.file-edit__no,
.file-edit__code {
  display: table-cell;
  vertical-align: top;
  background: var(--color-bg);
}

.file-edit__row.is-add .file-edit__no,
.file-edit__row.is-add .file-edit__code {
  background: color-mix(in srgb, var(--color-success) 12%, var(--color-bg));
}

.file-edit__row.is-del .file-edit__no,
.file-edit__row.is-del .file-edit__code {
  background: color-mix(in srgb, var(--color-error) 10%, var(--color-bg));
}

.file-edit__no {
  position: sticky;
  left: 0;
  z-index: 1;
  width: 1%;
  min-width: 2.5rem;
  padding: 0 0.55rem 0 0.4rem;
  color: var(--color-text-dimmed);
  font-variant-numeric: tabular-nums;
  text-align: right;
  user-select: none;
  white-space: nowrap;
  box-shadow: 1px 0 0 color-mix(in srgb, var(--color-border) 85%, transparent);
}

.file-edit__code {
  width: 100%;
  padding: 0 0.75rem 0 0.35rem;
  color: var(--color-text-toned);
  font: inherit;
  white-space: pre;

  &:empty::after {
    content: ' ';
  }
}

.file-edit__more {
  display: table-caption;
  caption-side: bottom;
  margin: 0;
  padding: 0.2rem 0.75rem 0.2rem 2.85rem;
  color: var(--color-text-muted);
  font-size: 0.6875rem;
}

.file-edit__reveal {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  display: flex;
  height: 1.375rem;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 0.05rem;
  border: 0;
  border-radius: 0 0 calc(var(--radius-sm) - 1px) calc(var(--radius-sm) - 1px);
  background: linear-gradient(to bottom, transparent, var(--color-bg) 72%);
  color: var(--color-text-muted);
  cursor: pointer;

  &:hover {
    color: var(--color-text-toned);
  }
}

.file-edit.is-full .file-edit__reveal {
  position: static;
  z-index: auto;
  height: 1.5rem;
  align-items: center;
  padding: 0;
  border-radius: 0;
  background: var(--color-bg);
}

.file-edit__reveal-icon {
  display: flex;

  &.is-up {
    transform: rotate(180deg);
  }
}

.md-syn--cm {
  color: var(--color-text-muted);
}

.md-syn--kw {
  color: var(--color-text-strong);
  font-weight: 650;
}

.md-syn--str {
  color: var(--color-success);
}

.md-syn--num {
  color: var(--color-warning);
}
</style>
