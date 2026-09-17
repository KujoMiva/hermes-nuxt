<script setup lang="ts">
import type { HermesJob } from '~/types/hermes'

definePageMeta({ layout: 'default' })

const { isConfigured } = useConnection()
const jobs = useJobs()
const toast = useToast()
const pendingRun = ref<HermesJob | null>(null)
const pendingDelete = ref<HermesJob | null>(null)
const busyId = ref('')

onMounted(async () => {
  if (isConfigured.value) {
    await Promise.allSettled([useProfiles().refresh(), jobs.refresh()])
  }
})

watch(isConfigured, (ok) => {
  if (ok) void jobs.refresh()
})

async function toggleJob(job: HermesJob, enabled: boolean) {
  busyId.value = `${job.id}:toggle`
  try {
    if (enabled) await jobs.resume(job)
    else await jobs.pause(job)
    await jobs.refresh()
  } catch (error) {
    toast.add({
      title: enabled ? '恢复失败' : '暂停失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    busyId.value = ''
  }
}

async function confirmRun() {
  const job = pendingRun.value
  if (!job) return
  busyId.value = `${job.id}:run`
  try {
    await jobs.run(job)
    toast.add({ title: '已安排立即运行', color: 'success' })
    pendingRun.value = null
    await jobs.refresh()
  } catch (error) {
    toast.add({
      title: '触发失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    busyId.value = ''
  }
}

async function confirmDelete() {
  const job = pendingDelete.value
  if (!job) return
  busyId.value = `${job.id}:delete`
  try {
    await jobs.remove(job)
    toast.add({ title: '任务已删除', color: 'success' })
    pendingDelete.value = null
  } catch (error) {
    toast.add({
      title: '删除失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    busyId.value = ''
  }
}

function jobTitle(job: HermesJob) {
  return job.name?.trim() || job.id
}

function jobMetaLine(job: HermesJob) {
  const bits = [
    `下次 ${formatDateTime(job.next_run_at) || '—'}`,
    `上次 ${formatDateTime(job.last_run_at) || '—'}`,
    jobRepeatText(job)
  ]
  const skills = parseJobSkills(job)
  if (skills.length === 1 && skills[0]) bits.push(skills[0])
  else if (skills.length) bits.push(`${skills.length} 个技能`)
  return bits.join(' · ')
}
</script>

<template>
  <div class="jobs">
    <SettingsNeedConnection v-if="!isConfigured" />
    <template v-else>
      <div
        v-if="jobs.loading.value"
        class="jobs__loading"
      >
        <UiIcon
          name="i-lucide-loader-circle"
          :size="24"
          spin
        />
      </div>
      <template v-else>
        <section class="jobs-stats">
          <div>
            <strong>{{ jobs.stats.value.total }}</strong>
            <span>全部</span>
          </div>
          <div>
            <strong>{{ jobs.stats.value.enabled }}</strong>
            <span>启用</span>
          </div>
          <div>
            <strong>{{ jobs.stats.value.failed }}</strong>
            <span>失败</span>
          </div>
          <div>
            <strong>{{ jobs.stats.value.nextAt ? formatDateTime(jobs.stats.value.nextAt).slice(5, 16) : '无' }}</strong>
            <span>下次</span>
          </div>
        </section>

        <section
          v-for="group in jobs.grouped.value"
          :key="group.id || 'default'"
          class="jobs-group"
        >
          <div class="jobs-group__head">
            <span class="jobs-group__avatar">{{ group.name.slice(0, 1).toUpperCase() }}</span>
            <strong>{{ group.name }}</strong>
            <span>{{ group.jobs.filter(isJobEnabled).length }}/{{ group.jobs.length }} 启用</span>
          </div>
          <article
            v-for="job in group.jobs"
            :key="job.id"
            class="job-card"
          >
            <div class="job-card__top">
              <div class="job-card__text">
                <p class="job-card__title">
                  {{ jobTitle(job) }}
                </p>
                <p class="job-card__cron">
                  {{ jobScheduleText(job) || '未设置计划' }}
                </p>
                <p class="job-card__meta">
                  {{ jobMetaLine(job) }}
                </p>
              </div>
              <UiSwitch
                :model-value="isJobEnabled(job)"
                :disabled="busyId === `${job.id}:toggle`"
                @update:model-value="toggleJob(job, $event)"
              />
            </div>
            <div class="job-card__actions">
              <NuxtLink
                class="job-action"
                :to="`/jobs/${job.id}/history`"
              >
                <UiIcon
                  name="i-lucide-file-text"
                  :size="15"
                />
                历史
              </NuxtLink>
              <button
                type="button"
                class="job-action"
                @click="pendingRun = job"
              >
                <UiIcon
                  name="i-lucide-play"
                  :size="15"
                />
                运行
              </button>
              <NuxtLink
                class="job-action"
                :to="`/jobs/${job.id}`"
              >
                <UiIcon
                  name="i-lucide-square-pen"
                  :size="15"
                />
                编辑
              </NuxtLink>
              <button
                type="button"
                class="job-action is-danger"
                @click="pendingDelete = job"
              >
                <UiIcon
                  name="i-lucide-trash"
                  :size="15"
                />
                删除
              </button>
            </div>
          </article>
        </section>
        <p
          v-if="!jobs.items.value.length"
          class="jobs__empty"
        >
          还没有定时任务。
        </p>
      </template>
    </template>

    <UiConfirm
      :open="Boolean(pendingRun)"
      tone="primary"
      title="立即运行这个定时任务？"
      :description="pendingRun ? `${jobTitle(pendingRun)} 会在 ${pendingRun._profileName || 'Default'} Profile 中被安排到下一次 scheduler tick 执行。` : ''"
      confirm-label="立即运行"
      :loading="Boolean(pendingRun && busyId === `${pendingRun.id}:run`)"
      @update:open="pendingRun = $event ? pendingRun : null"
      @confirm="confirmRun"
    />
    <UiConfirm
      :open="Boolean(pendingDelete)"
      tone="danger"
      title="删除这个定时任务？"
      :description="pendingDelete ? `${jobTitle(pendingDelete)} 会从 ${pendingDelete._profileName || 'Default'} Profile 中删除。` : ''"
      confirm-label="删除"
      :loading="Boolean(pendingDelete && busyId === `${pendingDelete.id}:delete`)"
      @update:open="pendingDelete = $event ? pendingDelete : null"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style lang="scss" scoped>
.jobs {
  height: 100%;
  overflow-y: auto;
  padding: 0.85rem 1rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
}

.jobs__loading,
.jobs__empty {
  display: flex;
  justify-content: center;
  padding: 3rem 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.jobs__empty {
  margin: 0;
}

.jobs-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.35rem;
  border-radius: 1.15rem;
  background: var(--color-surface);
  box-shadow: var(--shadow);
  padding: 0.9rem 0.4rem;
  text-align: center;

  strong {
    display: block;
    color: var(--color-text-strong);
    font-size: 1.05rem;
    font-weight: 650;
  }

  span {
    color: var(--color-text-muted);
    font-size: 0.7rem;
  }
}

.jobs-group {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin-top: 1.1rem;
}

.jobs-group__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.55rem;
  padding: 0 0.15rem;

  strong {
    color: var(--color-text-strong);
    font-size: 0.9rem;
  }

  span:last-child {
    margin-left: auto;
    color: var(--color-text-muted);
    font-size: 0.75rem;
  }
}

.jobs-group__avatar {
  display: inline-flex;
  width: 1.35rem;
  height: 1.35rem;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-elevated);
  color: var(--color-text-strong);
  font-size: 0.7rem;
  font-weight: 650;
}

.job-card {
  border-radius: 1.15rem;
  background: var(--color-surface);
  box-shadow: var(--shadow);
  padding: 0.95rem 1rem 0.85rem;
}

.job-card__top {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.job-card__text {
  min-width: 0;
  flex: 1;
}

.job-card__title {
  margin: 0;
  overflow: hidden;
  color: var(--color-text-strong);
  font-size: 0.95rem;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-card__cron,
.job-card__meta {
  margin: 0.28rem 0 0;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-card__actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.45rem;
  margin-top: 0.85rem;
}

.job-action {
  display: inline-flex;
  min-height: 2.15rem;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  border: 0;
  border-radius: 0.7rem;
  background: var(--color-elevated);
  color: var(--color-text-toned);
  font-size: 0.75rem;
  text-decoration: none;

  &.is-danger {
    background: var(--color-error-bg);
    color: var(--color-error);
  }
}
</style>
