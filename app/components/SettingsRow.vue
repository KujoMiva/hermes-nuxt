<script setup lang="ts">
defineProps<{
  icon: string
  title: string
  description?: string
  to?: string
}>()
</script>

<template>
  <NuxtLink
    v-if="to"
    :to="to"
    class="settings-row"
    active-class=""
    exact-active-class=""
  >
    <div class="icon-well">
      <UiIcon
        :name="icon"
        :size="20"
      />
    </div>
    <div class="settings-row__text">
      <p class="settings-row__title">
        {{ title }}
      </p>
      <p
        v-if="description"
        class="settings-row__desc"
      >
        {{ description }}
      </p>
    </div>
    <slot name="trailing">
      <UiIcon
        name="i-lucide-chevron-right"
        :size="16"
      />
    </slot>
  </NuxtLink>
  <div
    v-else
    class="settings-row"
  >
    <div class="icon-well">
      <UiIcon
        :name="icon"
        :size="20"
      />
    </div>
    <div class="settings-row__text">
      <p class="settings-row__title">
        {{ title }}
      </p>
      <p
        v-if="description"
        class="settings-row__desc"
      >
        {{ description }}
      </p>
    </div>
    <slot name="trailing" />
  </div>
</template>

<style lang="scss" scoped>
.settings-row {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 0.8rem;
  border-radius: 1.5rem;
  background: var(--color-surface);
  box-shadow: var(--shadow);
  padding: 0.95rem 1rem;
  text-align: start;
  color: var(--color-text-muted);

  > :last-child {
    flex-shrink: 0;
  }
}

.settings-row__text {
  min-width: 0;
  flex: 1;
}

.settings-row__title {
  margin: 0;
  color: var(--color-text-strong);
  font-weight: 600;
  line-height: 1.25rem;
}

.settings-row__desc {
  margin: 0.15rem 0 0;
  overflow: hidden;
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
