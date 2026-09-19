<script setup lang="ts">
definePageMeta({
  layout: 'default'
})

const route = useRoute()
const chat = useChatController()
const pending = usePendingPrompt()

async function flushPending() {
  const next = pending.value
  pending.value = null
  if (!next || chat.busy.value) return
  try {
    await chat.send(next.text, next.images)
  } catch {
    // send() already recorded the error for the chat pane
  }
}

onMounted(async () => {
  const id = String(route.params.id || '')
  if (!id) return
  if (chat.isActiveId(id)) {
    await flushPending()
    return
  }
  pending.value = null
  await chat.loadSession(id)
})

watch(() => route.params.id, async (id) => {
  if (!id) return
  const sid = String(id)
  if (chat.isActiveId(sid)) return
  pending.value = null
  await chat.loadSession(sid)
})
</script>

<template>
  <ChatPane />
</template>
