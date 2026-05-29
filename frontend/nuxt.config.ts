// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  ssr: false, // 個人向けPWAなのでSPAとして動かす（オフライン・構成がシンプル）
  devtools: { enabled: false },

  modules: ['@vite-pwa/nuxt'],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'ズボラ家計簿',
      htmlAttrs: { lang: 'ja' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1' },
        { name: 'theme-color', content: '#10b981' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'ズボラ家計簿' },
      ],
      link: [
        { rel: 'icon', href: '/icons/icon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/icons/icon.svg' },
      ],
    },
  },

  // 開発時は Python API(:8000) にプロキシする
  nitro: {
    devProxy: {
      '/api': { target: 'http://localhost:8000/api', changeOrigin: true },
      '/uploads': { target: 'http://localhost:8000/uploads', changeOrigin: true },
    },
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'ズボラ家計簿',
      short_name: '家計簿',
      description: 'レシート撮影と使いすぎ防止機能つきの家計簿',
      start_url: '/',
      display: 'standalone',
      background_color: '#f8faf9',
      theme_color: '#10b981',
      orientation: 'portrait',
      icons: [
        { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icons/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
      ],
    },
    workbox: {
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/api/, /^\/uploads/],
    },
    devOptions: { enabled: false },
  },
})
