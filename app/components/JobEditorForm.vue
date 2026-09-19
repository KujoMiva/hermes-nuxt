<script setup lang="ts">
import type { HermesJob, HermesSkill } from '~/types/hermes'
import type { ScheduleKind } from '~/utils/schedule'
import { asSkillList } from '~/utils/format'
import {
  INTERVAL_UNITS,
  buildJobSchedule,
  emptyScheduleState,
  parseScheduleFromJob
} from '~/utils/schedule'

const props = defineProps<{
  job?: HermesJob | null
}>()

const { isConfigured } = useConnection()
const gateway = useGateway()
const profiles = useProfiles()
const jobs = useJobs()
const toast = useToast()
const chrome = useJobsChrome()

const saving = ref(false)
const removing = ref(false)
const deleteOpen = ref(false)
const skillQuery = ref('')
const catalog = ref<HermesSkill[]>([])
const loadingSkills = ref(false)
const form = reactive({
  profile: '',
  name: '',
  prompt: '',
  deliver: 'local',
  skills: [] as string[],
  repeatLimited: false,
  repeatTimes: 1,
  schedule: emptyScheduleState()
})

const deliverItems = [
  { label: '本机保存', value: 'local' },
  { label: '原会话', value: 'origin' },
  { label: 'Telegram', value: 'telegram' },
  { label: 'Discord', value: 'discord' },
  { label: 'Slack', value: 'slack' },
  { label: '邮件', value: 'email' }
]

const kinds: Array<{ id: ScheduleKind, label: string, hint: string, icon: string }> = [
  { id: 'loop', label: '循环', hint: '每隔一段时间', icon: 'i-lucide-refresh-cw' },
  { id: 'once', label: '一次', hint: '指定日期时间', icon: 'i-lucide-calendar' },
  { id: 'cron', label: 'Cron', hint: '表达式', icon: 'i-lucide-terminal' }
]

const editing = computed(() => Boolean(props.job?.id))
const originalRepeat = computed(() => parseJobRepeat(props.job))

function applyJob(job?: HermesJob | null) {
  form.profile = job?._profile || job?.profile || profiles.currentId.value || ''
  form.name = job?.name || ''
  form.prompt = String(job?.prompt || '')
  form.deliver = String(job?.deliver || 'local')
  form.skills = parseJobSkills(job)
  const repeat = parseJobRepeat(job)
  form.repeatLimited = repeat.times != null
  form.repeatTimes = repeat.times || 1
  Object.assign(form.schedule, parseScheduleFromJob(job || undefined))
}

watch(() => props.job, applyJob, { immediate: true })

const requestDelete = () => {
  deleteOpen.value = true
}

watch(() => props.job?.id, (id) => {
  chrome.setDeleteHandler(id ? requestDelete : null)
}, { immediate: true })

async function loadSkills() {
  if (!isConfigured.value) {
    catalog.value = []
    loadingSkills.value = false
    return
  }
  loadingSkills.value = true
  try {
    catalog.value = asSkillList(await gateway.request('skills.manage', { action: 'list' })) as HermesSkill[]
  } catch {
    catalog.value = []
  } finally {
    loadingSkills.value = false
  }
}

onMounted(async () => {
  if (isConfigured.value) await profiles.refresh()
  if (!editing.value && !form.profile) form.profile = profiles.currentId.value || ''
  await loadSkills()
})

watch(isConfigured, (ok) => {
  if (ok) void loadSkills()
})

function setKind(kind: ScheduleKind) {
  const prev = form.schedule.kind
  form.schedule.kind = kind
  if (editing.value) return
  if (kind === 'once') {
    form.repeatLimited = true
    form.repeatTimes = Math.max(1, form.repeatTimes || 1)
  } else if (prev === 'once') {
    form.repeatLimited = false
  }
}

function onIntervalUnit(value: string) {
  if (value === 'm' || value === 'h' || value === 'd') {
    form.schedule.intervalUnit = value
  }
}

function catalogNames() {
  return catalog.value
    .map(item => item.name?.trim())
    .filter((name): name is string => Boolean(name))
}

