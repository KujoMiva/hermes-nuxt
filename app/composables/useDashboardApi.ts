export class DashboardApiError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 502) {
    super(message)
    this.name = 'DashboardApiError'
    this.statusCode = statusCode
  }
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function errorMessage(error: unknown, fallback: string) {
  const rec = asRecord(error)
  const data = asRecord(rec.data)
  const message = data.message || data.statusMessage || rec.message || rec.statusMessage
  if (typeof message === 'string' && message.trim()) return message
  return error instanceof Error && error.message ? error.message : fallback
}

function errorStatus(error: unknown) {
  const rec = asRecord(error)
  const status = Number(rec.statusCode || rec.status || asRecord(rec.data).statusCode || 0)
  return Number.isFinite(status) && status > 0 ? status : 502
}

export function useDashboardApi() {
  async function request<T = unknown>(
    path: string,
    options: {
      method?: string
      body?: unknown
      query?: Record<string, string | number | boolean | undefined>
      timeout?: number
    } = {}
  ) {
    const slug = path.replace(/^\/api\//, '').replace(/^\/+/, '')
    try {
      return await $fetch<T>(`/api/remote/${slug}`, {
        method: (options.method || 'GET') as 'GET' | 'POST' | 'PUT' | 'DELETE',
        body: options.body,
        query: options.query,
        timeout: options.timeout
      })
    } catch (error) {
      throw new DashboardApiError(errorMessage(error, '网关 HTTP 请求失败'), errorStatus(error))
    }
  }

  return { request }
}
