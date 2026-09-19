<script setup lang="ts">
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  disabled?: boolean
  items: Array<{ label: string, value: string }>
  modelValue?: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const attrs = useAttrs()
const open = ref(false)
const activeIndex = ref(0)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})
const menuId = useId()

const isDisabled = computed(() => {
  const attr = attrs.disabled
  return Boolean(props.disabled || attr === '' || attr === true || attr === 'disabled')
})

const selected = computed(() => props.items.find(item => item.value === props.modelValue))
const selectedLabel = computed(() => selected.value?.label || props.placeholder || props.modelValue || '')
const fieldName = computed(() => attrs.name == null ? '' : String(attrs.name))

const rootAttrs = computed(() => {
  const next: Record<string, unknown> = {}
  if (attrs.class) next.class = attrs.class
  if (attrs.style) next.style = attrs.style
  return next
})

const buttonAttrs = computed(() => {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class' || key === 'style' || key === 'name' || key === 'disabled') continue
    next[key] = value
  }
  return next
})

const activeOptionId = computed(() => {
  const item = props.items[activeIndex.value]
  return item ? optionId(item.value) : undefined
})

function optionId(value: string) {
  return `${menuId}-${encodeURIComponent(value)}`
}

function close() {
  open.value = false
}

async function openMenu() {
  if (isDisabled.value || open.value) return
  const index = props.items.findIndex(item => item.value === props.modelValue)
  activeIndex.value = index >= 0 ? index : 0
  positionMenu()
  open.value = true
  await nextTick()
  positionMenu()
  scrollActive()
}

function toggle() {
  if (isDisabled.value) return
  if (open.value) close()
  else void openMenu()
}

function choose(value: string) {
  emit('update:modelValue', value)
  close()
  trigger.value?.focus()
}

function positionMenu() {
  const el = trigger.value
  if (!el) return

  const rect = el.getBoundingClientRect()
  const gutter = 8
  const maxH = 16 * 16
  const spaceBelow = window.innerHeight - rect.bottom - gutter
  const spaceAbove = rect.top - gutter
  const openUp = spaceBelow < 10.5 * 16 && spaceAbove > spaceBelow
  const available = Math.max(7.5 * 16, openUp ? spaceAbove : spaceBelow)
  const maxW = Math.min(22 * 16, window.innerWidth - gutter * 2)
  const place = (width: number) => {
    let left = rect.left
    if (left + width > window.innerWidth - gutter) {
      left = Math.max(gutter, window.innerWidth - gutter - width)
    }
    if (left < gutter) left = gutter
    return {
      position: 'fixed',
      left: `${left}px`,
      minWidth: `${rect.width}px`,
      maxWidth: `${maxW}px`,
      maxHeight: `${Math.min(maxH, available)}px`,
      zIndex: '100',
      ...(openUp
        ? { bottom: `${window.innerHeight - rect.top + 6}px`, top: 'auto' }
        : { top: `${rect.bottom + 6}px`, bottom: 'auto' })
    }
  }

  if (!menu.value) {
    menuStyle.value = { ...place(rect.width), width: 'max-content' }
    return
  }

  const previousWidth = menu.value.style.width
  menu.value.style.width = 'max-content'
  const width = Math.min(maxW, Math.max(rect.width, Math.ceil(menu.value.scrollWidth)))
  menu.value.style.width = previousWidth

  menuStyle.value = { ...place(width), width: `${width}px` }
}

function scrollActive() {
  const option = menu.value?.querySelector<HTMLElement>('[data-active="true"]')
  if (!option || !menu.value) return
  const menuRect = menu.value.getBoundingClientRect()
  const optionRect = option.getBoundingClientRect()
  if (optionRect.top < menuRect.top) {
    menu.value.scrollTop -= menuRect.top - optionRect.top
  } else if (optionRect.bottom > menuRect.bottom) {
    menu.value.scrollTop += optionRect.bottom - menuRect.bottom
  }
}

function onTriggerKey(event: KeyboardEvent) {
  if (isDisabled.value) return

  const count = props.items.length
  if (!open.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void openMenu()
    }
    return
  }

  if (event.key === 'Escape' || event.key === 'Tab') {
    if (event.key === 'Escape') event.preventDefault()
    close()
    return
  }

  if (!count) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = Math.min(count - 1, activeIndex.value + 1)
    void nextTick(scrollActive)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = Math.max(0, activeIndex.value - 1)
    void nextTick(scrollActive)
  } else if (event.key === 'Home') {
    event.preventDefault()
    activeIndex.value = 0
    void nextTick(scrollActive)
  } else if (event.key === 'End') {
    event.preventDefault()
    activeIndex.value = count - 1
    void nextTick(scrollActive)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const item = props.items[activeIndex.value]
    if (item) choose(item.value)
  }
}

function onDocumentPointer(event: PointerEvent) {
  if (!open.value) return
  const target = event.target as Node
  if (root.value?.contains(target) || menu.value?.contains(target)) return
  close()
}

function onDocumentKey(event: KeyboardEvent) {
  if (!open.value || event.key !== 'Escape') return
  event.preventDefault()
  close()
  trigger.value?.focus()
}

function onViewportChange() {
  if (open.value) positionMenu()
}

watch(open, (value) => {
  if (value) positionMenu()
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointer)
  document.addEventListener('keydown', onDocumentKey)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer)
  document.removeEventListener('keydown', onDocumentKey)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
})
</script>

<template>
  <div
    ref="root"
    class="ui-select"
    :class="{ 'is-open': open, 'is-disabled': isDisabled }"
    v-bind="rootAttrs"
  >
    <button
      ref="trigger"
      type="button"
      class="ui-select__trigger"
      :class="{ 'is-open': open, 'is-empty': !selected }"
      role="combobox"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="listbox"
      :aria-controls="menuId"
      :aria-activedescendant="open ? activeOptionId : undefined"
      :disabled="isDisabled"
      v-bind="buttonAttrs"
      @click="toggle"
      @keydown="onTriggerKey"
    >
      <span class="ui-select__value">{{ selectedLabel }}</span>
      <span
        class="ui-select__chevron"
        :class="{ 'is-open': open }"
      >
        <UiIcon
          name="i-lucide-chevron-down"
          :size="16"
        />
      </span>
    </button>
    <input
      v-if="fieldName"
      type="hidden"
      :name="fieldName"
      :value="modelValue"
    >
    <Teleport to="body">
      <div
        v-if="open"
        :id="menuId"
        ref="menu"
        class="ui-select__menu"
        role="listbox"
        :style="menuStyle"
      >
        <button
          v-for="(item, index) in items"
          :id="optionId(item.value)"
          :key="item.value"
          type="button"
          class="ui-select__option"
          role="option"
          :aria-selected="item.value === modelValue ? 'true' : 'false'"
          :data-active="index === activeIndex ? 'true' : undefined"
          @mouseenter="activeIndex = index"
          @click="choose(item.value)"
        >
          <span>{{ item.label }}</span>
          <UiIcon
            v-if="item.value === modelValue"
            name="i-lucide-check"
            :size="14"
          />
        </button>
        <p
          v-if="!items.length"
          class="ui-select__empty"
        >
          没有可选项
        </p>
      </div>
    </Teleport>
  </div>
</template>
