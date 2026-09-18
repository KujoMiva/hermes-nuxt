import type { HermesJob } from '~/types/hermes'
import { JsonRpcGatewayError } from '~/utils/gateway-client'
import { isJobEnabled, isJobFailed } from '~/utils/format'

function asJobs(payload: unknown): HermesJob[] {
  if (Array.isArray(payload)) return payload as HermesJob[]
  if (payload && typeof payload === 'object') {
    const rec = payload as Record<string, unknown>
    if (Array.isArray(rec.jobs)) return rec.jobs as HermesJob[]
    if (Array.isArray(rec.data)) return rec.data as HermesJob[]
  }
  return []
}

function asJob(payload: unknown): HermesJob | null {
  if (!payload || typeof payload !== 'object') return null
  const rec = payload as Record<string, unknown>
  const row = (rec.job && typeof rec.job === 'object' ? rec.job : rec) as HermesJob
  const id = String(row.id || row.name || '')
  if (!id) return null
  return { ...row, id }
}

function scheduleText(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    return String(rec.expr || rec.display || rec.run_at || '')
  }
  return ''
}

export function useJobs() {
  const gateway = useGateway()
  const { isConfigured, profile } = useConnection()
  const toast = useToast()

  const items = useState<HermesJob[]>('hermes-jobs', () => [])
  const loading = useState('hermes-jobs-loading', () => false)

  async function refresh() {
    if (!isConfigured.value) {
      items.value = []
      loading.value = false
      return
    }
    loading.value = true
    try {
      const payload = await gateway.request('cron.manage', {
        action: 'list',
        include_disabled: true
      })
      items.value = asJobs(payload).map(job => ({
        ...job,
        id: String(job.id || job.name || ''),
        _profile: profile.value || '',
        _profileName: profile.value || 'Default'
      }))
    } catch (error) {
      toast.add({
        title: '无法加载定时任务',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
    } finally {
      loading.value = false
    }
  }

  function find(id: string) {
    return items.value.find(item => item.id === id || item.name === id) || null
  }

  async function get(id: string) {
    if (!items.value.length) await refresh()
    return find(id)
  }

  async function create(body: Record<string, unknown>, profileId?: string | null) {
    const payload = await gateway.request('cron.manage', {
      action: 'add',
      name: body.name,
      schedule: scheduleText(body.schedule),
      prompt: body.prompt,
      repeat: body.repeat,
      deliver: body.deliver,
      skills: body.skills,
      ...(profileId ? { profile: profileId } : {})
    })
    return asJob(payload)
  }

  async function update(id: string, body: Record<string, unknown>, profileId?: string | null) {
    await gateway.request('cron.manage', { action: 'remove', name: id })
    return create({ ...body, name: body.name || id }, profileId)
  }

  async function pause(job: HermesJob) {
    await gateway.request('cron.manage', { action: 'pause', name: job.id })
  }

  async function resume(job: HermesJob) {
    await gateway.request('cron.manage', { action: 'resume', name: job.id })
  }

  async function run(job: HermesJob) {
    try {
      await gateway.request('cron.manage', { action: 'run', name: job.id })
    } catch (error) {
      if (error instanceof JsonRpcGatewayError && error.code === 4016) {
        throw new Error('远程网关不支持立即运行定时任务，请等计划时间触发')
      }
      throw error
    }
  }

  async function remove(job: HermesJob) {
    await gateway.request('cron.manage', { action: 'remove', name: job.id })
    items.value = items.value.filter(item => item.id !== job.id)
  }

  const stats = computed(() => {
    const all = items.value
    const enabled = all.filter(isJobEnabled)
    const failed = all.filter(isJobFailed)
    const nextTimes = enabled
      .map(item => {
        const raw = item.next_run_at
        if (raw == null || raw === '') return 0
        if (typeof raw === 'number') return raw > 1e12 ? raw : raw * 1000
        const parsed = Date.parse(String(raw))
        return Number.isNaN(parsed) ? 0 : parsed
      })
      .filter(Boolean)
      .sort((left, right) => left - right)
    return {
      total: all.length,
      enabled: enabled.length,
      failed: failed.length,
      nextAt: nextTimes[0] || 0
    }
  })

  const grouped = computed(() => {
    return [{
      id: profile.value || 'default',
      name: profile.value || 'Default',
      jobs: items.value
    }]
  })

  return {
    create,
    find,
    get,
    grouped,
    items,
    loading,
    pause,
    refresh,
    remove,
    resume,
    run,
    stats,
    update
  }
}

const jobsChromeDelete = shallowRef<(() => void) | null>(null)
const jobsChromeRefresh = shallowRef<(() => void) | null>(null)
const jobsChromeAdd = shallowRef<(() => void) | null>(null)
const jobsChromeSubtitle = ref('')
const jobsChromeActionLabel = ref('')
const jobsChromeAction = shallowRef<(() => void) | null>(null)

export function useJobsChrome() {
  function setDeleteHandler(handler: (() => void) | null) {
    if (import.meta.server) return
    jobsChromeDelete.value = handler
    if (!handler) return
    onBeforeUnmount(() => {
      if (jobsChromeDelete.value === handler) jobsChromeDelete.value = null
    })
  }

  function setRefreshHandler(handler: (() => void) | null) {
    if (import.meta.server) return
    jobsChromeRefresh.value = handler
    if (!handler) return
    onBeforeUnmount(() => {
      if (jobsChromeRefresh.value === handler) jobsChromeRefresh.value = null
    })
  }

  function setAddHandler(handler: (() => void) | null) {
    if (import.meta.server) return
    jobsChromeAdd.value = handler
    if (!handler) return
    onBeforeUnmount(() => {
      if (jobsChromeAdd.value === handler) jobsChromeAdd.value = null
    })
  }

  function setNavExtras(options: {
    subtitle?: string
    actionLabel?: string
    action?: (() => void) | null
  }) {
    if (import.meta.server) return
    jobsChromeSubtitle.value = options.subtitle || ''
    jobsChromeActionLabel.value = options.actionLabel || ''
    jobsChromeAction.value = options.action || null
    onBeforeUnmount(() => {
      jobsChromeSubtitle.value = ''
      jobsChromeActionLabel.value = ''
      if (jobsChromeAction.value === options.action) jobsChromeAction.value = null
    })
  }

  return {
    actionHandler: jobsChromeAction,
    actionLabel: jobsChromeActionLabel,
    addHandler: jobsChromeAdd,
    deleteHandler: jobsChromeDelete,
    refreshHandler: jobsChromeRefresh,
    setAddHandler,
    setDeleteHandler,
    setNavExtras,
    setRefreshHandler,
    subtitle: jobsChromeSubtitle
  }
}
