<script setup lang="ts">
import type { Component } from 'vue'
import SettingsProfiles from '~/components/SettingsProfiles.vue'
import SettingsSkills from '~/components/SettingsSkills.vue'
import SettingsTools from '~/components/SettingsTools.vue'
import SettingsModels from '~/components/SettingsModels.vue'
import SettingsStatus from '~/components/SettingsStatus.vue'

definePageMeta({ layout: 'default' })

const TAB_IDS = ['profiles', 'skills', 'tools', 'models', 'status'] as const
type SettingsTab = typeof TAB_IDS[number]

const panels: Record<SettingsTab, Component> = {
  profiles: SettingsProfiles,
  skills: SettingsSkills,
  tools: SettingsTools,
  models: SettingsModels,
  status: SettingsStatus
}

const route = useRoute()

function isSettingsTab(value: unknown): value is SettingsTab {
  return typeof value === 'string' && (TAB_IDS as readonly string[]).includes(value)
}

const tab = computed(() => {
  if (route.query.tab === 'connection') return 'profiles'
  return isSettingsTab(route.query.tab) ? route.query.tab : null
})

watch(
  () => route.query.tab,
  (value) => {
    if (value === 'connection') {
      void navigateTo({ path: '/settings', query: { tab: 'profiles' } }, { replace: true })
    }
  },
  { immediate: true }
)

const panel = computed(() => (tab.value ? panels[tab.value] : null))
</script>

<template>
  <div class="settings">
    <SettingsHub v-if="!tab" />
    <div
      v-else
      class="settings__panel"
    >
      <KeepAlive>
        <component :is="panel" />
      </KeepAlive>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.settings {
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.settings__panel {
  min-width: 0;
  padding: 0.85rem 1rem calc(1.25rem + env(safe-area-inset-bottom, 0px));

  @include sm {
    padding: 1rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
  }
}
</style>
