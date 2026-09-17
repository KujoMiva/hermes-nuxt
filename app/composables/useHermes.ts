import { asSkillList } from '~/utils/format'

export class HermesError extends Error {
  status: number
  code?: string
  body?: unknown

  constructor(message: string, status = 500, extra?: { code?: string, body?: unknown }) {
    super(message)
    this.name = 'HermesError'
    this.status = status
    this.code = extra?.code
    this.body = extra?.body
  }
}

export function isAbortError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  return (error as { name?: string }).name === 'AbortError'
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function pathParts(path: string) {
  return path.split('/').filter(Boolean)
}

function rpcError(error: unknown, fallback = 'Hermes RPC 失败') {
  if (error instanceof HermesError) return error
  const message = error instanceof Error ? error.message : String(error || fallback)
  return new HermesError(message, 502)
}

export function useHermes() {
  const gateway = useGateway()
  const { session } = useSessionInfo()

  async function request<T = unknown>(
    path: string,
    options: {
      method?: string
      body?: unknown
      query?: Record<string, string | number | boolean | undefined>
      extraHeaders?: Record<string, string>
      signal?: AbortSignal
    } = {}
  ): Promise<T> {
    const method = (options.method || 'GET').toUpperCase()
    const query = options.query || {}
    const body = asRecord(options.body)
    const parts = pathParts(path.replace(/\?.*$/, ''))

    try {
      if (path === '/health' || path === '/v1/health') {
        return {
          status: 'ok',
          version: session.value.version || 'remote-gateway'
        } as T
      }

      if (path === '/health/detailed') {
        const payload = await gateway.request('setup.runtime_check').catch(() => ({}))
        return payload as T
      }

      if (path === '/v1/capabilities') {
        return {
          platform: 'remote-gateway',
          version: session.value.version || undefined,
          features: { sessions: true, jobs: true, skills: true, tools: true, models: true }
        } as T
      }

      if (path === '/v1/skills') {
        const payload = await gateway.request('skills.manage', { action: 'list' })
        return asSkillList(payload) as T
      }

      if (path === '/v1/toolsets') {
        const payload = await gateway.request<{ toolsets?: unknown[] }>('tools.list').catch(async () => {
          return await gateway.request<{ toolsets?: unknown[] }>('toolsets.list')
        })
        return (payload.toolsets || []) as T
      }

      if (path === '/v1/models' || path === '/api/model/options') {
        return await gateway.request('model.options', {
          refresh: Boolean(query.refresh)
        }) as T
      }

      if (path === '/api/jobs' && method === 'GET') {
        return await gateway.request('cron.manage', {
          action: 'list',
          include_disabled: query.include_disabled !== false
        }) as T
      }

      if (path === '/api/jobs' && method === 'POST') {
        return await gateway.request('cron.manage', {
          action: 'add',
          name: body.name,
          schedule: typeof body.schedule === 'string' ? body.schedule : JSON.stringify(body.schedule || ''),
          prompt: body.prompt,
          repeat: body.repeat,
          deliver: body.deliver,
          skills: body.skills
        }) as T
      }

      if (parts[0] === 'api' && parts[1] === 'jobs' && parts[2]) {
        const id = decodeURIComponent(parts[2])
        const action = parts[3]
        if (method === 'DELETE' || action === undefined && method === 'DELETE') {
          return await gateway.request('cron.manage', { action: 'remove', name: id }) as T
        }
        if (action === 'pause') {
          return await gateway.request('cron.manage', { action: 'pause', name: id }) as T
        }
        if (action === 'resume') {
          return await gateway.request('cron.manage', { action: 'resume', name: id }) as T
        }
        if (action === 'run') {
          return await gateway.request('cron.manage', { action: 'run', name: id }) as T
        }
        if (method === 'PATCH') {
          await gateway.request('cron.manage', { action: 'remove', name: id })
          return await gateway.request('cron.manage', {
            action: 'add',
            name: body.name || id,
            schedule: typeof body.schedule === 'string' ? body.schedule : JSON.stringify(body.schedule || ''),
            prompt: body.prompt,
            repeat: body.repeat,
            deliver: body.deliver,
            skills: body.skills
          }) as T
        }
        if (method === 'GET') {
          const listed = await gateway.request<{ jobs?: unknown[] }>('cron.manage', {
            action: 'list',
            include_disabled: true
          })
          const job = (listed.jobs || []).find((item) => {
            const rec = asRecord(item)
            return rec.id === id || rec.name === id
          })
          if (!job) throw new HermesError('找不到这个定时任务', 404)
          return { job } as T
        }
      }

      if (path.startsWith('/api/cron/jobs/') && path.endsWith('/runs')) {
        const listed = await gateway.request<{ sessions?: Array<{ id?: string, source?: string, title?: string, started_at?: number, preview?: string }> }>('session.list', {
          limit: 200,
          include_hidden: true
        })
        const id = decodeURIComponent(parts[3] || '')
        const prefix = `cron_${id}_`
        return {
          runs: (listed.sessions || []).filter(item => item.source === 'cron' && String(item.id || '').startsWith(prefix))
        } as T
      }

      if (parts[0] === 'api' && parts[1] === 'sessions' && !parts[2] && method === 'GET') {
        const listed = await gateway.request<{ sessions?: unknown[] }>('session.list', {
          limit: Number(query.limit || 200),
          include_hidden: Boolean(query.include_hidden),
          title: query.title
        })
        let rows = listed.sessions || []
        if (query.source) {
          rows = rows.filter(item => asRecord(item).source === query.source)
        }
        const offset = Number(query.offset || 0)
        const limit = Number(query.limit || rows.length)
        return {
          data: rows.slice(offset, offset + limit),
          has_more: offset + limit < rows.length
        } as T
      }

      if (parts[0] === 'api' && parts[1] === 'sessions' && parts[2] && parts[3] === 'messages') {
        const id = decodeURIComponent(parts[2])
        const resumed = await gateway.request<{ session_id?: string, messages?: unknown[] }>('session.resume', {
          session_id: id
        })
        const history = resumed.messages?.length
          ? resumed
          : await gateway.request<{ messages?: unknown[] }>('session.history', {
            session_id: resumed.session_id || id
          })
        const messages = (history.messages || []).map((item, index) => {
          const rec = asRecord(item)
          return {
            id: rec.row_id || index,
            role: rec.role,
            content: rec.text || rec.content || rec.context || '',
            timestamp: rec.timestamp,
            tool_name: rec.name
          }
        })
        return { data: messages } as T
      }

      throw new HermesError(`远程网关没有对应接口：${path}`, 404)
    } catch (error) {
      if (options.signal?.aborted) {
        const abort = new Error('Aborted')
        abort.name = 'AbortError'
        throw abort
      }
      throw rpcError(error)
    }
  }

  async function stream() {
    throw new HermesError('聊天请走远程网关 WebSocket 事件', 405)
  }

  return { request, stream }
}
