<script setup lang="ts">
defineOptions({ name: 'ProfileSwitchSheet' })

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  select: [localId: string]
  manage: []
}>()

const { items } = useProfiles()
const avatars = useProfileAvatars()

function avatarSrc(item: { localId: string, id: string }) {
  return avatars.url(item.localId) || avatars.url(item.id)
}
</script>

<template>
  <UiSheet
    v-model:open="open"
    labelled-by="profile-switch-title"
  >
    <div class="sheet-head">
      <div>
        <p
          id="profile-switch-title"
          class="sheet-head__title"
        >
          切换 Profile
        </p>
        <p class="sheet-head__desc">
          使用当前网关上的 Hermes Profiles。切换后会话和定时任务会跟着走。
        </p>
      </div>
    </div>
    <div class="sheet-list">
      <button
        v-for="item in items"
        :key="item.localId"
        type="button"
        class="sheet-option"
        :class="{ 'is-active': item.isActive }"
        @click="emit('select', item.localId)"
      >
        <ProfileAvatar
          :seed="item.localId"
          :src="avatarSrc(item)"
          :size="36"
        />
        <span class="sheet-option__text">
          <span class="sheet-option__title">{{ item.name }}</span>
          <span class="sheet-option__hint">{{ item.handle }} · {{ hostLabel(item.baseUrl) }}</span>
        </span>
        <UiIcon
          v-if="item.isActive"
          name="i-lucide-check"
          :size="16"
        />
      </button>
      <UiButton
        color="neutral"
        variant="outline"
        icon="i-lucide-atom"
        label="管理身份"
        @click="emit('manage')"
      />
    </div>
  </UiSheet>
</template>

<style lang="scss" scoped>
.sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.sheet-head__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.sheet-head__desc {
  margin: 0.2rem 0 0;
  color: var(--color-text-muted);
  font-size: 0.75rem;
}

.sheet-list {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.55rem;
  overflow-y: auto;
  margin-top: 0.35rem;
  padding-bottom: 0.35rem;

  :deep(.ui-btn) {
    width: 100%;
  }
}

.sheet-option {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: 0.95rem;
  background: var(--color-surface);
  padding: 0.8rem 0.9rem;
  color: var(--color-text-toned);
  text-align: start;

  &.is-active {
    background: var(--color-elevated);
    border-color: var(--color-accented);
    color: var(--color-text-strong);
  }

  :deep(.ui-icon) {
    margin-left: auto;
    color: var(--color-text-strong);
  }
}

.sheet-option__text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.15rem;
}

.sheet-option__title {
  overflow: hidden;
  color: var(--color-text-strong);
  font-size: 0.875rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sheet-option__hint {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
