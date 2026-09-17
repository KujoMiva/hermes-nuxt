<script setup lang="ts">
import { DEFAULT_AVATAR_SRC } from '~/utils/brand'
</script>

<template>
  <img
    class="logo"
    :src="DEFAULT_AVATAR_SRC"
    alt=""
  >
</template>

<style lang="scss" scoped>
.logo {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}
</style>
