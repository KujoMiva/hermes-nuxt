<script setup lang="ts">
defineProps<{
  label?: string
  hint?: string
}>()
</script>

<template>
  <label class="ui-field">
    <span
      v-if="label"
      class="ui-field__label"
    >
      {{ label }}
    </span>
    <slot />
    <p
      v-if="hint"
      class="ui-field__hint"
    >
      {{ hint }}
    </p>
  </label>
</template>
