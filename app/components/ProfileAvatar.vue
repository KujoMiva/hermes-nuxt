<script setup lang="ts">
import { DEFAULT_AVATAR_SRC } from '~/utils/brand'

defineProps<{
  seed?: string
  src?: string
  size?: number
}>()
</script>

<template>
  <span
    class="avatar"
    :style="{ width: `${size || 56}px`, height: `${size || 56}px` }"
  >
    <img
      :src="src || DEFAULT_AVATAR_SRC"
      alt=""
    >
  </span>
</template>

<style lang="scss" scoped>
.avatar {
  display: inline-flex;
  overflow: hidden;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--color-elevated);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}
</style>
