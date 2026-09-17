<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'zh-Hans' }
})
</script>

<template>
  <div class="app-root">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <AppToasts />
  </div>
</template>
