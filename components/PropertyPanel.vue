<script setup>
import { formatValue, useTowerStore } from '~/stores/tower'

// Synchronized property panel: lists exactly what the spatial overlays show.
// Hovering a row highlights the matching part on the SVG stage; clicking a
// row plays the zoom-in for that section and expands the sensor's details.
const store = useTowerStore()

const STATUS_TEXT = { ok: 'Nominal', warning: 'Degraded', critical: 'Critical' }
const STATUS_CHIP = {
  ok: 'border-status-ok/40 bg-status-ok/10 text-status-ok',
  warning: 'border-status-warning/40 bg-status-warning/10 text-status-warning',
  critical: 'border-status-critical/40 bg-status-critical/10 text-status-critical',
}

function toggleSection(sectionId) {
  if (store.zoomedSection === sectionId) store.zoomOut()
  else store.zoomIntoSection(sectionId)
}

function detailEntries(component) {
  return Object.entries(component.detail).map(([key, value]) => [
    key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
    value === null ? '—' : String(value),
  ])
}
</script>

<template>
  <div v-if="store.activeTower">
    <header class="border-b border-zain-accent/15 px-4 py-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-mono text-[11px] text-zain-accent-bright">{{ store.activeTower.id }}</p>
          <h2 class="truncate text-sm font-semibold text-zain-sand">
            {{ store.activeTower.name }}
          </h2>
        </div>
        <span
          class="shrink-0 rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
          :class="STATUS_CHIP[store.towerStatus(store.activeTower)]"
        >
          {{ STATUS_TEXT[store.towerStatus(store.activeTower)] }}
        </span>
      </div>
      <p class="mt-1 text-[11px] text-zain-light/50">
        SLA {{ store.activeTower.sla }}% · {{ store.activeState?.name }}, Iraq
      </p>
    </header>

    <div>
      <section
        v-for="section in store.sections"
        :key="section.id"
        class="border-b-4 border-zain-dark last:border-b-0"
      >
        <!-- A tinted header bar clearly caps each section's sensor group -->
        <button
          type="button"
          class="flex w-full items-center gap-2 border-l-2 px-4 py-2.5 text-left transition-colors"
          :class="
            store.zoomedSection === section.id
              ? 'border-zain-accent bg-zain-accent/15'
              : 'border-transparent bg-zain-dark/50 hover:bg-zain-accent/10'
          "
          @click="toggleSection(section.id)"
        >
          <span class="status-dot" :class="`status-dot--${store.sectionStatus(section.id)}`" />
          <span class="text-xs font-bold uppercase tracking-wider text-zain-sand">
            {{ section.label }}
          </span>
          <span class="ml-auto font-mono text-[10px] text-zain-accent-bright">
            {{ store.zoomedSection === section.id ? '◤ zoomed · reset' : 'zoom ▸' }}
          </span>
        </button>

        <ul class="pb-2">
          <li v-for="component in section.components" :key="component.id">
            <button
              type="button"
              class="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors"
              :class="[
                store.hoveredComponentId === component.id
                  ? 'bg-zain-accent/15'
                  : 'hover:bg-zain-accent/10',
                store.selectedComponentId === component.id && 'bg-zain-accent/15',
              ]"
              @mouseenter="store.setHoveredComponent(component.id)"
              @mouseleave="store.setHoveredComponent(null)"
              @click="store.selectComponent(section.id, component.id)"
            >
              <span class="status-dot" :class="`status-dot--${component.status}`" />
              <span class="min-w-0">
                <span class="block truncate text-xs text-zain-light/90">{{ component.label }}</span>
                <span class="block text-[10px] text-zain-light/40">{{ component.metric }}</span>
              </span>
              <span class="ml-auto shrink-0 font-mono text-xs text-zain-sand">
                {{ formatValue(component) }}
                <span class="text-zain-light/40">{{ component.unit }}</span>
              </span>
            </button>

            <!-- Expanded detail readout for the selected sensor -->
            <dl
              v-if="store.selectedComponentId === component.id"
              class="mx-4 mb-2 rounded border border-zain-accent/15 bg-zain-dark/60 px-3 py-2"
            >
              <div
                v-for="[key, value] in detailEntries(component)"
                :key="key"
                class="flex items-baseline justify-between gap-3 py-0.5"
              >
                <dt class="text-[10px] uppercase tracking-wide text-zain-light/40">{{ key }}</dt>
                <dd class="font-mono text-[11px] text-zain-light/85">{{ value }}</dd>
              </div>
            </dl>
          </li>
        </ul>
      </section>
    </div>

    <footer class="px-4 py-3 text-[10px] leading-relaxed text-zain-light/35">
      Mock telemetry (Pinia seed). Production feed: MongoDB Atlas via
      <code class="text-zain-accent-bright">/server/api/towers</code>.
    </footer>
  </div>
</template>
