<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const route = useRoute()
const chat = useChatController()
const pending = usePendingPrompt()

onMounted(async () => {
  const id = String(route.params.id || '')
  if (!id) return
  if (chat.isActiveId(id) && chat.busy.value) {
    if (pending.value) pending.value = null
    return
  }
  if (!chat.isActiveId(id)) await chat.loadSession(id)
  else await chat.resumeIfActive(id)
  if (pending.value) {
    const next = pending.value
    pending.value = null
    await chat.send(next.text, next.images)
  }
})

watch(() => route.params.id, async (id) => {
  if (!id) return
  const sid = String(id)
  if (chat.isActiveId(sid) && chat.busy.value) return
  if (!chat.isActiveId(sid)) await chat.loadSession(sid)
  else await chat.resumeIfActive(sid)
})
</script>

<template>
  <ChatPane />
</template>
