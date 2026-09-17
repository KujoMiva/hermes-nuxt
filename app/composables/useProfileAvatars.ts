const STORAGE_KEY = 'hermes-profile-avatars'

function storageKey(id: string) {
  return id.trim() || 'default'
}

function readStore(): Record<string, string> {
  if (!import.meta.client) return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, value]) => typeof value === 'string' && value.startsWith('data:image/'))
    ) as Record<string, string>
  } catch {
    return {}
  }
}

function writeStore(map: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

function omit(map: Record<string, string>, key: string) {
  return Object.fromEntries(Object.entries(map).filter(([id]) => id !== key))
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法读取图片'))
    image.src = src
  })
}

async function toSquareDataUrl(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
  const blobUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(blobUrl)
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法处理图片')
    const scale = Math.max(size / image.width, size / image.height)
    const width = image.width * scale
    const height = image.height * scale
    ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
    return canvas.toDataURL('image/jpeg', 0.86)
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

export function useProfileAvatars() {
  const map = useState<Record<string, string>>('hermes-profile-avatars', () => readStore())

  onMounted(() => {
    const stored = readStore()
    if (Object.keys(stored).length) map.value = { ...stored, ...map.value }
  })

  function url(id: string) {
    return map.value[storageKey(id)] || ''
  }

  async function setFromFile(id: string, file: File) {
    await setDataUrl(id, await toSquareDataUrl(file))
  }

  async function setDataUrl(id: string, dataUrl: string) {
    const next = { ...map.value, [storageKey(id)]: dataUrl }
    try {
      writeStore(next)
    } catch {
      throw new Error('头像太大，换一张小一点的图片')
    }
    map.value = next
  }

  function rename(fromId: string, toId: string) {
    const from = storageKey(fromId)
    const to = storageKey(toId)
    if (from === to || !map.value[from]) return
    const next = omit({ ...map.value, [to]: map.value[from] }, from)
    writeStore(next)
    map.value = next
  }

  function remove(id: string) {
    if (!map.value[storageKey(id)]) return
    const next = omit(map.value, storageKey(id))
    writeStore(next)
    map.value = next
  }

  return { map, url, setFromFile, setDataUrl, rename, remove }
}
