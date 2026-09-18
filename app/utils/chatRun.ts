import type { ChatStopKind } from '~/types/hermes'

export function chatUid(prefix = 'msg') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function stopKindLabel(kind?: ChatStopKind | '') {
  if (kind === 'stopping') return '正在停止'
  if (kind === 'user_stop') return '已停止'
  if (kind === 'cancelled') return '已取消'
  if (kind === 'interrupted') return '已中断'
  if (kind === 'disconnected') return '连接已断开'
  return ''
}

export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}
