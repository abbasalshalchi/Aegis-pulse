import { defineEventHandler, readBody, setResponseStatus, useRuntimeConfig } from '#imports'
import {
  RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
  buildSnapshot,
  validateAnalysis,
} from '../utils/analysisPrompt'

// AI tower-health triage. This is the ONLY place the Gemini key is used; the
// browser posts the current telemetry snapshot and gets back a parsed summary,
// so the key never reaches the client (mirrors server/api/towers.get.js).
//
// Runs on the Cloudflare Workers runtime → Web APIs only (crypto.subtle, fetch),
// no node:crypto / no Buffer.

// Governorate id (tower.stateId) → weather query. Anbar's forecast comes from
// its capital, Ramadi. Falls back to a capitalised id for anything unlisted.
const GOVERNORATE_QUERY = {
  erbil: 'Erbil,IQ',
  anbar: 'Ramadi,IQ',
  baghdad: 'Baghdad,IQ',
  najaf: 'Najaf,IQ',
  basra: 'Basra,IQ',
}

// ---------------------------------------------------------------------------
// Cache — module scope, so it lives per Cloudflare isolate. Three viewers on the
// same isolate with the same tower state share ONE Gemini call. It is NOT shared
// across isolates; for that, swap this Map for Workers KV with a short TTL.
// ---------------------------------------------------------------------------
const cache = new Map() // hash → { result, timestamp }
let lastResult = null // most recent success, reused on the 60s floor and on 429
let lastCallAt = 0 // when we last hit Gemini
const CALL_FLOOR_MS = 60_000 // never call Gemini more than once per minute
const CACHE_MAX = 50

async function sha256Hex(str) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Hash on STATUS + ROUNDED readings (not raw floats) so jitterTelemetry()'s
// per-tick drift doesn't defeat the cache, plus the weather validity window so
// the analysis refreshes when the forecast bucket rolls.
function hashInput(towers, weatherWindow) {
  const tuples = []
  for (const tower of towers) {
    for (const section of tower.sections ?? []) {
      for (const c of section.components ?? []) {
        const value = typeof c.value === 'number' ? Math.round(c.value * 10) / 10 : c.value
        tuples.push(`${tower.id}:${c.id}:${c.status}:${value}`)
      }
    }
  }
  tuples.sort()
  return `${tuples.join('|')}#${weatherWindow}`
}

// WeatherAPI.com forecast.json shape. Provider-specific — adjust this normaliser
// (and the query params below) if NUXT_WEATHER_API_URL points elsewhere.
function normalizeForecast(raw) {
  const forecastDay = raw?.forecast?.forecastday?.[0]
  const day = forecastDay?.day
  if (!day) return null
  return {
    date: forecastDay.date ?? null,
    tempMaxC: day.maxtemp_c ?? null,
    windGustKmh: day.maxwind_kph ?? null, // WeatherAPI exposes max wind, not gust
    precipMm: day.totalprecip_mm ?? null,
    rainChancePct: day.daily_chance_of_rain ?? null,
    condition: day.condition?.text ?? null, // may read "Blowing dust", "Sandstorm"…
  }
}

async function fetchWeather(governorate, url, key) {
  const raw = await $fetch(url, {
    query: {
      key,
      q: GOVERNORATE_QUERY[governorate] ?? `${governorate},IQ`,
      days: 1,
      aqi: 'no',
      alerts: 'no',
    },
  })
  return normalizeForecast(raw)
}

