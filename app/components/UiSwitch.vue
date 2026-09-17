<script setup lang="ts">
const props = defineProps<{
  modelValue?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function toggle() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    type="button"
    class="ui-switch"
    :class="{ 'is-on': modelValue, 'is-disabled': disabled }"
    role="switch"
    :aria-checked="modelValue ? 'true' : 'false'"
    :disabled="disabled"
    @click.stop="toggle"
  >
    <span class="ui-switch__thumb" />
  </button>
</template>
