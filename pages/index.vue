<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { navigateTo } from '#imports'
import { useTowerStore } from '~/stores/tower'
import { IRAQ_GOVERNORATES, IRAQ_VIEWBOX } from '~/assets/iraq-geo.js'

// ---------------------------------------------------------------------------
// Map View — real Iraq governorate map (assets/iraq-geo.js, viewBox 0 0 1000
// 1000). Clicking a network governorate zooms into it and reveals its tower
// markers; a synchronized list card mirrors the same data.
//
// The source map is 1000×1000, so nothing here uses fixed pixel coordinates:
// each region's centroid and zoom factor come from the real path geometry via
// getBBox() at mount, and tower positions are a { u, v } fraction of their
// governorate's bounding box (store: tower.plot), projected the same way.
// ---------------------------------------------------------------------------

const store = useTowerStore()
store.leaveTower() // returning from a tower view resets the drill-down

const hoveredId = ref(null) // shared hover key (state id or tower id) with the list

const STROKE = { ok: '#5FA98D', warning: '#F2D0A4', critical: '#C03221' }
const NON_NETWORK_FILL = '#15373E' // zain-dark-raised
const FILL_ZOOM = 0.72 // fraction of the frame a zoomed governorate fills
const MAX_ZOOM = 6

// svgId → network state, for O(1) "is this region monitored?" lookups
const networkBySvg = computed(() =>
  Object.fromEntries(store.states.map((s) => [s.svgId, s])),
)

// --- Geometry derived from the real paths (client-only; needs layout) -------
const featuresEl = ref(null)
const geo = ref({}) // svgId → { x, y, w, h, cx, cy, scale }
const geoReady = ref(false)

function computeGeometry() {
  if (!featuresEl.value) return
  const next = {}
  for (const path of featuresEl.value.querySelectorAll('path[data-gov]')) {
    const b = path.getBBox()
    next[path.dataset.gov] = {
      x: b.x,
      y: b.y,
      w: b.width,
      h: b.height,
      cx: b.x + b.width / 2,
      cy: b.y + b.height / 2,
      scale: Math.min(MAX_ZOOM, Math.max(1, FILL_ZOOM * Math.min(1000 / b.width, 1000 / b.height))),
    }
  }
  geo.value = next
  geoReady.value = true
}

onMounted(() => nextTick(computeGeometry))

const activeGeo = computed(() =>
  store.activeState ? (geo.value[store.activeState.svgId] ?? null) : null,
)

// CSS transform that fakes the camera zoom onto the active governorate
const zoomStyle = computed(() => {
  const g = activeGeo.value
  if (!g) return { transform: 'scale(1)', transformOrigin: '500px 500px' }
  return { transform: `scale(${g.scale})`, transformOrigin: `${g.cx}px ${g.cy}px` }
})

// Project a base-viewBox point through the active zoom, so markers rendered
// outside the scaled group land on the right spot while keeping constant size.
function projected(point) {
  const g = activeGeo.value
  if (!g) return point
  return { x: g.cx + g.scale * (point.x - g.cx), y: g.cy + g.scale * (point.y - g.cy) }
}

// A tower's screen position: its { u, v } fraction of the governorate bbox,
// then projected through the zoom.
function towerPoint(tower) {
  const g = geo.value[store.activeState?.svgId]
  if (!g) return { x: 500, y: 500 }
  return projected({ x: g.x + tower.plot.u * g.w, y: g.y + tower.plot.v * g.h })
}

// --- Per-region styling -----------------------------------------------------
function isActive(gov) {
  return hoveredId.value === networkBySvg.value[gov.id]?.id || store.activeState?.svgId === gov.id
}

function fillFor(gov) {
  const state = networkBySvg.value[gov.id]
  return state ? STROKE[store.stateStatus(state.id)] : NON_NETWORK_FILL
}

function fillOpacityFor(gov) {
  if (!networkBySvg.value[gov.id]) return 0.55
  return isActive(gov) ? 0.42 : 0.2
}

function strokeFor(gov) {
  const state = networkBySvg.value[gov.id]
  return state ? STROKE[store.stateStatus(state.id)] : 'rgba(63, 130, 109, 0.35)'
}

function regionOpacity(gov) {
  // Fade the rest of the country once a governorate is in focus
  if (!store.activeState) return 1
  return store.activeState.svgId === gov.id ? 1 : 0.22
}

function onGovClick(gov) {
  const state = networkBySvg.value[gov.id]
  if (state) store.selectState(state.id)
}

