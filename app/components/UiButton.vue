<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  color?: 'neutral' | 'primary' | 'error' | 'success'
  variant?: 'solid' | 'outline' | 'ghost' | 'soft'
  size?: 'xs' | 'sm' | 'md'
  icon?: string
  trailingIcon?: string
  square?: boolean
  pill?: boolean
  loading?: boolean
  disabled?: boolean
  to?: string
  label?: string
  type?: 'button' | 'submit'
}>(), {
  color: 'primary',
  variant: 'solid',
  size: 'md',
  type: 'button'
})

const classes = computed(() => [
  'ui-btn',
  `ui-btn--${props.color}`,
  `ui-btn--${props.variant}`,
  `ui-btn--${props.size}`,
  props.square && 'ui-btn--square',
  props.pill && 'ui-btn--pill',
  props.loading && 'is-loading',
  props.disabled && 'is-disabled'
])

const iconSize = computed(() => {
  if (props.size === 'xs') return 14
  if (props.size === 'sm') return 15
  return 16
})
</script>

<template>
  <NuxtLink
    v-if="to"
    :to="to"
    :class="classes"
    :aria-disabled="disabled || loading ? 'true' : undefined"
    v-bind="$attrs"
  >
    <UiIcon
      v-if="loading"
      name="i-lucide-loader-circle"
      :size="iconSize"
      spin
    />
    <UiIcon
      v-else-if="icon"
      :name="icon"
      :size="iconSize"
    />
    <span
      v-if="label"
      class="ui-btn__label"
    >{{ label }}</span>
    <slot />
    <UiIcon
      v-if="trailingIcon && !loading"
      :name="trailingIcon"
      :size="iconSize"
    />
  </NuxtLink>
  <button
    v-else
    :type="type"
    :class="classes"
    :disabled="disabled || loading"
    v-bind="$attrs"
  >
    <UiIcon
      v-if="loading"
      name="i-lucide-loader-circle"
      :size="iconSize"
      spin
    />
    <UiIcon
      v-else-if="icon"
      :name="icon"
      :size="iconSize"
    />
    <span
      v-if="label"
      class="ui-btn__label"
    >{{ label }}</span>
    <slot />
    <UiIcon
      v-if="trailingIcon && !loading"
      :name="trailingIcon"
      :size="iconSize"
    />
  </button>
</template>
