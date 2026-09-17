import { asDate } from '~/utils/format'

export type ScheduleKind = 'loop' | 'once' | 'cron'
export type IntervalUnit = 'm' | 'h' | 'd'

export interface JobScheduleState {
  kind: ScheduleKind
  intervalValue: number
  intervalUnit: IntervalUnit
  onceAt: string
  cron: string
}

const INTERVAL_RE = /^every\s+(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours|d|day|days)$/i
const CRON_FIELD_RE = /^[\d*,/-]+$/

export function emptyScheduleState(): JobScheduleState {
  return {
    kind: 'loop',
    intervalValue: 1,
    intervalUnit: 'h',
    onceAt: '',
    cron: '0 9 * * *'
  }
}

export function jobScheduleText(job?: {
  schedule?: string | { kind?: string, expr?: string, run_at?: string, minutes?: number, display?: string } | null
  schedule_display?: string | null
} | null) {
  const schedule = job?.schedule
  if (typeof schedule === 'string' && schedule.trim()) return schedule.trim()
  if (schedule && typeof schedule === 'object') {
    if (schedule.expr) return schedule.expr
    if (schedule.run_at) return schedule.run_at
    if (schedule.kind === 'interval' && schedule.minutes) return `every ${schedule.minutes}m`
    if (schedule.display) return schedule.display
  }
  return String(job?.schedule_display || '').trim()
}

function toDatetimeLocal(value: string) {
  const date = asDate(value)
  if (!date) return value.slice(0, 16).replace(' ', 'T')
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function compactInterval(minutes: number): Pick<JobScheduleState, 'intervalValue' | 'intervalUnit'> {
  if (minutes >= 1440 && minutes % 1440 === 0) return { intervalValue: minutes / 1440, intervalUnit: 'd' }
  if (minutes >= 60 && minutes % 60 === 0) return { intervalValue: minutes / 60, intervalUnit: 'h' }
  return { intervalValue: Math.max(1, minutes), intervalUnit: 'm' }
}

export function parseJobSchedule(raw?: string | null): JobScheduleState {
  const next = emptyScheduleState()
  const text = String(raw || '').trim()
  if (!text) return next

  const every = text.match(INTERVAL_RE)
  if (every) {
    const amount = Number(every[1] || 1)
    const unit = (every[2] || 'h').toLowerCase()
    next.kind = 'loop'
    next.intervalValue = Math.max(1, amount)
    if (unit.startsWith('d')) next.intervalUnit = 'd'
    else if (unit.startsWith('h')) next.intervalUnit = 'h'
    else next.intervalUnit = 'm'
    return next
  }

  const parts = text.split(/\s+/)
  if (parts.length >= 5 && parts.slice(0, 5).every(part => CRON_FIELD_RE.test(part))) {
    next.kind = 'cron'
    next.cron = text
    return next
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text) || text.includes('T')) {
    next.kind = 'once'
    next.onceAt = toDatetimeLocal(text)
    return next
  }

  return next
}

export function buildJobSchedule(state: JobScheduleState) {
  if (state.kind === 'once') {
    return state.onceAt.trim()
  }
  if (state.kind === 'cron') {
    return state.cron.trim()
  }
  const amount = Math.max(1, Number(state.intervalValue) || 1)
  return `every ${amount}${state.intervalUnit}`
}

export const INTERVAL_UNITS: Array<{ label: string, value: IntervalUnit }> = [
  { label: '分钟', value: 'm' },
  { label: '小时', value: 'h' },
  { label: '天', value: 'd' }
]

export function parseScheduleFromJob(job?: {
  schedule?: string | { kind?: string, expr?: string, run_at?: string, minutes?: number, display?: string } | null
  schedule_display?: string | null
} | null) {
  const schedule = job?.schedule
  if (schedule && typeof schedule === 'object') {
    if (schedule.kind === 'interval' && schedule.minutes) {
      return {
        ...emptyScheduleState(),
        kind: 'loop' as const,
        ...compactInterval(Number(schedule.minutes) || 60)
      }
    }
    if (schedule.kind === 'cron' && schedule.expr) {
      return { ...emptyScheduleState(), kind: 'cron' as const, cron: schedule.expr }
    }
    if (schedule.kind === 'once' && schedule.run_at) {
      return { ...emptyScheduleState(), kind: 'once' as const, onceAt: toDatetimeLocal(schedule.run_at) }
    }
  }
  return parseJobSchedule(jobScheduleText(job))
}
