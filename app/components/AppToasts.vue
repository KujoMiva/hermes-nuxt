<script setup lang="ts">
const { toasts, remove } = useToast()
</script>

<template>
  <TransitionGroup
    class="ui-toasts"
    name="toast"
    tag="div"
    aria-live="polite"
  >
    <button
      v-for="item in toasts"
      :key="item.id"
      type="button"
      class="ui-toast"
      :class="`ui-toast--${item.color || 'neutral'}`"
      @click="remove(item.id)"
    >
      <UiIcon
        v-if="item.icon"
        :name="item.icon"
        :size="14"
      />
      <span class="ui-toast__text">
        <span class="ui-toast__title">{{ item.title }}</span>
        <span
          v-if="item.description"
          class="ui-toast__desc"
        >{{ item.description }}</span>
      </span>
    </button>
  </TransitionGroup>
</template>
