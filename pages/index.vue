<script setup>
import { computed, ref } from 'vue'
import { navigateTo } from '#imports'
import { useTowerStore } from '~/stores/tower'

// ---------------------------------------------------------------------------
// Map View — schematic placeholder.
// The abstract Iraq outline + CSS scale transform stand in for the real SVG
// map and the Blender-exported map→tower transition. Marker coordinates live
// in the store (viewBox 0 0 100 120), so swapping the artwork won't touch the
// interaction logic.
// ---------------------------------------------------------------------------

const store = useTowerStore()
store.leaveTower() // returning from a tower view resets the drill-down

const hoveredId = ref(null) // hover sync between map markers and the list card

const IRAQ_PATH =
  'M34 6 L56 4 L66 12 L68 22 L62 30 L72 44 L66 58 L78 74 L86 92 L84 104 L74 106 L64 96 L52 102 L38 88 L22 66 L12 48 L16 30 L26 12 Z'

const ZOOM = 2.4
const STROKE = { ok: '#5FA98D', warning: '#F2D0A4', critical: '#C03221' }

const zoomStyle = computed(() => {
  if (!store.activeState) return { transform: 'scale(1)', transformOrigin: '50px 60px' }
  const { x, y } = store.activeState.map
  return { transform: `scale(${ZOOM})`, transformOrigin: `${x}px ${y}px` }
})

// Markers render outside the zoomed landmass group so they keep their size;
// project their positions manually when a governorate is active.
function projected(point) {
  if (!store.activeState) return point
  const origin = store.activeState.map
  return { x: origin.x + ZOOM * (point.x - origin.x), y: origin.y + ZOOM * (point.y - origin.y) }
}

const listItems = computed(() => {
  if (store.activeState) {
    return store.towersInActiveState.map((tower) => ({
      kind: 'tower',
      id: tower.id,
      label: tower.name,
      meta: tower.id,
      status: store.towerStatus(tower),
    }))
  }
  return store.states.map((state) => ({
    kind: 'state',
    id: state.id,
    label: state.name,
    meta: `${store.towers.filter((t) => t.stateId === state.id).length} site(s)`,
    status: store.stateStatus(state.id),
  }))
})

function openItem(item) {
  if (item.kind === 'state') store.selectState(item.id)
  else navigateTo(`/tower/${item.id}`)
}
</script>

