<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  icon?: string
  loading?: boolean
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

function cancel() {
  open.value = false
  emit('cancel')
}

function confirm() {
  emit('confirm')
}
</script>

<template>
  <UiModal v-model:open="open">
    <template #content>
      <div class="ui-confirm">
        <div
          class="ui-confirm__icon"
          :class="tone === 'danger' ? 'is-danger' : 'is-warn'"
        >
          <UiIcon
            :name="icon || (tone === 'danger' ? 'i-lucide-circle-alert' : 'i-lucide-triangle-alert')"
            :size="22"
          />
        </div>
        <p class="ui-confirm__title">
          {{ title }}
        </p>
        <p
          v-if="description"
          class="ui-confirm__desc"
        >
          {{ description }}
        </p>
        <div class="ui-confirm__actions">
          <UiButton
            color="neutral"
            variant="outline"
            :label="cancelLabel || '取消'"
            @click="cancel"
          />
          <UiButton
            :color="tone === 'danger' ? 'error' : 'primary'"
            :label="confirmLabel || '确定'"
            :loading="loading"
            @click="confirm"
          />
        </div>
      </div>
    </template>
  </UiModal>
</template>
