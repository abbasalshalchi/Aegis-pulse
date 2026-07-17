import { defineEventHandler, setResponseStatus, useRuntimeConfig } from '#imports'

// Data-layer stub. The prototype seeds mock telemetry client-side
// (stores/tower.js); this route is where the real MongoDB Atlas feed plugs in.
//
// NOTE: MongoDB retired the Atlas Data API (EOL September 2025). On Cloudflare
// Pages/Workers, either call a thin HTTPS data service you host in front of
// Atlas, or use the official driver with Cloudflare's `nodejs_compat` + TCP
// sockets. The URL/key config stays generic for whichever endpoint you stand up.
export default defineEventHandler(async (event) => {
  const { mongoDataUrl, mongoDataKey, mongoDataSource } = useRuntimeConfig(event)

  if (!mongoDataUrl) {
    setResponseStatus(event, 501)
    return {
      error: 'Tower data layer not configured — set NUXT_MONGO_DATA_URL and NUXT_MONGO_DATA_KEY.',
    }
  }

  return await $fetch(`${mongoDataUrl}/action/find`, {
    method: 'POST',
    headers: { 'api-key': mongoDataKey, 'content-type': 'application/json' },
    body: { dataSource: mongoDataSource, database: 'aegis', collection: 'towers', filter: {} },
  })
})
