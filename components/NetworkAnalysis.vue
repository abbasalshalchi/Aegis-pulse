<script setup>
import { computed } from 'vue'
import { navigateTo } from '#imports'
import { useTowerStore } from '~/stores/tower'

// AI triage panel. Reads store.analysis (populated by fetchAnalysis) and renders
// the network summary + ranked alerts. It degrades gracefully: a loading
// skeleton, an error banner, and a "no clear alerts" empty state, so the panel
// is always readable and the rest of the dashboard never depends on it.
const store = useTowerStore()

// Emitted so the layout can close the drawer when a deep-link navigates away.
const emit = defineEmits(['close'])

// Jump to a tower referenced in an alert. Ignores hallucinated ids.
function goToTower(towerId) {
  if (!store.towers.some((t) => t.id === towerId)) return
  store.pendingFocus = null
  if (store.activeTowerId !== towerId) navigateTo(`/tower/${towerId}`)
  emit('close')
}

// Jump to a specific sensor: navigate to its tower (if needed), then focus its
// section + select it. When we have to navigate first, the focus is stashed and
// applied by the watcher in layouts/default.vue once the arrival transition
// resolves. Falls back to the tower view if the component id is unknown.
function goToComponent(towerId, componentId) {
  const sectionId = store.sectionForComponent(towerId, componentId)
  if (!sectionId) return goToTower(towerId)
  if (store.activeTowerId === towerId) {
    if (store.transition.playing) store.pendingFocus = { towerId, sectionId, componentId }
    else store.focusComponent(sectionId, componentId)
  } else {
    store.pendingFocus = { towerId, sectionId, componentId }
    navigateTo(`/tower/${towerId}`)
  }
  emit('close')
}

const analysis = computed(() => store.analysis)
const result = computed(() => store.analysis.data)

const OVERALL = {
  stable: { label: 'Stable', class: 'border-status-ok/40 bg-status-ok/10 text-status-ok' },
  degraded: {
    label: 'Degraded',
    class: 'border-status-warning/40 bg-status-warning/10 text-status-warning',
  },
  critical: {
    label: 'Critical',
    class: 'border-status-critical/40 bg-status-critical/10 text-status-critical',
  },
}

const SEVERITY = {
  urgent: { label: 'Urgent', dot: 'bg-status-critical', text: 'text-status-critical' },
  attention: { label: 'Attention', dot: 'bg-status-warning', text: 'text-status-warning' },
  monitor: { label: 'Monitor', dot: 'bg-zain-accent-bright', text: 'text-zain-accent-bright' },
}

