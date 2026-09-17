<script setup lang="ts">
import type { HermesJob, HermesMessage, HermesSession } from '~/types/hermes'
import { HermesError } from '~/composables/useHermes'
import { profileRequestHeaders } from '~/composables/useJobs'
import { jobScheduleText } from '~/utils/schedule'
import { fetchAllSessionMessages } from '~/utils/sessionMessages'

definePageMeta({ layout: 'default' })

const RUN_LIMIT = 50
const SESSION_PAGE = 200
const SESSION_SCAN_MAX = 1000

interface HistoryEntry {
  id: string
  time: string
  title: string
  failed: boolean
  active: boolean
  statusLabel: string
  output: string
}

interface CronRunsPayload {
  runs?: HermesSession[]
  data?: HermesSession[]
}

const route = useRoute()
const { request } = useHermes()
const { isConfigured } = useConnection()
const jobs = useJobs()
const chrome = useJobsChrome()
const toast = useToast()

const jobId = computed(() => {
  const raw = String(route.params.id || '')
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
})
const job = computed(() => jobs.find(jobId.value))
const loading = ref(true)
const entries = ref<HistoryEntry[]>([])

function cronSessionPrefix(id: string) {
  return `cron_${id}_`
}

function isCronSessionForJob(sessionId: string, id: string) {
  return sessionId.startsWith(cronSessionPrefix(id))
}

function parseCronSessionTime(sessionId: string, id: string) {
  const stamp = sessionId.slice(cronSessionPrefix(id).length)
  const match = stamp.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/)
  if (!match) return ''
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`
}

function looksLikeCronOutput(text: string) {
  return /^#\s*Cron Job:/m.test(text) || /\*\*Job ID:\*\*/i.test(text)
}

function asSessions(payload: unknown): HermesSession[] {
  if (Array.isArray(payload)) return payload as HermesSession[]
  if (payload && typeof payload === 'object') {
    const rec = payload as CronRunsPayload & { data?: HermesSession[] }
    if (Array.isArray(rec.runs)) return rec.runs
    if (Array.isArray(rec.data)) return rec.data
  }
  return []
}

function runTimeFor(session: HermesSession, id: string) {
  return parseCronSessionTime(session.id, id)
    || formatDateTime(session.started_at || session.last_active, true)
}

function isFailedOutput(text: string) {
  return /\(FAILED\)/i.test(text)
    || /\*\*Status:\*\*\s*(script failed|failed|error|BLOCKED|monitor source failed)/i.test(text)
    || /\*\*Mode:\*\*[^\n]*\n\*\*Status:\*\*\s*script failed/i.test(text)
}

function isRunFailed(session: HermesSession, output: string) {
  if (/\(FAILED\)/i.test(session.title || '')) return true
  const reason = String(session.end_reason || '').toLowerCase()
  if (reason && reason !== 'cron_complete') return true
  return isFailedOutput(output)
}

function isRunActive(session: HermesSession) {
  if (session.ended_at) return false
  const last = asDate(session.last_active || session.started_at)
  if (!last) return true
  return Date.now() - last.getTime() < 5 * 60 * 1000
}

function lastAssistantText(messages: HermesMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index]
    if (item?.role !== 'assistant') continue
    const text = extractText(item.content).trim()
    if (text) return text
  }
  return ''
}

function firstUserText(messages: HermesMessage[]) {
  for (const item of messages) {
    if (item.role !== 'user') continue
    const text = extractText(item.content).trim()
    if (text) return text
  }
  return ''
}

function buildCronMarkdown(row: HermesJob, parts: {
  failed?: boolean
  runTime: string
  prompt?: string
  response?: string
  error?: string
  mode?: string
  status?: string
}) {
  const name = row.name?.trim() || row.id
  const heading = parts.failed ? `# Cron Job: ${name} (FAILED)` : `# Cron Job: ${name}`
  const lines = [
    heading,
    '',
    `**Job ID:** ${row.id}`,
    `**Run Time:** ${parts.runTime || '—'}`
  ]
  if (parts.mode) lines.push(`**Mode:** ${parts.mode}`)
  if (parts.status) lines.push(`**Status:** ${parts.status}`)
  const schedule = jobScheduleText(row)
  if (schedule && !parts.mode) lines.push(`**Schedule:** ${schedule}`)

  if (parts.prompt) {
    lines.push('', '## Prompt', '', parts.prompt)
  }
  if (parts.failed && parts.error) {
    lines.push('', '## Error', '', '```', parts.error, '```')
  } else if (parts.response) {
    lines.push('', '## Response', '', parts.response)
  } else if (parts.status && !parts.prompt) {
    // no_agent / gate docs already described by Mode + Status
  } else if (!parts.failed) {
    lines.push('', '## Response', '', '(No response generated)')
  }
  return `${lines.join('\n')}\n`
}

