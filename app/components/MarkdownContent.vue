<script setup lang="ts">
/* eslint-disable vue/no-v-html */
const props = defineProps<{
  source?: string
  live?: boolean
}>()

const root = ref<HTMLElement | null>(null)
const html = ref('')
let parsedSource: string | undefined
let hydrateToken = 0
let frame = 0
let qrObserver: ResizeObserver | null = null

function fitQrBlocks() {
  if (props.live) return
  const el = root.value
  if (!el) return
  for (const wrap of el.querySelectorAll<HTMLElement>('.md-pre--qr')) {
    const pre = wrap.querySelector('pre')
    if (!pre) continue
    pre.style.transform = ''
    wrap.style.height = ''
    const avail = wrap.clientWidth
    const need = pre.scrollWidth
    if (!avail || !need) continue
    const scale = Math.min(1, avail / need)
    pre.style.transformOrigin = 'top left'
    pre.style.transform = `scale(${scale})`
    wrap.style.height = `${Math.ceil(pre.scrollHeight * scale)}px`
  }
}

async function hydrateTitles() {
  if (props.live) return
  const token = ++hydrateToken
  await nextTick()
  const el = root.value
  if (!el || token !== hydrateToken) return
  fitQrBlocks()
  const links = [...el.querySelectorAll<HTMLAnchorElement>('a[data-md-title]')]
  await Promise.all(links.map(async (anchor) => {
    const url = anchor.getAttribute('data-md-title') || ''
    if (!url) return
    const title = await fetchLinkTitle(url)
    if (!title || token !== hydrateToken || !anchor.isConnected) return
    anchor.textContent = title
    anchor.removeAttribute('data-md-title')
  }))
}

function paint(source: string) {
  if (parsedSource === source) return
  parsedSource = source
  html.value = renderMarkdown(source)
}

function cancelFrame() {
  if (!frame) return
  cancelAnimationFrame(frame)
  frame = 0
}

function paintSoon(source: string) {
  if (!import.meta.client || typeof requestAnimationFrame !== 'function') {
    paint(source)
    return
  }
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    paint(props.source || '')
  })
}

function paintNow(source: string) {
  cancelFrame()
  paint(source)
}

watch(() => [props.source || '', Boolean(props.live)] as const, ([source, live], previous) => {
  if (live) {
    if (!previous) paintNow(source)
    else paintSoon(source)
    return
  }
  paintNow(source)
  void hydrateTitles()
}, { immediate: true })

onMounted(() => {
  if (!root.value || typeof ResizeObserver === 'undefined') return
  qrObserver = new ResizeObserver(() => fitQrBlocks())
  qrObserver.observe(root.value)
})

onBeforeUnmount(() => {
  cancelFrame()
  qrObserver?.disconnect()
  qrObserver = null
})
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div
    ref="root"
    class="prose-chat"
    v-html="html"
  />
</template>
