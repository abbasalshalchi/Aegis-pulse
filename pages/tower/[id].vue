<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { navigateTo, useRoute } from '#imports'
import { useTowerStore } from '~/stores/tower'

// ---------------------------------------------------------------------------
// Tower View — SVG stage on the left, synchronized property panel as a side
// panel (desktop) or bottom sheet (mobile). Both render the same store data;
// hover/click sync happens entirely through the Pinia store.
// ---------------------------------------------------------------------------

const store = useTowerStore()
const route = useRoute()

if (!store.selectTower(route.params.id)) {
  await navigateTo('/', { replace: true })
}

const sheetOpen = ref(false)

// Gentle drift on numeric readings so the prototype feels like a live feed
let jitterTimer
onMounted(() => {
  jitterTimer = setInterval(() => store.jitterTelemetry(), 4000)
})
onUnmounted(() => clearInterval(jitterTimer))
</script>

<template>
  <div v-if="store.activeTower" class="flex h-full min-h-0 flex-col lg:flex-row">
    <!-- SVG stage: full tower or zoomed section, with spatial overlays -->
    <section class="relative min-h-0 flex-1">
      <TowerStage />
    </section>

    <!-- Desktop: synchronized side panel -->
    <aside
      class="hidden w-96 shrink-0 overflow-y-auto border-l border-zain-accent/15 bg-zain-dark-raised lg:block"
    >
      <PropertyPanel />
    </aside>

    <!-- Mobile: synchronized bottom sheet -->
    <div class="fixed inset-x-0 bottom-0 z-40 lg:hidden">
      <div
        class="mx-auto max-w-xl rounded-t-2xl border border-b-0 border-zain-accent/25 bg-zain-dark-raised/95 backdrop-blur"
      >
        <button
          type="button"
          class="flex w-full items-center gap-3 px-4 py-3"
          @click="sheetOpen = !sheetOpen"
        >
          <span class="h-1 w-8 rounded-full bg-zain-accent/50" />
          <span class="text-xs font-semibold uppercase tracking-wider text-zain-sand">
            Site telemetry
          </span>
          <span
            v-if="store.activeAlerts.length"
            class="rounded bg-zain-alert/20 px-1.5 py-0.5 font-mono text-[10px] text-zain-alert-soft"
          >
            {{ store.activeAlerts.length }}
          </span>
          <span
            class="ml-auto text-zain-accent-bright transition-transform"
            :class="sheetOpen && 'rotate-180'"
          >
            ▴
          </span>
        </button>
        <div
          class="overflow-y-auto transition-[max-height] duration-500 ease-in-out"
          :class="sheetOpen ? 'max-h-[60dvh]' : 'max-h-0'"
        >
          <PropertyPanel />
        </div>
      </div>
    </div>
  </div>
</template>