function statusLabel(failed: boolean, active: boolean) {
  if (active) return '运行中'
  return failed ? '失败' : '成功'
}

function entryIcon(entry: HistoryEntry) {
  if (entry.active) return 'i-lucide-loader-circle'
  return entry.failed ? 'i-lucide-triangle-alert' : 'i-lucide-circle-check'
}

function entryIconClass(entry: HistoryEntry) {
  if (entry.active) return 'is-active-icon'
  return entry.failed ? 'is-failed-icon' : 'is-ok-icon'
}

function toEntry(id: string, time: string, title: string, output: string, failed: boolean, active = false): HistoryEntry {
  return {
    id,
    time,
    title,
    failed,
    active,
    statusLabel: statusLabel(failed, active),
    output: output.trim()
  }
}

function fromJobFallback(row: HermesJob): HistoryEntry | null {
  const exec = row.latest_execution
  if (!row.last_run_at && !row.last_error && !row.last_status && !row.last_output && !exec) return null

  const stored = String(row.last_output || '').trim()
  if (looksLikeCronOutput(stored)) {
    return toEntry(
      String(exec?.id || row.id),
      formatDateTime(row.last_run_at, true) || '—',
      row.name?.trim() || row.id,
      stored,
      isJobFailed(row) || isFailedOutput(stored)
    )
  }

  const failed = isJobFailed(row) || String(exec?.status || '').toLowerCase() === 'failed'
  const runTime = formatDateTime(row.last_run_at || exec?.finished_at || exec?.claimed_at, true) || '—'
  const error = String(row.last_error || exec?.error || '').trim()
  const name = row.name?.trim() || row.id
  if (row.no_agent) {
    let status = String(row.last_status || exec?.status || '').trim()
    if (failed && !status) status = 'script failed'
    const lines = [
      `# Cron Job: ${name}`,
      '',
      `**Job ID:** ${row.id}`,
      `**Run Time:** ${runTime}`,
      '**Mode:** no_agent (script)'
    ]
    if (status) lines.push(`**Status:** ${status}`)
    if (error) lines.push('', error)
    return toEntry(String(exec?.id || row.id), runTime, name, `${lines.join('\n')}\n`, failed)
  }
  const output = buildCronMarkdown(row, {
    failed,
    runTime,
    error,
    response: failed ? '' : stored
  })
  return toEntry(String(exec?.id || row.id), runTime, name, output, failed)
}

async function loadDashboardRuns(id: string, headers: Record<string, string>) {
  try {
    const payload = await request<CronRunsPayload>(`/api/cron/jobs/${encodeURIComponent(id)}/runs`, {
      query: { limit: RUN_LIMIT },
      extraHeaders: headers
    })
    if (payload && Array.isArray(payload.runs)) return payload.runs
  } catch (error) {
    // 远程网关没有 dashboard 的 /runs；其它错误同样降级到会话列表。
    if (!(error instanceof HermesError)) throw error
  }
  return null
}

async function loadSessionsByPrefix(id: string, headers: Record<string, string>) {
  const matched: HermesSession[] = []
  for (let offset = 0; offset < SESSION_SCAN_MAX && matched.length < RUN_LIMIT; offset += SESSION_PAGE) {
    const payload = await request<{ data?: HermesSession[], has_more?: boolean }>('/api/sessions', {
      query: {
        limit: SESSION_PAGE,
        offset,
        include_children: true,
        source: 'cron'
      },
      extraHeaders: headers
    })
    const batch = asSessions(payload)
    for (const session of batch) {
      if (session.id && isCronSessionForJob(session.id, id)) matched.push(session)
    }
    if (!payload.has_more && batch.length < SESSION_PAGE) break
    if (!batch.length) break
  }
  return matched
}

function sortRuns(sessions: HermesSession[], id: string) {
  return [...sessions].sort((left, right) => {
    const rightTime = asDate(right.started_at)?.getTime()
      || asDate(parseCronSessionTime(right.id, id))?.getTime()
      || asDate(right.last_active)?.getTime()
      || 0
    const leftTime = asDate(left.started_at)?.getTime()
      || asDate(parseCronSessionTime(left.id, id))?.getTime()
      || asDate(left.last_active)?.getTime()
      || 0
    return rightTime - leftTime
  }).slice(0, RUN_LIMIT)
}

