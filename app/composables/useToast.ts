export interface ToastInput {
  title: string
  description?: string
  color?: 'success' | 'error' | 'neutral' | 'warning'
  icon?: string
}

export interface ToastItem extends ToastInput {
  id: number
}

let seq = 0

export function useToast() {
  const toasts = useState<ToastItem[]>('app-toasts', () => [])

  function add(input: ToastInput) {
    const id = Date.now() + (++seq)
    toasts.value = [...toasts.value, { id, ...input }]
    setTimeout(() => {
      toasts.value = toasts.value.filter(item => item.id !== id)
    }, 2200)
  }

  function remove(id: number) {
    toasts.value = toasts.value.filter(item => item.id !== id)
  }

  return { toasts, add, remove }
}
