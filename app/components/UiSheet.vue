<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

defineProps<{
  labelledBy?: string
}>()

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

watch(open, (value) => {
  if (!import.meta.client) return
  document.body.style.overflow = value ? 'hidden' : ''
  if (value) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="ui-sheet-backdrop"
      @click.self="open = false"
      @touchmove.self.prevent
    >
      <div
        class="ui-sheet"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="labelledBy"
      >
        <div class="ui-sheet__handle" />
        <div class="ui-sheet__body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
