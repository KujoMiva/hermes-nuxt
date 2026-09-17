<script setup lang="ts">
definePageMeta({ layout: 'default' })

const route = useRoute()
const jobs = useJobs()
const { isConfigured } = useConnection()
const job = computed(() => jobs.find(String(route.params.id || '')))
const loading = ref(!job.value)

onMounted(async () => {
  if (!isConfigured.value) {
    loading.value = false
    return
  }
  if (!jobs.items.value.length) await jobs.refresh()
  if (!job.value) {
    try {
      const row = await jobs.get(String(route.params.id || ''))
      if (row && !jobs.find(row.id)) jobs.items.value = [...jobs.items.value, row]
    } catch {
      // empty state below
    }
  }
  loading.value = false
})
</script>

<template>
  <div
    v-if="loading"
    class="job-edit-loading"
  >
    <UiIcon
      name="i-lucide-loader-circle"
      :size="24"
      spin
    />
  </div>
  <JobEditorForm
    v-else-if="job"
    :job="job"
  />
  <p
    v-else
    class="job-edit-missing"
  >
    找不到这个定时任务。
  </p>
</template>

<style scoped>
.job-edit-loading,
.job-edit-missing {
  display: flex;
  height: 100%;
  justify-content: center;
  padding: 4rem 1rem;
  color: var(--color-text-muted);
}
</style>
