import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const appDir = fileURLToPath(new URL('./app', import.meta.url))
const sharedDir = fileURLToPath(new URL('./shared', import.meta.url))

export default defineConfig({
  resolve: {
    alias: [
      { find: '~~', replacement: rootDir },
      { find: '@@', replacement: rootDir },
      { find: '#shared', replacement: sharedDir },
      { find: '~', replacement: appDir },
      { find: '@', replacement: appDir }
    ]
  },
  test: {
    name: 'unit',
    environment: 'node',
    include: ['test/unit/**/*.spec.ts']
  }
})