async function entryFromSession(session: HermesSession, row: HermesJob, headers: Record<string, string>) {
  const time = runTimeFor(session, row.id)
  const title = row.name?.trim() || session.title?.replace(/\s*\(FAILED\)\s*$/i, '').trim() || row.id
  const active = isRunActive(session)
  try {
    const list = await fetchAllSessionMessages(request, session.id, headers)
    const response = lastAssistantText(list)
    const prompt = firstUserText(list)
    const raw = response && looksLikeCronOutput(response) ? response : ''
    const failedGuess = isRunFailed(session, raw || response)
    const output = raw || buildCronMarkdown(row, {
      failed: failedGuess,
      runTime: time,
      prompt,
      response: failedGuess ? '' : response,
      error: failedGuess ? (response || String(session.end_reason || 'error')) : ''
    })
    return toEntry(session.id, time, title, output, isRunFailed(session, output), active)
  } catch {
    const preview = String(session.preview || '').trim()
    const output = looksLikeCronOutput(preview)
      ? preview
      : buildCronMarkdown(row, {
          failed: isRunFailed(session, preview),
          runTime: time,
          prompt: preview,
          response: '(No response generated)'
        })
    return toEntry(session.id, time, title, output, isRunFailed(session, output), active)
  }
}

async function resolveJob() {
  if (!jobs.items.value.length) await jobs.refresh()
  const current = jobs.find(jobId.value)
  if (current) return current
  const row = await jobs.get(jobId.value)
  if (row && !jobs.find(row.id)) jobs.items.value = [...jobs.items.value, row]
  return jobs.find(jobId.value) || row
}

async function loadHistory() {
  if (!isConfigured.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const current = await resolveJob()
    if (!current) {
      entries.value = []
      return
    }
    const extra = profileRequestHeaders(current._profile)
    const canonicalId = current.id
    const dashboardRuns = await loadDashboardRuns(canonicalId, extra)
    const sessions = sortRuns(
      dashboardRuns ?? await loadSessionsByPrefix(canonicalId, extra),
      canonicalId
    )
    const rows: HistoryEntry[] = []
    for (let index = 0; index < sessions.length; index += 8) {
      const chunk = sessions.slice(index, index + 8)
      const part = await Promise.all(chunk.map(session => entryFromSession(session, current, extra)))
      rows.push(...part)
    }
    if (!rows.length) {
      const fallback = fromJobFallback(current)
      if (fallback) rows.push(fallback)
    }
    entries.value = rows
  } catch (error) {
    toast.add({
      title: '无法加载执行历史',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

onMounted(loadHistory)
chrome.setRefreshHandler(() => {
  loadHistory()
})
</script>

<template>
  <div class="history">
    <SettingsNeedConnection v-if="!isConfigured" />
    <div
      v-else-if="loading"
      class="history__loading"
    >
      <UiIcon
        name="i-lucide-loader-circle"
        :size="24"
        spin
      />
    </div>
    <p
      v-else-if="!job"
      class="history__empty"
    >
      找不到这个任务。
    </p>
    <p
      v-else-if="!entries.length"
      class="history__empty"
    >
      还没有执行记录。
    </p>
    <article
      v-for="entry in entries"
      :key="entry.id"
      class="history-card"
    >
      <div class="history-card__head">
        <div>
          <p class="history-card__time">
            <UiIcon
              :name="entryIcon(entry)"
              :size="16"
              :spin="entry.active"
              :class="entryIconClass(entry)"
            />
            {{ entry.time }}
          </p>
          <p class="history-card__name">
            {{ entry.title }}
          </p>
        </div>
        <span
          class="history-card__status"
          :class="{ 'is-failed': entry.failed, 'is-active': entry.active }"
        >
          {{ entry.statusLabel }}
        </span>
      </div>
      <p class="history-card__label">
        输出
      </p>
      <div class="history-card__output">
        <MarkdownContent :source="entry.output" />
      </div>
    </article>
  </div>
</template>

<style lang="scss" scoped>
.history {
  height: 100%;
  overflow-y: auto;
  padding: 0.85rem 1rem calc(1.5rem + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.history__loading,
.history__empty {
  display: flex;
  justify-content: center;
  padding: 3.5rem 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.history-card {
  border-radius: 1.15rem;
  background: var(--color-surface);
  box-shadow: var(--shadow);
  padding: 0.95rem 1rem 1rem;
}

.history-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.history-card__time {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  color: var(--color-text-strong);
  font-size: 0.9rem;
  font-weight: 650;

  :deep(.is-failed-icon) {
    color: var(--color-error);
  }

  :deep(.is-ok-icon) {
    color: var(--color-success);
  }

  :deep(.is-active-icon) {
    color: var(--color-text-muted);
  }
}

.history-card__name {
  margin: 0.2rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.history-card__status {
  color: var(--color-success);
  font-size: 0.8rem;
  font-weight: 650;

  &.is-failed {
    color: var(--color-error);
  }

  &.is-active {
    color: var(--color-text-muted);
  }
}

.history-card__label {
  margin: 0.85rem 0 0.35rem;
  color: var(--color-text-dimmed);
  font-size: 0.7rem;
}

.history-card__output {
  color: var(--color-text);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}
</style>
