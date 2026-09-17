<script setup lang="ts">
const props = withDefaults(defineProps<{
  name: string
  size?: number | string
  spin?: boolean
}>(), {
  size: 16
})

const resolved = computed(() => iconName(props.name))
const sizePx = computed(() => typeof props.size === 'number' ? `${props.size}px` : props.size)
</script>

<template>
  <Icon
    :name="resolved"
    class="ui-icon"
    :class="{ 'is-spin': spin }"
    :style="{ width: sizePx, height: sizePx }"
  />
</template>
