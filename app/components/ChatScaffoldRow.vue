<script setup lang="ts">
defineProps<{
  open?: boolean
  toggleable?: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <div class="scaffold-row">
    <button
      v-if="toggleable"
      type="button"
      class="scaffold-row__hit"
      :aria-expanded="open"
      @click="emit('toggle')"
    >
      <span class="scaffold-row__label">
        <slot />
      </span>
      <UiIcon
        name="i-lucide-chevron-down"
        :size="12"
        class="scaffold-row__caret"
        :class="{ 'is-open': open }"
      />
    </button>
    <div
      v-else
      class="scaffold-row__hit is-static"
    >
      <span class="scaffold-row__label">
        <slot />
      </span>
    </div>
    <span
      v-if="$slots.trailing"
      class="scaffold-row__trailing"
    >
      <slot name="trailing" />
    </span>
  </div>
</template>

<style lang="scss" scoped>
.scaffold-row {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
}

.scaffold-row__hit {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 0.3rem;
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  font: inherit;
  line-height: 1.35rem;
  text-align: start;
  cursor: pointer;

  &.is-static {
    cursor: default;
  }
}

.scaffold-row__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scaffold-row__caret {
  flex-shrink: 0;
  color: var(--color-text-dimmed);
  opacity: 0;
  transition: transform 0.15s ease, opacity 0.15s ease;

  &.is-open {
    transform: rotate(180deg);
    opacity: 0.8;
  }
}

.scaffold-row:hover .scaffold-row__caret,
.scaffold-row:focus-within .scaffold-row__caret {
  opacity: 0.8;
}

.scaffold-row__trailing {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--color-text-dimmed);
  font-size: 0.625rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.35rem;
  white-space: nowrap;
}
</style>
