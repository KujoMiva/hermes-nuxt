<script setup lang="ts">
withDefaults(defineProps<{
  color?: 'neutral' | 'primary' | 'success' | 'error' | 'warning'
  variant?: 'subtle' | 'outline'
}>(), {
  color: 'neutral',
  variant: 'subtle'
})
</script>

<template>
  <span
    class="ui-badge"
    :class="[`ui-badge--${color}`, variant === 'outline' && 'ui-badge--outline']"
  >
    <slot />
  </span>
</template>