// --- List card (mirrors the markers) ---------------------------------------
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
    <section class="flex h-full w-full items-center justify-center p-4 pb-40 sm:pb-6 [container-type:size]">
      <div class="relative aspect-square w-[min(100cqw,100cqh)]">
        <svg
          :viewBox="`0 0 ${IRAQ_VIEWBOX.width} ${IRAQ_VIEWBOX.height}`"
          class="h-full w-full select-none"
          role="img"
          aria-label="Network map of Iraq governorates"
        >
          <defs>
            <pattern id="mapgrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="#3F826D" stroke-opacity="0.08" stroke-width="1" />
            </pattern>
          </defs>
          <rect width="1000" height="1000" fill="url(#mapgrid)" />

          <!-- Landmass: real governorate paths, zooms into the active region -->
          <g
            ref="featuresEl"
            class="transition-transform duration-700 ease-out [transform-box:view-box]"
            :style="zoomStyle"
          >
            <path
              v-for="gov in IRAQ_GOVERNORATES"
              :key="gov.id"
              :d="gov.d"
              :data-gov="gov.id"
              vector-effect="non-scaling-stroke"
              :fill="fillFor(gov)"
              :fill-opacity="fillOpacityFor(gov)"
              :stroke="strokeFor(gov)"
              :stroke-width="networkBySvg[gov.id] ? 1.6 : 0.8"
              :opacity="regionOpacity(gov)"
              class="transition-all duration-300"
              :class="networkBySvg[gov.id] && 'cursor-pointer'"
              @click="onGovClick(gov)"
              @mouseenter="hoveredId = networkBySvg[gov.id]?.id ?? null"
              @mouseleave="hoveredId = null"
            >
              <title>{{ gov.name }}</title>
            </path>
          </g>

          <!-- Governorate markers (country view) -->
          <g v-if="geoReady && !store.activeState">
            <g
              v-for="state in store.states"
              :key="state.id"
              class="cursor-pointer"
              @click="store.selectState(state.id)"
              @mouseenter="hoveredId = state.id"
              @mouseleave="hoveredId = null"
            >
              <circle
                :cx="geo[state.svgId].cx"
                :cy="geo[state.svgId].cy"
                :r="hoveredId === state.id ? 13 : 9"
                fill="none"
                class="stroke-zain-sand transition-all"
                stroke-width="2"
              />
              <circle :cx="geo[state.svgId].cx" :cy="geo[state.svgId].cy" r="3.5" class="fill-zain-sand" />
              <circle
                v-if="store.stateStatus(state.id) !== 'ok'"
                :cx="geo[state.svgId].cx + 11"
                :cy="geo[state.svgId].cy - 11"
                r="4.5"
                class="animate-pulse-dot"
                :fill="STROKE[store.stateStatus(state.id)]"
              />
              <text
                :x="geo[state.svgId].cx"
                :y="geo[state.svgId].cy + 26"
                text-anchor="middle"
                class="fill-zain-light uppercase"
                style="font-size: 17px; letter-spacing: 0.12em; paint-order: stroke"
                stroke="#102B30"
                stroke-width="3"
              >
                {{ state.name }}
              </text>
            </g>
          </g>

          <!-- Tower markers (within the zoomed governorate) -->
          <g v-else-if="geoReady && store.activeState">
            <g
              v-for="tower in store.towersInActiveState"
              :key="tower.id"
              class="cursor-pointer"
              :transform="`translate(${towerPoint(tower).x} ${towerPoint(tower).y})`"
              @click="navigateTo(`/tower/${tower.id}`)"
              @mouseenter="hoveredId = tower.id"
              @mouseleave="hoveredId = null"
            >
              <circle
                v-if="store.towerStatus(tower) !== 'ok'"
                r="18"
                fill="none"
                :stroke="STROKE[store.towerStatus(tower)]"
                stroke-width="1.5"
                class="animate-pulse-dot"
              />
              <path
                d="M0 -16 L-11 13 H11 Z"
                fill="#102B30"
                :stroke="STROKE[store.towerStatus(tower)]"
                :stroke-width="hoveredId === tower.id ? 3.5 : 2"
                class="transition-all"
              />
              <circle cy="-2" r="3" :fill="STROKE[store.towerStatus(tower)]" />
              <text
                y="30"
                text-anchor="middle"
                class="fill-zain-light"
                style="font-size: 15px; letter-spacing: 0.05em; paint-order: stroke"
                stroke="#102B30"
                stroke-width="3"
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
      <ul class="no-scrollbar max-h-48 overflow-y-auto">
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
