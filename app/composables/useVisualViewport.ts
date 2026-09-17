const KEYBOARD_MIN = 120
const SAFARI_STABLE_MS = 90

const inset = ref(0)

let lastKeyboard = 0
let focused = false
let sawNativeThisFocus = false
let subscribers = 0
let bound = false
let safari = false
let blurTimer = 0
let stableTimer = 0

const SKIP_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'radio',
  'file',
  'submit',
  'reset',
  'range',
  'color',
  'hidden',
  'image'
])

function isIOSSafari() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iP(hone|ad|od)/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (!iOS) return false
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
}

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement) return true
  if (!(target instanceof HTMLInputElement)) return false
  return !SKIP_INPUT_TYPES.has((target.type || 'text').toLowerCase())
}

function capKeyboard(value: number) {
  const max = Math.round(window.innerHeight * 0.5)
  return Math.max(0, Math.min(value, max))
}

function rememberKeyboard(value: number) {
  if (value >= KEYBOARD_MIN) lastKeyboard = capKeyboard(value)
}

function measure() {
  const viewport = window.visualViewport
  if (!viewport) return { live: 0, shrink: 0, pan: 0 }
  const layout = window.innerHeight
  return {
    live: Math.max(0, Math.round(layout - viewport.height - viewport.offsetTop)),
    shrink: Math.max(0, Math.round(layout - viewport.height)),
    pan: Math.max(0, Math.round(viewport.offsetTop))
  }
}

function rememberFromMeasure() {
  const { live, shrink, pan } = measure()
  if (live >= KEYBOARD_MIN) rememberKeyboard(live)
  else if (pan >= KEYBOARD_MIN) rememberKeyboard(pan)
  else if (shrink >= KEYBOARD_MIN) rememberKeyboard(shrink)
  if (pan >= KEYBOARD_MIN || live >= KEYBOARD_MIN) sawNativeThisFocus = true
  return { live, shrink, pan }
}

function applyChrome() {
  inset.value = measure().live
}

function commitSafari() {
  if (!focused) {
    inset.value = 0
    return
  }
  const { live, pan } = rememberFromMeasure()
  if (pan >= KEYBOARD_MIN) {
    inset.value = 0
    return
  }
  if (live >= KEYBOARD_MIN) {
    inset.value = live
    return
  }
  if (!sawNativeThisFocus && lastKeyboard >= KEYBOARD_MIN) {
    inset.value = lastKeyboard
    return
  }
  inset.value = 0
}

function scheduleSafariCommit() {
  window.clearTimeout(stableTimer)
  stableTimer = window.setTimeout(commitSafari, SAFARI_STABLE_MS)
}

function applySafari() {
  const { pan } = rememberFromMeasure()
  // Safari's own pan already placed the field. Drop our inset immediately
  // so a mid-animation live value cannot stack on top of it.
  if (pan >= KEYBOARD_MIN) inset.value = 0
  scheduleSafariCommit()
}

function apply() {
  if (!import.meta.client) return
  if (safari) applySafari()
  else applyChrome()
}

function sync() {
  apply()
}

function onFocusIn(event: FocusEvent) {
  if (!safari || !isEditable(event.target)) return
  focused = true
  sawNativeThisFocus = false
  window.clearTimeout(blurTimer)
  inset.value = 0
  scheduleSafariCommit()
}

function onFocusOut() {
  if (!safari) return
  window.clearTimeout(blurTimer)
  blurTimer = window.setTimeout(() => {
    if (isEditable(document.activeElement)) {
      focused = true
      return
    }
    focused = false
    sawNativeThisFocus = false
    window.clearTimeout(stableTimer)
    inset.value = 0
  }, 320)
}

function onOrientationChange() {
  lastKeyboard = 0
  sawNativeThisFocus = false
  apply()
}

function bind() {
  if (bound) return
  bound = true
  safari = isIOSSafari()
  const viewport = window.visualViewport
  viewport?.addEventListener('resize', apply)
  viewport?.addEventListener('scroll', apply)
  window.addEventListener('orientationchange', onOrientationChange)
  window.addEventListener('resize', apply)
  if (safari) {
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
  }
  apply()
}

function unbind() {
  if (!bound) return
  bound = false
  const viewport = window.visualViewport
  viewport?.removeEventListener('resize', apply)
  viewport?.removeEventListener('scroll', apply)
  window.removeEventListener('orientationchange', onOrientationChange)
  window.removeEventListener('resize', apply)
  document.removeEventListener('focusin', onFocusIn)
  document.removeEventListener('focusout', onFocusOut)
  window.clearTimeout(blurTimer)
  window.clearTimeout(stableTimer)
  focused = false
  safari = false
}

export function useVisualViewport() {
  onMounted(() => {
    subscribers += 1
    bind()
  })

  onBeforeUnmount(() => {
    subscribers -= 1
    if (subscribers <= 0) {
      subscribers = 0
      unbind()
    }
  })

  return { inset, sync }
}
