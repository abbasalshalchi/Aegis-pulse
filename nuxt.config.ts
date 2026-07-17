export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt', '@nuxtjs/tailwindcss'],

  app: {
    head: {
      title: 'Aegis Pulse — GSM Tower Health NOC',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: 'Real-time GSM tower telemetry for the Network Operations Center.',
        },
      ],
    },
    pageTransition: { name: 'page', mode: 'out-in' },
  },

  // Deployment target per spec. Auto-detected on Cloudflare CI, explicit here.
  nitro: { preset: 'cloudflare-pages' },

  runtimeConfig: {
    // Server-only credentials for the tower data layer, override via
    // NUXT_MONGO_DATA_URL / NUXT_MONGO_DATA_KEY env vars (see server/api/towers.get.js).
    mongoDataUrl: '',
    mongoDataKey: '',
    mongoDataSource: 'AegisCluster',
  },
})