const skillNames = computed(() => {
  const seen = new Set<string>()
  const names: string[] = []
  for (const name of [...form.skills, ...catalogNames()]) {
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  const needle = skillQuery.value.trim().toLowerCase()
  if (!needle) return names
  return names.filter(name => name.toLowerCase().includes(needle))
})

function isSkillOn(name: string) {
  return form.skills.includes(name)
}

function toggleSkill(name: string) {
  if (isSkillOn(name)) form.skills = form.skills.filter(item => item !== name)
  else form.skills = [...form.skills, name]
}

function selectedSkills() {
  return [...new Set(form.skills.map(item => item.trim()).filter(Boolean))]
}

function nextRepeatTimes() {
  return Math.max(1, Math.floor(Number(form.repeatTimes) || 1))
}

function repeatForCreate() {
  if (!form.repeatLimited) return undefined
  return nextRepeatTimes()
}

function repeatForUpdate() {
  const times = form.repeatLimited ? nextRepeatTimes() : null
  if (times === originalRepeat.value.times) return undefined
  return {
    times,
    completed: originalRepeat.value.completed
  }
}

async function save() {
  const name = form.name.trim()
  const prompt = form.prompt.trim()
  const schedule = buildJobSchedule(form.schedule)
  if (!name) {
    toast.add({ title: '请填写标题', color: 'warning' })
    return
  }
  if (!schedule) {
    toast.add({ title: '请填写执行时间', color: 'warning' })
    return
  }
  if (!prompt) {
    toast.add({ title: '请填写任务说明', color: 'warning' })
    return
  }
  saving.value = true
  try {
    const skills = selectedSkills()
    if (editing.value && props.job) {
      const body: Record<string, unknown> = {
        name,
        prompt,
        schedule,
        deliver: form.deliver,
        skills
      }
      const repeat = repeatForUpdate()
      if (repeat) body.repeat = repeat
      try {
        await jobs.update(props.job.id, body, props.job._profile)
      } catch (error) {
        if (!repeat || typeof repeat !== 'object' || !form.repeatLimited) throw error
        await jobs.update(props.job.id, { ...body, repeat: nextRepeatTimes() }, props.job._profile)
      }
      toast.add({ title: '任务已更新', color: 'success' })
    } else {
      const body: Record<string, unknown> = {
        name,
        prompt,
        schedule,
        deliver: form.deliver
      }
      if (skills.length) body.skills = skills
      const repeat = repeatForCreate()
      if (repeat != null) body.repeat = repeat
      await jobs.create(body, form.profile)
      toast.add({ title: '任务已创建', color: 'success' })
    }
    await jobs.refresh()
    await navigateTo('/jobs')
  } catch (error) {
    toast.add({
      title: '保存失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (!props.job) return
  removing.value = true
  try {
    await jobs.remove(props.job)
    toast.add({ title: '任务已删除', color: 'success' })
    deleteOpen.value = false
    await navigateTo('/jobs')
  } catch (error) {
    toast.add({
      title: '删除失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    removing.value = false
  }
}

const profileLabel = computed(() => profiles.currentName.value || props.job?._profileName || 'Default')
</script>

<template>
  <div class="job-editor">
    <SettingsNeedConnection v-if="!isConfigured" />
    <template v-else>
      <section class="job-editor__card">
        <p class="job-editor__lead">
          任务会跑在当前连接的 Profile 上。写清楚 Agent 到点后要完成什么。
        </p>
        <div class="job-line">
          <span>Profile</span>
          <p class="job-line__value">
            {{ profileLabel }}
          </p>
        </div>
        <label class="job-line">
          <span>标题</span>
          <input
            v-model="form.name"
            maxlength="200"
            placeholder="例如：每日总结"
          >
        </label>
        <label class="job-note">
          <span class="job-note__head">
            <span>任务说明</span>
            <span>{{ form.prompt.length }}/5000</span>
          </span>
          <textarea
            v-model="form.prompt"
            maxlength="5000"
            rows="5"
            placeholder="写清楚 Agent 到点后要做什么"
          />
        </label>
      </section>

      <section class="job-editor__card">
        <p class="job-editor__kicker">
          执行
        </p>
        <p class="job-editor__lead">
          循环、一次性时间和 Cron 表达式都会直接写入 Hermes cron。
        </p>
        <div class="job-kinds">
          <button
            v-for="item in kinds"
            :key="item.id"
            type="button"
            class="job-kind"
            :class="{ 'is-active': form.schedule.kind === item.id }"
            @click="setKind(item.id)"
          >
            <UiIcon
              :name="item.icon"
              :size="16"
            />
            <strong>{{ item.label }}</strong>
            <span>{{ item.hint }}</span>
          </button>
        </div>

        <label
          v-if="form.schedule.kind === 'loop'"
          class="job-line"
        >
          <span>间隔</span>
          <div class="job-interval">
            <input
              v-model.number="form.schedule.intervalValue"
              type="number"
              min="1"
            >
            <UiSelect
              :model-value="form.schedule.intervalUnit"
              :items="INTERVAL_UNITS"
              aria-label="间隔单位"
              @update:model-value="onIntervalUnit"
            />
          </div>
        </label>
        <label
          v-else-if="form.schedule.kind === 'once'"
          class="job-line"
        >
          <span>执行时间</span>
          <input
            v-model="form.schedule.onceAt"
            type="datetime-local"
          >
        </label>
        <label
          v-else
          class="job-line"
        >
          <span>Cron 表达式</span>
          <input
            v-model="form.schedule.cron"
            placeholder="30 16 * * 1-5"
          >
        </label>

        <p class="job-editor__kicker">
          重复
        </p>
        <p class="job-editor__lead">
          {{ form.schedule.kind === 'once' ? '一次性任务默认只跑 1 次。' : '不限次数会一直按计划跑。' }}
          <template v-if="editing && originalRepeat.completed">
            已经跑过 {{ originalRepeat.completed }} 次。
          </template>
        </p>
        <div class="job-kinds job-kinds--pair">
          <button
            type="button"
            class="job-kind"
            :class="{ 'is-active': !form.repeatLimited }"
            @click="form.repeatLimited = false"
          >
            <UiIcon
              name="i-lucide-infinity"
              :size="16"
            />
            <strong>一直跑</strong>
            <span>不限次数</span>
          </button>
          <button
            type="button"
            class="job-kind"
            :class="{ 'is-active': form.repeatLimited }"
            @click="form.repeatLimited = true"
          >
            <UiIcon
              name="i-lucide-hash"
              :size="16"
            />
            <strong>指定次数</strong>
            <span>跑完即停</span>
          </button>
        </div>
        <label
          v-if="form.repeatLimited"
          class="job-line"
        >
          <span>次数</span>
          <input
            v-model.number="form.repeatTimes"
            type="number"
            min="1"
            step="1"
          >
        </label>
      </section>

      <section class="job-editor__card">
        <p class="job-editor__kicker">
          技能
        </p>
        <p class="job-editor__lead">
          到点后按选择顺序先加载这些技能，再跑任务说明。可不选。
        </p>
        <label class="job-line">
          <span>搜索技能</span>
          <input
            v-model="skillQuery"
            placeholder="名称"
          >
        </label>
        <p
          v-if="loadingSkills"
          class="job-skills__empty"
        >
          加载中…
        </p>
        <div
          v-else
          class="job-skills"
        >
          <button
            v-for="name in skillNames"
            :key="name"
            type="button"
            class="job-skill"
            :class="{ 'is-active': isSkillOn(name) }"
            @click="toggleSkill(name)"
          >
            {{ name }}
          </button>
          <p
            v-if="!skillNames.length"
            class="job-skills__empty"
          >
            {{ skillQuery.trim() ? '没有匹配的技能' : '这个 Profile 还没有可列的技能' }}
          </p>
        </div>
        <p
          v-if="form.skills.length"
          class="job-skills__picked"
        >
          已选 {{ form.skills.length }} 个
        </p>
      </section>

      <section class="job-editor__card">
        <label class="job-line job-line--select">
          <span>投递渠道</span>
          <UiSelect
            v-model="form.deliver"
            :items="deliverItems"
          />
        </label>
      </section>

      <div class="job-editor__save">
        <UiButton
          icon="i-lucide-save"
          label="保存定时任务"
          :loading="saving"
          @click="save"
        />
      </div>
    </template>

    <UiConfirm
      v-model:open="deleteOpen"
      tone="danger"
      title="删除这个定时任务？"
      :description="`${form.name || '该任务'} 会从 ${profileLabel} Profile 中删除。`"
      confirm-label="删除"
      :loading="removing"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style lang="scss" scoped>
.job-editor {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  gap: 0.85rem;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0.85rem 1rem 0.35rem;
  -webkit-overflow-scrolling: touch;
}

.job-editor__card {
  border-radius: 1.15rem;
  background: var(--color-surface);
  box-shadow: var(--shadow);
  padding: 1rem 1rem 0.35rem;
}

.job-editor__kicker {
  margin: 0 0 0.2rem;
  color: var(--color-text-strong);
  font-size: 0.95rem;
  font-weight: 650;
}

.job-editor__lead {
  margin: 0 0 0.85rem;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  line-height: 1.45;
}

.job-line {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.95rem;

  > span {
    color: var(--color-text-muted);
    font-size: 0.75rem;
  }

  .job-line__value {
    margin: 0;
    min-height: 2.35rem;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-strong);
    font: inherit;
    padding: 0.35rem 0;
  }

  input {
    width: 100%;
    min-height: 2.35rem;
    border: 0;
    border-bottom: 1px solid var(--color-border);
    border-radius: 0;
    background: transparent;
    color: var(--color-text-strong);
    font: inherit;
    font-size: 1rem;
    padding: 0.35rem 0;
  }

  :deep(.ui-select) {
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
  }

  :deep(.ui-select__trigger) {
    min-height: 2.35rem;
    border: 0;
    border-bottom: 1px solid var(--color-border);
    border-radius: 0;
    background: transparent;
    padding: 0.35rem 0;

    &:hover:not(:disabled),
    &:focus-visible,
    &.is-open {
      background: transparent;
      border-bottom-color: var(--color-inverted);
    }
  }
}

.job-interval {
  display: grid;
  grid-template-columns: 1fr 7rem;
  gap: 0.75rem;
}

.job-note {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.85rem;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--color-text-muted);
    font-size: 0.75rem;
  }

  textarea {
    min-height: 7.5rem;
    border: 0;
    background: transparent;
    color: var(--color-text-strong);
    font: inherit;
    font-size: 1rem;
    line-height: 1.5;
    padding: 0;
    resize: vertical;
  }
}

.job-kinds {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-bottom: 1rem;

  &--pair {
    grid-template-columns: 1fr 1fr;
  }
}

.job-kind {
  display: flex;
  min-height: 4.6rem;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  border: 1px solid var(--color-border);
  border-radius: 0.85rem;
  background: var(--color-surface);
  color: var(--color-text);
  padding: 0.65rem 0.6rem;
  text-align: left;

  strong {
    color: var(--color-text-strong);
    font-size: 0.875rem;
  }

  span {
    color: var(--color-text-muted);
    font-size: 0.6875rem;
  }

  &.is-active {
    border-color: var(--color-inverted);
    background: var(--color-elevated);
  }
}

.job-skills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  max-height: 12rem;
  margin-bottom: 0.55rem;
  overflow-y: auto;
}

.job-skill {
  @include truncate;
  max-width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.75rem;
  padding: 0.28rem 0.7rem;

  &.is-active {
    border-color: var(--color-inverted);
    background: var(--color-elevated);
    color: var(--color-text-strong);
  }
}

.job-skills__empty,
.job-skills__picked {
  margin: 0 0 0.85rem;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.job-skills__empty {
  width: 100%;
}

.job-editor__save {
  position: sticky;
  bottom: 0;
  z-index: 1;
  margin-top: auto;
  padding: 0.75rem 0 calc(0.75rem + env(safe-area-inset-bottom, 0px));
  background: var(--color-bg);

  :deep(.ui-btn) {
    width: 100%;
    min-height: 2.85rem;
    border-radius: 0.95rem;
  }
}
</style>
