import { createHash } from 'node:crypto'
import http from 'node:http'

const PORT = Number(process.env.MOCK_GATEWAY_PORT || 19119)
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...extraHeaders
  })
  res.end(payload)
}

function encodeTextFrame(text) {
  const payload = Buffer.from(text)
  let header

  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length])
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 126
    header.writeUInt16BE(payload.length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x81
    header[1] = 127
    header.writeBigUInt64BE(BigInt(payload.length), 2)
  }

  return Buffer.concat([header, payload])
}

function decodeFrames(buffer) {
  const messages = []
  let offset = 0

  while (offset + 2 <= buffer.length) {
    const second = buffer[offset + 1]
    const masked = Boolean(second & 0x80)
    let length = second & 0x7f
    let cursor = offset + 2

    if (length === 126) {
      if (cursor + 2 > buffer.length) break
      length = buffer.readUInt16BE(cursor)
      cursor += 2
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break
      length = Number(buffer.readBigUInt64BE(cursor))
      cursor += 8
    }

    const mask = masked ? buffer.subarray(cursor, cursor + 4) : null
    if (masked) cursor += 4
    if (cursor + length > buffer.length) break

    const payload = Buffer.from(buffer.subarray(cursor, cursor + length))
    if (mask) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4]
    }

    messages.push(payload.toString('utf8'))
    offset = cursor + length
  }

  return { messages, rest: buffer.subarray(offset) }
}

