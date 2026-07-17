<script setup>
import { computed } from 'vue'
import { useRoute, navigateTo } from '#imports'
import { useTowerStore } from '~/stores/tower'

const store = useTowerStore()
const route = useRoute()

const SECTION_LABELS = { mast: 'Main Mast', bts: 'BTS Cabinet', perimeter: 'Perimeter' }

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
        <span
          v-if="store.networkAlertCount"
          class="rounded border border-zain-alert/40 bg-zain-alert/15 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-zain-alert-soft"
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

    <!-- Map View and Tower View render here; each manages its own scrolling -->
    <main class="relative min-h-0 flex-1 overflow-hidden">
      <slot />
    </main>
  </div>
</template>
