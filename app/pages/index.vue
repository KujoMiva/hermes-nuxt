<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const chat = useChatController()

onMounted(() => {
  if (!chat.sessionId.value) chat.resetLocal()
})
</script>

<template>
  <ChatPane />
</template>