const fetchedTime = computed(() =>
  result.value?.generatedAt
    ? new Date(result.value.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null,
)
</script>

<template>
  <div class="flex h-full flex-col">
    <header class="flex items-start justify-between gap-3 border-b border-zain-accent/15 px-4 py-3">
      <div class="min-w-0">
        <p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-zain-accent-bright">
          AI Triage
        </p>
        <h2 class="truncate text-sm font-semibold text-zain-sand">Network Health Analysis</h2>
      </div>
      <button
        type="button"
        class="shrink-0 rounded border border-zain-accent/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zain-sand transition-colors hover:border-zain-accent disabled:opacity-40"
        :disabled="analysis.loading"
        @click="store.fetchAnalysis()"
      >
        {{ analysis.loading ? 'Analysing…' : '↻ Re-analyse' }}
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- Loading skeleton (only when there's nothing to show yet) -->
      <div v-if="analysis.loading && !result" class="space-y-3 px-4 py-4">
        <div class="h-5 w-24 animate-pulse rounded bg-zain-accent/15" />
        <div class="h-3 w-full animate-pulse rounded bg-zain-accent/10" />
        <div class="h-3 w-4/5 animate-pulse rounded bg-zain-accent/10" />
        <div class="mt-4 h-16 w-full animate-pulse rounded bg-zain-accent/10" />
        <div class="h-16 w-full animate-pulse rounded bg-zain-accent/10" />
      </div>

      <!-- Error — degraded but non-blocking -->
      <div
        v-else-if="analysis.error && !result"
        class="m-4 rounded border border-zain-alert/40 bg-zain-alert/10 px-3 py-3"
      >
        <p class="text-xs font-semibold text-zain-alert-soft">Analysis unavailable</p>
        <p class="mt-1 text-[11px] leading-relaxed text-zain-light/60">{{ analysis.error }}</p>
        <p class="mt-2 text-[10px] text-zain-light/40">
          Live telemetry below is unaffected — this only pauses the AI summary.
        </p>
      </div>

      <!-- Result -->
      <div v-else-if="result">
        <div class="border-b border-zain-accent/10 px-4 py-3">
          <div class="flex items-center gap-2">
            <span
              class="rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              :class="OVERALL[result.overallState]?.class"
            >
              {{ OVERALL[result.overallState]?.label ?? result.overallState }}
            </span>
            <span v-if="fetchedTime" class="font-mono text-[10px] text-zain-light/40">
              {{ fetchedTime }}
            </span>
            <span
              v-if="result.weatherAvailable === false"
              class="ml-auto font-mono text-[9px] uppercase tracking-wide text-zain-light/40"
              title="Weather API returned nothing; severities are from telemetry alone."
            >
              no forecast
            </span>
          </div>
          <p class="mt-2 text-xs leading-relaxed text-zain-light/85">{{ result.summary }}</p>
        </div>

        <ul v-if="result.alerts?.length" class="divide-y divide-zain-accent/10">
          <li v-for="(alert, i) in result.alerts" :key="`${alert.towerId}-${alert.component}-${i}`" class="px-4 py-3">
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 shrink-0 rounded-full" :class="SEVERITY[alert.severity]?.dot" />
              <span
                class="text-[10px] font-semibold uppercase tracking-wider"
                :class="SEVERITY[alert.severity]?.text"
              >
                {{ SEVERITY[alert.severity]?.label ?? alert.severity }}
              </span>
              <button
                type="button"
                class="ml-auto truncate rounded font-mono text-[10px] text-zain-accent-bright underline decoration-dotted underline-offset-2 transition-colors hover:text-zain-sand"
                title="Go to this sensor"
                @click="goToComponent(alert.towerId, alert.component)"
              >
                {{ alert.component }}
              </button>
              <span
                v-if="alert.weatherLinked"
                class="shrink-0 rounded bg-zain-accent/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-zain-accent-bright"
                title="Severity was influenced by the weather forecast."
              >
                ☂ weather
              </span>
            </div>
            <button
              type="button"
              class="mt-1.5 block max-w-full truncate text-left text-xs font-semibold text-zain-sand underline decoration-dotted underline-offset-2 transition-colors hover:text-zain-light"
              title="Go to this tower"
              @click="goToTower(alert.towerId)"
            >
              {{ alert.towerName }}
            </button>
            <p class="font-mono text-[10px] text-zain-light/40">{{ alert.towerId }}</p>
            <p class="mt-1.5 text-[11px] leading-relaxed text-zain-light/80">{{ alert.cause }}</p>
            <p class="mt-1 flex gap-1.5 text-[11px] leading-relaxed text-zain-light/60">
              <span class="text-zain-accent-bright">▸</span>
              <span>{{ alert.recommendedAction }}</span>
            </p>
          </li>
        </ul>

        <p v-else class="px-4 py-6 text-center text-xs text-zain-light/50">
          No triage-level alerts — network reads nominal.
        </p>
      </div>

      <!-- Idle (before the first fetch resolves) -->
      <p v-else class="px-4 py-6 text-center text-xs text-zain-light/40">Awaiting first analysis…</p>
    </div>

    <footer class="border-t border-zain-accent/15 px-4 py-2.5 text-[10px] leading-relaxed text-zain-light/35">
      Generated by Gemini from live telemetry + regional forecast. Advisory only.
    </footer>
  </div>
</template>