function readBody(req) {
  return new Promise(resolve => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

let seq = 1
const now = () => Math.floor(Date.now() / 1000)
const uid = (prefix) => `${prefix}-${seq++}`

const store = {
  profiles: [
    { name: 'default', display_name: 'Default', is_default: true, path: '~/.hermes' },
    { name: 'work', display_name: 'Work', is_default: false, path: '~/.hermes/profiles/work' }
  ],
  jobs: [
    {
      id: 'job-brief',
      name: '每日简报',
      prompt: '汇总今天的待办。',
      schedule: 'every 1d',
      schedule_display: 'every 1d',
      enabled: true,
      paused: false,
      deliver: 'local',
      skills: ['summarize'],
      next_run_at: now() + 3600
    }
  ],
  sessions: [],
  live: new Map(),
  model: {
    provider: 'mock',
    model: 'mock-chat',
    reasoning: 'medium',
    fast: false,
    keys: {},
    endpoints: [],
    aux: {}
  }
}

const AUX_TASKS = [
  'vision', 'compression', 'skills_hub', 'approval', 'mcp', 'title_generation',
  'review', 'triage_specifier', 'kanban_decomposer', 'profile_describer', 'curator'
]

function mockProviders(includeUnconfigured = false) {
  const rows = [{
    slug: 'mock',
    name: 'Mock',
    authenticated: true,
    is_current: store.model.provider === 'mock',
    auth_type: 'api_key',
    key_env: 'MOCK_API_KEY',
    models: [
      { id: 'mock-chat', name: 'Mock Chat' },
      { id: 'mock-fast', name: 'Mock Fast' }
    ],
    capabilities: {
      'mock-chat': { fast: false, reasoning: true },
      'mock-fast': { fast: true, reasoning: true }
    }
  }]
  if (store.model.keys.OPENAI_API_KEY) {
    rows.push({
      slug: 'openai-api',
      name: 'OpenAI',
      authenticated: true,
      is_current: store.model.provider === 'openai-api',
      auth_type: 'api_key',
      key_env: 'OPENAI_API_KEY',
      models: [{ id: 'gpt-4.1', name: 'gpt-4.1' }],
      capabilities: { 'gpt-4.1': { fast: false, reasoning: true } }
    })
  } else if (includeUnconfigured) {
    rows.push({
      slug: 'openai-api',
      name: 'OpenAI',
      authenticated: false,
      is_current: false,
      auth_type: 'api_key',
      key_env: 'OPENAI_API_KEY',
      warning: 'paste OPENAI_API_KEY to activate',
      models: []
    })
  }
  for (const item of store.model.endpoints) {
    rows.push({
      slug: item.id.startsWith('custom:') ? item.id : `custom:${item.id}`,
      name: item.name,
      authenticated: true,
      is_user_defined: true,
      is_current: store.model.provider === item.id,
      auth_type: 'api_key',
      api_url: item.base_url,
      models: [{ id: item.model, name: item.model }]
    })
  }
  return rows
}

function mockAuxiliary() {
  return {
    main: { provider: store.model.provider, model: store.model.model },
    tasks: AUX_TASKS.map(task => ({
      task,
      provider: store.model.aux[task]?.provider || 'auto',
      model: store.model.aux[task]?.model || '',
      base_url: '',
      local_endpoint: false
    }))
  }
}

store.sessions.push({
  id: 'store-welcome',
  title: '欢迎',
  preview: '你好，这是远程网关控制台。',
  started_at: now() - 120,
  message_count: 2,
  source: 'webui',
  hidden: false,
  messages: [
    { role: 'user', text: '你好', timestamp: now() - 120, row_id: 'm1' },
    { role: 'assistant', text: '你好，这是远程网关控制台。', timestamp: now() - 118, row_id: 'm2' }
  ]
})

function sessionSummary(row) {
  return {
    id: row.id,
    title: row.title || '',
    preview: row.preview || '',
    started_at: row.started_at,
    message_count: row.message_count || 0,
    source: row.source || 'webui',
    hidden: Boolean(row.hidden)
  }
}

function findStored(id) {
  return store.sessions.find(row => row.id === id)
}

function findLive(id) {
  if (store.live.has(id)) return { runtimeId: id, row: store.live.get(id) }
  for (const [runtimeId, row] of store.live) {
    if (row.id === id) return { runtimeId, row }
  }
  return null
}

function rpcOk(send, frame, result) {
  send({ id: frame.id, jsonrpc: '2.0', result })
}

function rpcErr(send, frame, code, message) {
  send({ id: frame.id, jsonrpc: '2.0', error: { code, message } })
}

function emit(send, type, sessionId, payload = {}) {
  send({
    jsonrpc: '2.0',
    method: 'event',
    params: { type, session_id: sessionId, payload }
  })
}

function handleRpc(frame, send) {
  const method = frame.method
  const params = frame.params || {}

  if (method === 'gateway.ping') {
    rpcOk(send, frame, { ok: true })
    return
  }

  if (method === 'setup.status' || method === 'setup.runtime_check') {
    rpcOk(send, frame, { status: 'ok', version: 'mock-0', platform: 'remote-gateway' })
    return
  }

  if (method === 'config.set' || method === 'config.get') {
    const key = params.key
    if (method === 'config.get' && key === 'full') {
      rpcOk(send, frame, {
        config: {
          model: { default: store.model.model, provider: store.model.provider },
          agent: {
            reasoning_effort: store.model.reasoning,
            service_tier: store.model.fast ? 'fast' : 'normal'
          }
        }
      })
      return
    }
    if (method === 'config.get' && key === 'reasoning') {
      rpcOk(send, frame, { value: store.model.reasoning, display: 'show' })
      return
    }
    if (method === 'config.get' && key === 'fast') {
      rpcOk(send, frame, { value: store.model.fast ? 'fast' : 'normal' })
      return
    }
    if (method === 'config.set' && key === 'reasoning') {
      store.model.reasoning = String(params.value || 'medium')
    }
    if (method === 'config.set' && key === 'fast') {
      store.model.fast = String(params.value || '') === 'fast'
    }
    rpcOk(send, frame, { key: params.key, value: params.value || '' })
    return
  }

  if (method === 'model.options') {
    rpcOk(send, frame, {
      model: store.model.model,
      provider: store.model.provider,
      current_model: store.model.model,
      current_provider: store.model.provider,
      providers: mockProviders(Boolean(params.include_unconfigured))
    })
    return
  }

  if (method === 'model.save_key') {
    const slug = String(params.slug || '')
    const apiKey = String(params.api_key || '')
    if (!slug || !apiKey) {
      rpcErr(send, frame, 4001, 'slug and api_key are required')
      return
    }
    const env = slug === 'openai-api' ? 'OPENAI_API_KEY' : 'MOCK_API_KEY'
    store.model.keys[env] = apiKey
    const providers = mockProviders(true)
    rpcOk(send, frame, { provider: providers.find(item => item.slug === slug) || providers[0] })
    return
  }

  if (method === 'model.disconnect') {
    const slug = String(params.slug || '')
    if (slug === 'openai-api') delete store.model.keys.OPENAI_API_KEY
    rpcOk(send, frame, { slug, disconnected: true })
    return
  }

  if (method === 'skills.manage') {
    rpcOk(send, frame, { skills: { general: ['summarize', 'search'], coding: ['git'] } })
    return
  }

  if (method === 'toolsets.list' || method === 'tools.list') {
    rpcOk(send, frame, {
      toolsets: [{
        name: 'web',
        label: 'Web',
        description: '搜索与抓取',
        enabled: true,
        tools: method === 'tools.list' ? ['web_search', 'web_extract'] : undefined
      }, {
        name: 'terminal',
        label: '终端',
        description: '在网关本机执行命令',
        enabled: true,
        tools: method === 'tools.list' ? ['terminal'] : undefined
      }]
    })
    return
  }

  if (method === 'profiles.list') {
    rpcOk(send, frame, { profiles: store.profiles, bot_mode_protocol: true })
    return
  }

  if (method === 'profiles.create') {
    const name = String(params.name || '').trim()
    if (!name) {
      rpcErr(send, frame, 4061, 'name required')
      return
    }
    if (store.profiles.some(item => item.name === name)) {
      rpcErr(send, frame, 4062, 'profile exists')
      return
    }
    store.profiles.push({
      name,
      display_name: params.description || name,
      is_default: false,
      path: `~/.hermes/profiles/${name}`
    })
    rpcOk(send, frame, { ok: true, name })
    return
  }

  if (method === 'cron.manage') {
    const action = params.action || 'list'
    if (action === 'list') {
      rpcOk(send, frame, { jobs: store.jobs, count: store.jobs.length, success: true })
      return
    }
    if (action === 'add') {
      const job = {
        id: uid('job'),
        name: params.name || '未命名任务',
        prompt: params.prompt || '',
        schedule: params.schedule || '',
        schedule_display: params.schedule || '',
        enabled: true,
        paused: false,
        deliver: params.deliver || 'local',
        skills: params.skills || [],
        next_run_at: now() + 3600
      }
      store.jobs.push(job)
      rpcOk(send, frame, { job, success: true })
      return
    }
    const target = store.jobs.find(item => item.id === params.name || item.name === params.name)
    if (!target) {
      rpcErr(send, frame, 404, 'job not found')
      return
    }
    if (action === 'remove') {
      store.jobs = store.jobs.filter(item => item !== target)
      rpcOk(send, frame, { success: true })
      return
    }
    if (action === 'pause') {
      target.enabled = false
      target.paused = true
      rpcOk(send, frame, { success: true, job: target })
      return
    }
    if (action === 'resume') {
      target.enabled = true
      target.paused = false
      rpcOk(send, frame, { success: true, job: target })
      return
    }
    rpcErr(send, frame, 4016, `unknown cron action: ${action}`)
    return
  }

  if (method === 'session.create') {
    const runtimeId = uid('sess')
    const storedId = uid('store')
    const row = {
      id: storedId,
      title: params.title || '',
      preview: '',
      started_at: now(),
      message_count: 0,
      source: params.source || 'webui',
      hidden: false,
      messages: [],
      draft: true
    }
    store.live.set(runtimeId, row)
    rpcOk(send, frame, {
      session_id: runtimeId,
      stored_session_id: storedId,
      info: { model: 'mock-chat', provider: 'mock' }
    })
    return
  }

  if (method === 'session.list') {
    const includeHidden = Boolean(params.include_hidden)
    const rows = store.sessions
      .filter(row => includeHidden || !row.hidden)
      .map(sessionSummary)
    rpcOk(send, frame, { sessions: rows })
    return
  }

  if (method === 'session.resume') {
    const stored = findStored(params.session_id) || findLive(params.session_id)?.row
    if (!stored) {
      rpcErr(send, frame, 4001, 'session not found')
      return
    }
    const existing = findLive(stored.id)
    const runtimeId = existing?.runtimeId || uid('sess')
    store.live.set(runtimeId, stored)
    rpcOk(send, frame, {
      session_id: runtimeId,
      session_key: stored.id,
      messages: stored.messages,
      running: false,
      info: { model: 'mock-chat', provider: 'mock' }
    })
    return
  }

  if (method === 'session.history') {
    const live = findLive(params.session_id)
    const stored = live?.row || findStored(params.session_id)
    rpcOk(send, frame, { messages: stored?.messages || [] })
    return
  }

  if (method === 'session.title') {
    const live = findLive(params.session_id)
    if (!live) {
      rpcErr(send, frame, 4001, 'session not found')
      return
    }
    live.row.title = String(params.title || live.row.title || '')
    rpcOk(send, frame, { title: live.row.title, session_key: live.row.id })
    emit(send, 'session.title', live.runtimeId, { session_id: live.row.id, title: live.row.title })
    return
  }

  if (method === 'session.set_hidden') {
    const stored = findStored(params.session_id) || findLive(params.session_id)?.row
    if (!stored) {
      rpcErr(send, frame, 4001, 'session not found')
      return
    }
    stored.hidden = Boolean(params.hidden)
    rpcOk(send, frame, { hidden: stored.hidden, session_key: stored.id })
    return
  }

  if (method === 'session.delete') {
    store.sessions = store.sessions.filter(row => row.id !== params.session_id)
    for (const [runtimeId, row] of store.live) {
      if (row.id === params.session_id) store.live.delete(runtimeId)
    }
    rpcOk(send, frame, { deleted: params.session_id })
    return
  }

  if (method === 'session.close') {
    store.live.delete(params.session_id)
    rpcOk(send, frame, { closed: true })
    return
  }

  if (method === 'session.branch') {
    const live = findLive(params.session_id)
    if (!live) {
      rpcErr(send, frame, 4001, 'session not found')
      return
    }
    if (!live.row.messages?.length) {
      rpcErr(send, frame, 4008, 'nothing to branch — send a message first')
      return
    }
    const runtimeId = uid('sess')
    const storedId = uid('store')
    const child = {
      id: storedId,
      title: `${live.row.title || '会话'} 分支`,
      preview: live.row.preview,
      started_at: now(),
      message_count: live.row.messages.length,
      source: 'webui',
      hidden: false,
      messages: [...live.row.messages]
    }
    store.sessions.unshift(child)
    store.live.set(runtimeId, child)
    rpcOk(send, frame, {
      session_id: runtimeId,
      stored_session_id: storedId,
      title: child.title,
      parent: live.row.id,
      messages: child.messages
    })
    return
  }

  if (method === 'session.interrupt' || method === 'session.steer' || method === 'approval.respond') {
    rpcOk(send, frame, { ok: true })
    return
  }

  if (method === 'image.attach_bytes') {
    rpcOk(send, frame, { attached: true, filename: params.filename || 'image.png' })
    return
  }

  if (method === 'prompt.submit') {
    const live = findLive(params.session_id)
    if (!live) {
      rpcErr(send, frame, 4001, 'session not found')
      return
    }
    const text = String(params.text || '')
    const reasoning = '先看一下项目里的配置文件，确认当前网关地址和模型入口。'
    const reply = `你好，这是远程网关回声：${text}`
    live.row.messages.push({ role: 'user', text, timestamp: now(), row_id: uid('m') })
    live.row.messages.push({
      role: 'assistant',
      text: reply,
      reasoning,
      timestamp: now(),
      row_id: uid('m')
    })
    live.row.messages.push({
      role: 'tool',
      name: 'read_file',
      context: 'nuxt.config.ts',
      args: { path: 'nuxt.config.ts' },
      timestamp: now(),
      row_id: uid('m')
    })
    live.row.messages.push({
      role: 'tool',
      name: 'search_files',
      context: 'useChat',
      args: { query: 'useChat' },
      timestamp: now(),
      row_id: uid('m')
    })
    live.row.messages.push({
      role: 'tool',
      name: 'terminal',
      context: 'pnpm typecheck',
      args: { command: 'pnpm typecheck' },
      timestamp: now(),
      row_id: uid('m')
    })
    live.row.messages.push({
      role: 'tool',
      name: 'write_file',
      context: 'app/components/ThinkingDisclosure.vue',
      args: { path: 'app/components/ThinkingDisclosure.vue' },
      timestamp: now(),
      row_id: uid('m')
    })
    live.row.preview = reply
    live.row.message_count = live.row.messages.length
    live.row.title = live.row.title || text.slice(0, 24) || '新对话'
    live.row.draft = false
    if (!store.sessions.includes(live.row)) store.sessions.unshift(live.row)
    rpcOk(send, frame, { status: 'streaming' })

    const sid = live.runtimeId
    const readId = uid('tool')
    const searchId = uid('tool')
    const termId = uid('tool')
    const writeId = uid('tool')
    emit(send, 'message.start', sid)
    const steps = [
      { wait: 80, type: 'reasoning.delta', payload: { text: '先看一下项目里的配置文件，' } },
      { wait: 160, type: 'reasoning.delta', payload: { text: '确认当前网关地址和模型入口。' } },
      {
        wait: 220,
        type: 'tool.start',
        payload: { tool_id: readId, name: 'read_file', context: 'nuxt.config.ts', args: { path: 'nuxt.config.ts' } }
      },
      {
        wait: 520,
        type: 'tool.complete',
        payload: { tool_id: readId, name: 'read_file', summary: '读完配置', duration_s: 0.5, result: { ok: true } }
      },
      {
        wait: 180,
        type: 'tool.start',
        payload: { tool_id: searchId, name: 'search_files', context: 'useChat', args: { query: 'useChat' } }
      },
      {
        wait: 420,
        type: 'tool.complete',
        payload: { tool_id: searchId, name: 'search_files', summary: '3 处匹配', duration_s: 0.4, result: { ok: true } }
      },
      {
        wait: 160,
        type: 'tool.start',
        payload: { tool_id: termId, name: 'terminal', context: 'pnpm typecheck', args: { command: 'pnpm typecheck' } }
      },
      {
        wait: 700,
        type: 'tool.complete',
        payload: { tool_id: termId, name: 'terminal', summary: '检查通过', duration_s: 0.7, result: { ok: true } }
      },
      {
        wait: 180,
        type: 'tool.start',
        payload: {
          tool_id: writeId,
          name: 'write_file',
          context: 'app/components/ThinkingDisclosure.vue',
          args: { path: 'app/components/ThinkingDisclosure.vue' }
        }
      },
      {
        wait: 640,
        type: 'tool.complete',
        payload: {
          tool_id: writeId,
          name: 'write_file',
          summary: '已写入',
          duration_s: 0.6,
          result: { ok: true }
        }
      },
      { wait: 200, type: 'session.title', payload: { session_id: live.row.id, title: live.row.title } },
      { wait: 80, type: 'message.delta', payload: { text: '你好，这是远程网关回声：' } },
      { wait: 120, type: 'message.delta', payload: { text } },
      { wait: 160, type: 'message.complete', payload: { status: 'ok', text: reply } }
    ]
    let delay = 0
    for (const step of steps) {
      delay += step.wait
      setTimeout(() => emit(send, step.type, sid, step.payload), delay)
    }
    return
  }

  rpcErr(send, frame, 4002, `unknown method: ${method}`)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')

  if (url.pathname === '/api/status') {
    sendJson(res, 200, {
      auth_flows: ['native_pkce'],
      auth_providers: ['basic'],
      auth_required: true,
      version: 'mock-0'
    })
    return
  }

  if (url.pathname === '/api/auth/providers') {
    sendJson(res, 200, {
      providers: [{ display_name: 'Password', name: 'basic', supports_password: true }]
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/auth/password-login') {
    const body = JSON.parse((await readBody(req)) || '{}')
    if (body.username === 'admin' && body.password === 'secret') {
      sendJson(res, 200, { next: '/', ok: true }, {
        'set-cookie': 'hermes_session_at=mock-at; Path=/; HttpOnly'
      })
      return
    }
    sendJson(res, 401, { detail: 'Invalid credentials' })
    return
  }

  if (url.pathname === '/api/auth/me') {
    if (!String(req.headers.cookie || '').includes('hermes_session_at=mock-at')) {
      sendJson(res, 401, { detail: 'Unauthorized' })
      return
    }
    sendJson(res, 200, { display_name: 'Admin', provider: 'basic', user_id: '1' })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/ws-ticket') {
    sendJson(res, 200, { ticket: 'mock-ticket', ttl_seconds: 30 })
    return
  }

  const authorized = String(req.headers.cookie || '').includes('hermes_session_at=mock-at')
    || String(req.headers['x-hermes-session-token'] || '')
    || String(req.headers.authorization || '').startsWith('Bearer ')

  if (url.pathname.startsWith('/api/model') || url.pathname.startsWith('/api/config')
    || url.pathname.startsWith('/api/env') || url.pathname.startsWith('/api/providers/')) {
    if (!authorized) {
      sendJson(res, 401, { detail: 'Unauthorized' })
      return
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/model/info') {
    sendJson(res, 200, {
      model: store.model.model,
      provider: store.model.provider,
      auto_context_length: 128000,
      config_context_length: 0,
      effective_context_length: 128000,
      capabilities: { supports_reasoning: true }
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/model/options') {
    sendJson(res, 200, {
      model: store.model.model,
      provider: store.model.provider,
      current_model: store.model.model,
      current_provider: store.model.provider,
      providers: mockProviders(url.searchParams.get('include_unconfigured') === '1')
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/model/recommended-default') {
    const provider = url.searchParams.get('provider') || store.model.provider
    const row = mockProviders(true).find(item => item.slug === provider)
    sendJson(res, 200, { provider, model: row?.models?.[0]?.id || '', free_tier: null })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/model/auxiliary') {
    sendJson(res, 200, mockAuxiliary())
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/model/set') {
    const body = JSON.parse((await readBody(req)) || '{}')
    const scope = String(body.scope || '')
    const provider = String(body.provider || '')
    const model = String(body.model || '')
    if (model.includes('opus') && !body.confirm_expensive_model) {
      sendJson(res, 200, {
        ok: false,
        confirm_required: true,
        confirm_message: 'This model is expensive. Confirm to continue.',
        provider,
        model,
        scope
      })
      return
    }
    if (scope === 'main') {
      store.model.provider = provider
      store.model.model = model
      sendJson(res, 200, { ok: true, scope, provider, model, stale_aux: [] })
      return
    }
    if (scope === 'auxiliary') {
      const task = String(body.task || '')
      if (task === '__reset__') {
        store.model.aux = {}
        sendJson(res, 200, { ok: true, scope, reset: true })
        return
      }
      if (task) store.model.aux[task] = { provider, model }
      sendJson(res, 200, { ok: true, scope, provider, model, task })
      return
    }
    sendJson(res, 400, { detail: "scope must be 'main' or 'auxiliary'" })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/config') {
    sendJson(res, 200, {
      model: { default: store.model.model, provider: store.model.provider },
      agent: {
        reasoning_effort: store.model.reasoning,
        service_tier: store.model.fast ? 'fast' : 'normal'
      }
    })
    return
  }

  if (req.method === 'PUT' && url.pathname === '/api/config') {
    const body = JSON.parse((await readBody(req)) || '{}')
    const agent = body.config?.agent || {}
    if (agent.reasoning_effort != null) store.model.reasoning = String(agent.reasoning_effort)
    if (agent.service_tier != null) store.model.fast = ['fast', 'priority', 'on'].includes(String(agent.service_tier))
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'PUT' && url.pathname === '/api/env') {
    const body = JSON.parse((await readBody(req)) || '{}')
    if (body.key) store.model.keys[body.key] = body.value || ''
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/providers/custom-endpoints') {
    sendJson(res, 200, {
      endpoints: store.model.endpoints,
      current: { provider: store.model.provider, model: store.model.model, base_url: '' }
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/providers/custom-endpoints/validate') {
    const body = JSON.parse((await readBody(req)) || '{}')
    sendJson(res, 200, {
      ok: Boolean(body.base_url),
      reachable: Boolean(body.base_url),
      message: body.base_url ? 'Mock endpoint accepted' : 'Enter an endpoint URL first.',
      models: body.model ? [body.model] : ['llama3.2']
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/providers/custom-endpoints') {
    const body = JSON.parse((await readBody(req)) || '{}')
    const id = String(body.id || body.name || `ep-${seq++}`)
    const row = {
      id,
      name: String(body.name || id),
      base_url: String(body.base_url || ''),
      model: String(body.model || ''),
      models: body.model ? [body.model] : [],
      context_length: body.context_length || null,
      discover_models: body.discover_models !== false,
      has_api_key: Boolean(body.api_key),
      is_current: Boolean(body.make_default)
    }
    store.model.endpoints = store.model.endpoints.filter(item => item.id !== id)
    store.model.endpoints.push(row)
    if (body.make_default) {
      store.model.provider = id
      store.model.model = row.model
    }
    sendJson(res, 200, { ok: true, id, endpoints: store.model.endpoints, current: { provider: store.model.provider, model: store.model.model, base_url: row.base_url } })
    return
  }

  const activateMatch = url.pathname.match(/^\/api\/providers\/custom-endpoints\/([^/]+)\/activate$/)
  if (req.method === 'POST' && activateMatch) {
    const id = decodeURIComponent(activateMatch[1])
    const row = store.model.endpoints.find(item => item.id === id)
    if (!row) {
      sendJson(res, 404, { detail: 'custom endpoint not found' })
      return
    }
    store.model.endpoints.forEach(item => { item.is_current = item.id === id })
    store.model.provider = id
    store.model.model = row.model
    sendJson(res, 200, { ok: true, provider: id, model: row.model })
    return
  }

  const deleteMatch = url.pathname.match(/^\/api\/providers\/custom-endpoints\/([^/]+)$/)
  if (req.method === 'DELETE' && deleteMatch) {
    const id = decodeURIComponent(deleteMatch[1])
    store.model.endpoints = store.model.endpoints.filter(item => item.id !== id)
    sendJson(res, 200, { ok: true, endpoints: store.model.endpoints })
    return
  }

  sendJson(res, 404, { detail: 'No such API endpoint' })
})

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  if (url.pathname !== '/api/ws' || url.searchParams.get('ticket') !== 'mock-ticket') {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }

  const key = req.headers['sec-websocket-key']
  if (!key || typeof key !== 'string') {
    socket.destroy()
    return
  }

  const accept = createHash('sha1').update(key + GUID).digest('base64')
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  )

  const send = payload => socket.write(encodeTextFrame(JSON.stringify(payload)))
  send({
    jsonrpc: '2.0',
    method: 'event',
    params: { payload: { heartbeat: true }, type: 'gateway.ready' }
  })

  let rest = Buffer.alloc(0)
  socket.on('data', chunk => {
    rest = Buffer.concat([rest, chunk])
    const decoded = decodeFrames(rest)
    rest = decoded.rest
    for (const raw of decoded.messages) {
      let frame
      try {
        frame = JSON.parse(raw)
      } catch {
        continue
      }
      handleRpc(frame, send)
    }
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock gateway http://127.0.0.1:${PORT}`)
})
