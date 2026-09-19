import { installIgnorableNetworkErrorGuard } from './shared/utils/networkErrors'

export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/icon'],
  devtools: {
    enabled: false
  },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-Hans' },
      title: 'Hermes',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover' },
        { name: 'color-scheme', content: 'light' },
        { name: 'theme-color', content: '#fafaf9' }
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
      ]
    }
  },
  css: ['~/assets/scss/main.scss', 'katex/dist/katex.min.css'],
  runtimeConfig: {
    sessionPassword: process.env.NUXT_SESSION_PASSWORD || 'hermes-nuxt-dev-session-password-change-me'
  },
  devServer: {
    host: '127.0.0.1',
    port: 3000
  },
  compatibilityDate: '2026-09-17',
  nitro: {
    experimental: {
      websocket: true
    }
  },
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          additionalData(source: string, filename: string) {
            if (filename.replace(/\\/g, '/').includes('/assets/scss/')) return source
            return `@use "mixins" as *;\n${source}`
          },
          loadPaths: ['app/assets/scss']
        }
      }
    }
  },
  hooks: {
    listen() {
      installIgnorableNetworkErrorGuard()
    },
    ready() {
      installIgnorableNetworkErrorGuard()
    }
  },
  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },
  icon: {
    clientBundle: {
      scan: {
        globInclude: ['**/*.vue', '**/*.ts']
      },
      icons: [
        'lucide:arrow-up',
        'lucide:check',
        'lucide:chevron-down',
        'lucide:copy',
        'lucide:eye',
        'lucide:eye-off',
        'lucide:loader-circle',
        'lucide:log-in',
        'lucide:log-out',
        'lucide:plus',
        'lucide:square'
      ]
    }
  }
})