<template>
  <div class="relative h-full w-full">
    <section
      class="flex h-full w-full items-center justify-center p-4 pb-40 sm:pb-6 [container-type:size]"
    >
      <div class="relative aspect-[5/6] w-[min(100cqw,83.3cqh)]">
        <svg viewBox="0 0 100 120" class="h-full w-full select-none" role="img" aria-label="Network map of Iraq">
          <defs>
            <pattern id="mapgrid" width="6" height="6" patternUnits="userSpaceOnUse">
              <path d="M6 0H0V6" fill="none" stroke="#3F826D" stroke-opacity="0.14" stroke-width="0.3" />
            </pattern>
          </defs>

          <!-- Landmass (zooms on governorate select) -->
          <g
            class="transition-transform duration-700 ease-out [transform-box:view-box]"
            :style="zoomStyle"
          >
            <path :d="IRAQ_PATH" class="fill-zain-dark-raised stroke-zain-accent/60" stroke-width="0.6" />
            <path :d="IRAQ_PATH" fill="url(#mapgrid)" />
          </g>

          <!-- Governorate markers -->
          <g v-if="!store.activeState">
            <g
              v-for="state in store.states"
              :key="state.id"
              class="cursor-pointer"
              @click="store.selectState(state.id)"
              @mouseenter="hoveredId = state.id"
              @mouseleave="hoveredId = null"
            >
              <circle
                :cx="state.map.x"
                :cy="state.map.y"
                :r="hoveredId === state.id ? 4.2 : 3"
                fill="none"
                class="stroke-zain-accent-bright transition-all"
                stroke-width="0.5"
              />
              <circle :cx="state.map.x" :cy="state.map.y" r="1.2" class="fill-zain-sand" />
              <circle
                v-if="store.stateStatus(state.id) !== 'ok'"
                :cx="state.map.x + 3"
                :cy="state.map.y - 3"
                r="1.1"
                class="animate-pulse-dot"
                :fill="STROKE[store.stateStatus(state.id)]"
              />
              <text
                :x="state.map.x"
                :y="state.map.y + 7.5"
                text-anchor="middle"
                class="fill-zain-light/70 uppercase"
                style="font-size: 2.8px; letter-spacing: 0.08em"
              >
                {{ state.name }}
              </text>
            </g>
          </g>

          <!-- Tower markers within the zoomed governorate -->
          <g v-else>
            <g
              v-for="tower in store.towersInActiveState"
              :key="tower.id"
              class="cursor-pointer"
              :transform="`translate(${projected(tower.map).x} ${projected(tower.map).y})`"
              @click="navigateTo(`/tower/${tower.id}`)"
              @mouseenter="hoveredId = tower.id"
              @mouseleave="hoveredId = null"
            >
              <circle
                v-if="store.towerStatus(tower) !== 'ok'"
                r="5"
                fill="none"
                :stroke="STROKE[store.towerStatus(tower)]"
                stroke-width="0.4"
                class="animate-pulse-dot"
              />
              <path
                d="M0 -4.4 L-3 3.6 H3 Z"
                fill="none"
                :stroke="STROKE[store.towerStatus(tower)]"
                :stroke-width="hoveredId === tower.id ? 1 : 0.6"
                class="transition-all"
              />
              <text
                y="7.5"
                text-anchor="middle"
                class="fill-zain-light/80"
                style="font-size: 2.4px; letter-spacing: 0.05em"
              >
                {{ tower.id }}
              </text>
            </g>
          </g>
        </svg>
      </div>
    </section>

    <!-- Scope chip -->
    <div class="absolute left-4 top-4 flex items-center gap-2">
      <button
        v-if="store.activeState"
        type="button"
        class="rounded border border-zain-accent/40 bg-zain-dark-raised px-2 py-1 text-[10px] uppercase tracking-wider text-zain-sand transition-colors hover:border-zain-accent"
        @click="store.clearState()"
      >
        ◂ All governorates
      </button>
      <span class="font-mono text-[10px] uppercase tracking-[0.25em] text-zain-light/50">
        {{ store.activeState ? store.activeState.name : 'Network map — Iraq' }}
      </span>
    </div>

    <!-- Synchronized list card (same data as the markers) -->
    <aside
      class="absolute bottom-4 left-4 w-72 max-w-[calc(100%-2rem)] overflow-hidden rounded-lg border border-zain-accent/25 bg-zain-dark-raised/90 backdrop-blur"
    >
      <header class="border-b border-zain-accent/15 px-3 py-2">
        <p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-zain-accent-bright">
          {{ store.activeState ? `${store.activeState.name} — sites` : 'Governorates' }}
        </p>
      </header>
      <ul class="max-h-48 overflow-y-auto">
        <li v-for="item in listItems" :key="item.id">
          <button
            type="button"
            class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors"
            :class="hoveredId === item.id ? 'bg-zain-accent/15' : 'hover:bg-zain-accent/10'"
            @mouseenter="hoveredId = item.id"
            @mouseleave="hoveredId = null"
            @click="openItem(item)"
          >
            <span class="status-dot" :class="`status-dot--${item.status}`" />
            <span class="min-w-0">
              <span class="block truncate text-zain-light/90">{{ item.label }}</span>
              <span class="block font-mono text-[10px] text-zain-light/40">{{ item.meta }}</span>
            </span>
            <span class="ml-auto text-zain-accent-bright">▸</span>
          </button>
        </li>
      </ul>
    </aside>
  </div>
</template>
