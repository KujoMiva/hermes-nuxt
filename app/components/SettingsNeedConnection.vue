<template>
  <div class="need-connection">
    <p>当前连接已断开。请重新用远程网关地址登录。</p>
    <UiButton
      class="need-connection__btn"
      color="neutral"
      size="sm"
      icon="i-lucide-log-in"
      label="去登录"
      to="/login"
    />
  </div>
</template>

<style lang="scss" scoped>
.need-connection {
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--color-bg) 40%, transparent);
  padding: 2rem 1rem;
  text-align: center;

  p {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    overflow-wrap: anywhere;
  }
}

.need-connection__btn {
  margin-top: 0.75rem;
}
</style>
