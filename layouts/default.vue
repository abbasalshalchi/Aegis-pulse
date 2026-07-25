<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, navigateTo } from '#imports'
import { useTowerStore } from '~/stores/tower'

const store = useTowerStore()
const route = useRoute()

const SECTION_LABELS = { mast: 'Main Mast', bts: 'BTS Cabinet', generator: 'Power Generator' }

// --- AI triage drawer ------------------------------------------------------
const analysisOpen = ref(false)
const urgentCount = computed(
  () => (store.analysis.data?.alerts ?? []).filter((a) => a.severity === 'urgent').length,
)

// Analyse once when the dashboard mounts (the layout persists across route
// changes, so this fires once per session), and again whenever a tower's status
// set changes — watching the status signature, not raw values, so jitter drift
// doesn't trigger it. No polling; the server dedupes and rate-floors the call.
onMounted(() => store.fetchAnalysis())
watch(
  () => store.statusSignature,
  () => store.fetchAnalysis(),
)

// Apply a deep-link focus from the analysis panel once the arrival transition
// to the tower resolves — zoomIntoSection can't run mid-transition, so the click
// stashes pendingFocus and we act on it here when the stage settles.
watch(
  () => store.transition.playing,
  (playing) => {
    if (playing) return
    const focus = store.pendingFocus
    if (focus && store.activeTowerId === focus.towerId) {
      store.pendingFocus = null
      store.focusComponent(focus.sectionId, focus.componentId)
    }
  },
)

// Iraq ▸ governorate ▸ tower ▸ section — mirrors the drill-down state and lets
// the user climb back up from anywhere.
const crumbs = computed(() => {
  const items = [{ id: 'iraq', label: 'Iraq', click: goHome }]
  if (store.activeState) items.push({ id: 'state', label: store.activeState.name, click: goState })
  if (route.path.startsWith('/tower') && store.activeTower) {
    items.push({ id: 'tower', label: store.activeTower.id, click: () => store.zoomOut() })
    if (store.zoomedSection) {
      items.push({ id: 'section', label: SECTION_LABELS[store.zoomedSection] })
    }
  }
  return items
})

function goHome() {
  store.leaveTower()
  store.clearState()
  navigateTo('/')
}

function goState() {
  store.leaveTower()
  navigateTo('/')
}
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden">
    <header
      class="z-20 flex h-14 shrink-0 items-center gap-4 border-b border-zain-accent/20 bg-zain-dark px-4"
    >
      <button type="button" class="flex shrink-0 items-center gap-2.5" @click="goHome">
        <svg viewBox="0 0 24 24" class="h-6 w-6" aria-hidden="true">
          <path
            d="M12 3 7 21M12 3l5 18M9.4 13h5.2M8.3 17h7.4"
            fill="none"
            class="stroke-zain-sand"
            stroke-width="1.6"
            stroke-linecap="round"
          />
          <circle cx="12" cy="3" r="1.8" class="fill-zain-accent-bright" />
        </svg>
        <span class="text-left leading-tight">
          <span class="block text-sm font-bold tracking-[0.25em] text-zain-sand">AEGIS PULSE</span>
          <span class="block text-[9px] uppercase tracking-[0.2em] text-zain-accent-bright">
            GSM Tower Health · NOC
          </span>
        </span>
      </button>

      <nav class="hidden min-w-0 items-center gap-1 text-xs text-zain-light/60 sm:flex">
        <template v-for="(crumb, i) in crumbs" :key="crumb.id">
          <span v-if="i > 0" class="text-zain-accent/60">/</span>
          <button
            v-if="crumb.click"
            type="button"
            class="truncate transition-colors hover:text-zain-sand"
            @click="crumb.click"
          >
            {{ crumb.label }}
          </button>
          <span v-else class="truncate text-zain-sand">{{ crumb.label }}</span>
        </template>
      </nav>

      <div class="ml-auto flex shrink-0 items-center gap-3">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded border border-zain-accent/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zain-sand transition-colors hover:border-zain-accent"
          @click="analysisOpen = true"
        >
          <span>✦ AI</span>
          <span class="hidden sm:inline">Triage</span>
          <span
            v-if="urgentCount"
            class="rounded bg-status-critical/20 px-1 font-mono text-status-critical"
          >
            {{ urgentCount }}
          </span>
          <span
            v-else-if="store.analysis.loading"
            class="h-1.5 w-1.5 animate-pulse rounded-full bg-zain-accent-bright"
          />
        </button>
        <span
          v-if="store.networkAlertCount"
          class="hidden rounded border border-zain-alert/40 bg-zain-alert/15 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zain-alert-soft sm:inline"
        >
          ⚠ {{ store.networkAlertCount }} alerts
        </span>
        <span
          class="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.25em] text-zain-accent-bright"
        >
          <span class="status-dot status-dot--ok animate-pulse-dot" />
          LIVE
        </span>
      </div>
    </header>

    <!-- AI triage slide-over. Network-wide, so it lives in the layout rather than
         a page; the dashboard stays fully usable whether it's open or not. -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="analysisOpen"
        class="fixed inset-0 z-40 bg-zain-dark/60 backdrop-blur-sm"
        @click="analysisOpen = false"
      />
    </Transition>
    <Transition
      enter-active-class="transition-transform duration-300 ease-out"
      enter-from-class="translate-x-full"
      leave-active-class="transition-transform duration-300 ease-in"
      leave-to-class="translate-x-full"
    >
      <aside
        v-if="analysisOpen"
        class="fixed right-0 top-0 z-50 flex h-dvh w-full max-w-sm flex-col border-l border-zain-accent/20 bg-zain-dark-raised shadow-2xl"
      >
        <div class="flex h-10 shrink-0 items-center justify-between border-b border-zain-accent/15 px-3">
          <span class="text-[10px] uppercase tracking-[0.25em] text-zain-light/40">Analysis</span>
          <button
            type="button"
            class="rounded px-2 py-1 text-zain-light/50 transition-colors hover:text-zain-sand"
            aria-label="Close analysis"
            @click="analysisOpen = false"
          >
            ✕
          </button>
        </div>
        <NetworkAnalysis class="min-h-0 flex-1" @close="analysisOpen = false" />
      </aside>
    </Transition>

    <!-- Map View and Tower View render here; each manages its own scrolling -->
    <main class="relative min-h-0 flex-1 overflow-hidden">
      <slot />
    </main>
  </div>
</template>
