<script setup lang="ts">
defineOptions({ inheritAttrs: false })

defineProps<{
  icon?: string
  modelValue?: string
  type?: string
  placeholder?: string
  spin?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div
    class="ui-input-wrap"
    :class="{ 'ui-input-wrap--plain': !icon && !$slots.trailing }"
  >
    <UiIcon
      v-if="icon"
      :name="icon"
      :size="16"
      :spin="spin"
    />
    <input
      class="ui-input"
      :type="type || 'text'"
      :value="modelValue"
      :placeholder="placeholder"
      v-bind="$attrs"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
    <slot name="trailing" />
  </div>
</template>
