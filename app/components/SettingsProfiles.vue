<script setup lang="ts">
import type { HermesProfileOption, ProfileDraft } from '~/composables/useProfiles'
import { PROFILE_NAV } from '~/composables/useProfiles'

defineOptions({ name: 'SettingsProfiles' })

const connection = useConnection()
const profiles = useProfiles()
const avatars = useProfileAvatars()
const labels = useProfileLabels()
const chat = useChatController()
const toast = useToast()

const fileRef = ref<HTMLInputElement | null>(null)
const avatarTarget = ref('')
const editorOpen = ref(false)
const switchingId = ref('')
const editor = reactive<ProfileDraft>({
  localId: '',
  name: '',
  slug: ''
})

onMounted(() => {
  void profiles.refresh()
})

function avatarSrc(item: HermesProfileOption) {
  return avatars.url(item.localId) || avatars.url(item.id)
}

function pickAvatar(item: HermesProfileOption) {
  avatarTarget.value = item.localId
  fileRef.value?.click()
}

async function onAvatarFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const id = avatarTarget.value
  if (!file || !id) return
  try {
    await avatars.setFromFile(id, file)
    toast.add({ title: '头像已更新', color: 'success' })
  } catch (error) {
    toast.add({
      title: '无法更新头像',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  }
}

function openEditor(item?: HermesProfileOption) {
  if (item) {
    editor.localId = item.localId
    editor.name = item.name
    editor.slug = item.isDefault ? '' : item.slug
  } else {
    editor.localId = ''
    editor.name = ''
    editor.slug = ''
  }
  editorOpen.value = true
}

const savingEditor = ref(false)

async function saveEditor() {
  const name = (editor.slug || editor.name).trim()
  if (!name && !editor.localId) {
    toast.add({ title: '请填写 Profile 名称', color: 'warning' })
    return
  }
  savingEditor.value = true
  try {
    if (editor.localId) {
      labels.set(editor.localId, editor.name.trim() || editor.localId)
      await profiles.refresh()
      toast.add({ title: '显示名称已更新', color: 'success' })
    } else {
      await profiles.save({
        name: editor.name.trim() || name,
        slug: name
      })
    }
    editorOpen.value = false
  } catch (error) {
    toast.add({
      title: '保存失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    savingEditor.value = false
  }
}

async function afterSwitch() {
  chat.resetLocal()
  try {
    await connection.testConnection()
  } catch {
    // banner / toast from testConnection
  }
}

async function useProfile(item: HermesProfileOption) {
  if (item.isActive) return
  switchingId.value = item.localId
  try {
    await profiles.select(item.localId)
    await afterSwitch()
    toast.add({ title: `已切换到 ${item.name}`, color: 'success' })
  } catch (error) {
    toast.add({
      title: '切换失败',
      description: error instanceof Error ? error.message : String(error),
      color: 'error'
    })
  } finally {
    switchingId.value = ''
  }
}

async function removeProfile(item: HermesProfileOption) {
  await profiles.remove(item.localId)
}

async function openSection(item: HermesProfileOption, tab: string) {
  if (!item.isActive) {
    try {
      await profiles.select(item.localId)
      await afterSwitch()
    } catch (error) {
      toast.add({
        title: '切换失败',
        description: error instanceof Error ? error.message : String(error),
        color: 'error'
      })
      return
    }
  }
  await navigateTo({
    path: '/settings',
    query: { tab }
  })
}
</script>

<template>
  <div class="profiles">
    <p class="profiles__lead">
      这些是远程网关上的 Hermes Profiles。切换后，会话、技能、模型和定时任务都会走对应的 HERMES_HOME。头像和显示名称只存在这台浏览器。
    </p>

    <article
      v-for="item in profiles.items.value"
      :key="item.localId"
      class="profile-card"
      :class="{ 'is-active': item.isActive }"
    >
      <div class="profile-card__top">
        <button
          type="button"
          class="profile-card__avatar"
          :aria-label="`更换 ${item.name} 的头像`"
          @click="pickAvatar(item)"
        >
          <ProfileAvatar
            :seed="item.localId"
            :src="avatarSrc(item)"
            :size="56"
          />
          <span class="profile-card__camera">
            <UiIcon
              name="i-lucide-camera"
              :size="11"
            />
          </span>
        </button>
        <button
          type="button"
          class="profile-card__id"
          :aria-label="item.isActive ? `${item.name}，当前使用` : `切换到 ${item.name}`"
          @click="useProfile(item)"
        >
          <p class="profile-card__name">
            {{ item.name }}
            <span
              v-if="item.isActive"
              class="profile-card__badge"
            >使用中</span>
          </p>
          <p class="profile-card__handle">
            {{ item.handle }} · {{ hostLabel(item.baseUrl) }}
          </p>
        </button>
        <div class="profile-card__actions">
          <UiButton
            color="neutral"
            variant="ghost"
            size="sm"
            square
            pill
            icon="i-lucide-square-pen"
            aria-label="编辑 Profile"
            @click="openEditor(item)"
          />
          <UiButton
            v-if="profiles.items.value.length > 1"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            pill
            icon="i-lucide-trash"
            aria-label="删除 Profile"
            @click="removeProfile(item)"
          />
        </div>
      </div>
      <div
        v-if="item.isActive"
        class="profile-card__nav"
      >
        <button
          v-for="entry in PROFILE_NAV"
          :key="entry.tab"
          type="button"
          class="profile-card__link"
          @click="openSection(item, entry.tab)"
        >
          <UiIcon
            :name="entry.icon"
            :size="20"
          />
          <span>{{ entry.label }}</span>
        </button>
      </div>
      <div
        v-else
        class="profile-card__switch"
      >
        <UiButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-arrow-left-right"
          label="使用这个 Profile"
          :loading="switchingId === item.localId"
          @click="useProfile(item)"
        />
      </div>
    </article>

    <UiButton
      color="neutral"
      variant="outline"
      icon="i-lucide-plus"
      label="新建 Profile"
      @click="openEditor()"
    />

    <input
      ref="fileRef"
      type="file"
      accept="image/*"
      hidden
      @change="onAvatarFile"
    >

    <UiSheet
      :open="editorOpen"
      labelled-by="profile-editor-title"
      @update:open="editorOpen = $event"
    >
      <div class="editor">
        <p
          id="profile-editor-title"
          class="editor__title"
        >
          {{ editor.localId ? '编辑 Profile' : '新建 Profile' }}
        </p>
        <p class="editor__lead">
          {{ editor.localId
            ? '显示名称只存在这台浏览器。网关上的 Profile 目录名不会改。'
            : '会在远程网关上调用 profiles.create。名称会成为 Profile 目录名。' }}
        </p>
        <UiFormField
          label="显示名称"
          hint="只用于这台设备上的展示"
        >
          <UiInput
            v-model="editor.name"
            placeholder="例如 Default"
          />
        </UiFormField>
        <UiFormField
          v-if="!editor.localId"
          label="Profile 名称"
          hint="远程网关上的目录名，例如 work"
        >
          <UiInput
            v-model="editor.slug"
            placeholder="例如 work"
          />
        </UiFormField>
        <UiButton
          icon="i-lucide-save"
          :label="editor.localId ? '保存' : '创建'"
          :loading="savingEditor"
          @click="saveEditor"
        />
      </div>
    </UiSheet>
  </div>
</template>

<style lang="scss" scoped>
.profiles {
  width: 100%;
  max-width: 42rem;
  margin: 0 auto;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.85rem;
}

.profiles__lead {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.profile-card {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 1.35rem;
  background: var(--color-surface);
  box-shadow: var(--shadow);

  &.is-active {
    border-color: color-mix(in srgb, var(--color-text-strong) 18%, var(--color-border));
  }
}

.profile-card__top {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.85rem;
  padding: 1.05rem 1rem 0.95rem;
}

.profile-card__avatar {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  border: 0;
  background: transparent;
  padding: 0;
}

.profile-card__camera {
  position: absolute;
  right: -0.1rem;
  bottom: -0.1rem;
  display: flex;
  width: 1.25rem;
  height: 1.25rem;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-surface);
  border-radius: 50%;
  background: #2f3540;
  color: #fff;
}

.profile-card__id {
  min-width: 0;
  flex: 1;
  border: 0;
  background: transparent;
  padding: 0;
  text-align: start;
}

.profile-card__name {
  @include truncate;
  margin: 0;
  color: var(--color-text-strong);
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.profile-card__badge {
  display: inline-flex;
  margin-left: 0.4rem;
  border-radius: 999px;
  background: var(--color-elevated);
  color: var(--color-text-toned);
  font-size: 0.68rem;
  font-weight: 650;
  letter-spacing: 0;
  padding: 0.08rem 0.42rem;
  vertical-align: middle;
}

.profile-card__handle {
  @include truncate;
  margin: 0.12rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.78rem;
}

.profile-card__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}

.profile-card__nav {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.15rem;
  border-top: 1px solid var(--color-border);
  padding: 0.85rem 0.35rem 0.8rem;
}

.profile-card__link {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 0.32rem;
  border: 0;
  background: transparent;
  color: var(--color-text-toned);
  font-size: 0.72rem;
  line-height: 1.2;

  span {
    @include truncate;
    max-width: 100%;
  }
}

.profile-card__switch {
  border-top: 1px solid var(--color-border);
  padding: 0.75rem 1rem 0.9rem;

  :deep(.ui-btn) {
    width: 100%;
  }
}

.editor {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding-bottom: 0.35rem;
}

.editor__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
}

.editor__lead {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.78rem;
  line-height: 1.5;
}

.editor :deep(.ui-btn) {
  width: 100%;
  min-height: 2.7rem;
  border-radius: 999px;
}

.editor :deep(.ui-input-wrap .ui-btn) {
  width: auto;
  min-height: 0;
  border-radius: var(--radius-pill);
}
</style>