export default defineEventHandler(async (event) => {
  const { geminiApiKey, geminiModel, weatherApiUrl, weatherApiKey } = useRuntimeConfig(event)

  if (!geminiApiKey) {
    setResponseStatus(event, 501)
    return { error: 'Analysis not configured — set NUXT_GEMINI_API_KEY (and NUXT_GEMINI_MODEL).' }
  }

  const body = await readBody(event)
  const towers = body?.towers
  if (!Array.isArray(towers) || towers.length === 0) {
    setResponseStatus(event, 400)
    return { error: 'Request body must include a non-empty { towers } array.' }
  }

  // 1-2. Weather per distinct governorate, in parallel, failing soft: a missing
  // forecast just proceeds on telemetry alone.
  const weatherByGov = {}
  let weatherAvailable = false
  if (weatherApiUrl && weatherApiKey) {
    const governorates = [...new Set(towers.map((t) => t.stateId).filter(Boolean))]
    const results = await Promise.all(
      governorates.map(async (gov) => {
        try {
          return [gov, await fetchWeather(gov, weatherApiUrl, weatherApiKey)]
        } catch {
          return [gov, null] // fail soft — one region's outage doesn't sink the run
        }
      }),
    )
    for (const [gov, forecast] of results) {
      weatherByGov[gov] = forecast
      if (forecast) weatherAvailable = true
    }
  }

  // 3. Hash the (rounded) state + hourly weather window. Cache hit → done.
  const weatherWindow = weatherAvailable ? String(Math.floor(Date.now() / 3_600_000)) : 'no-weather'
  const hash = await sha256Hex(hashInput(towers, weatherWindow))

  const hit = cache.get(hash)
  if (hit) return { ...hit.result, cached: true }

  // Floor: never hit Gemini more than once per minute, regardless of the last
  // call's OUTCOME. This guards against jitter churn AND against a rate-limited
  // first call turning every page reload into another upstream call. Serve the
  // last good result if we have one; otherwise tell the caller to retry shortly
  // WITHOUT making another Gemini call.
  const sinceLastCall = Date.now() - lastCallAt
  if (lastCallAt && sinceLastCall < CALL_FLOOR_MS) {
    if (lastResult) return { ...lastResult, cached: true, throttled: true }
    setResponseStatus(event, 429)
    return {
      error: 'Analysis is rate-limited (max one call per minute). Retry in a few seconds.',
      retryInSec: Math.ceil((CALL_FLOOR_MS - sinceLastCall) / 1000),
    }
  }

  // 4. Gemini structured-output call. Static rules go in systemInstruction; the
  // volatile telemetry+weather snapshot goes in contents.
  const model = geminiModel || 'gemini-3.5-flash'
  const snapshot = buildSnapshot(towers, weatherByGov, weatherAvailable)
  lastCallAt = Date.now()

  let parsed
  try {
    const res = await $fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': geminiApiKey, 'content-type': 'application/json' },
        body: {
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [
            {
              role: 'user',
              parts: [{ text: `Current telemetry and forecast:\n${JSON.stringify(snapshot)}` }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.2,
          },
        },
      },
    )
    const text = res?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Gemini returned no content')
    parsed = JSON.parse(text)
  } catch (err) {
    // Surface Google's actual reason (ofetch puts the parsed error body on
    // err.data). A 429 can be a genuine per-minute rate limit OR a zero free-tier
    // quota for the model/project/region — the message distinguishes them.
    const status = err?.response?.status ?? err?.statusCode ?? err?.status
    const upstream =
      err?.data?.error?.message ?? // Gemini shape: { error: { message, status } }
      (typeof err?.data?.error === 'string' ? err.data.error : null) ??
      err?.message ??
      'unknown error'

    if (status === 429) {
      if (lastResult) return { ...lastResult, cached: true, rateLimited: true }
      setResponseStatus(event, 429)
      return { error: `Gemini refused with 429 (quota/rate): ${upstream}`, model }
    }
    setResponseStatus(event, 502)
    return { error: `Analysis provider error (${status ?? '?'}): ${upstream}`, model }
  }

  // 5. Validate before trusting it — a malformed reply is an error, not an
  // empty panel.
  if (!validateAnalysis(parsed)) {
    setResponseStatus(event, 502)
    return { error: 'Analysis provider returned a malformed response.' }
  }

  const result = {
    ...parsed,
    weatherAvailable,
    generatedAt: new Date().toISOString(),
  }
  cache.set(hash, { result, timestamp: Date.now() })
  lastResult = result
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value) // bound growth

  return result
})
