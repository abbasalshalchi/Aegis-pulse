<script setup>
import { computed, onMounted, watch } from 'vue'
import { formatValue, useTowerStore } from '~/stores/tower'

// ---------------------------------------------------------------------------
// Tower stage — placeholder implementation.
//
// The line-art tower + CSS scale transforms stand in for the Blender-exported
// SVG animations. When those land:
//   1. replace the contents of the "artwork" group with the export,
//   2. play the matching animation when store.transition.playing turns true,
//   3. call store.finishTransition() from the animation's `ended` event
//      instead of the timer at the bottom of this script,
//   4. retune OVERLAY_GEOMETRY to the new artwork's coordinates.
//
// Everything is drawn in viewBox 0 0 500 700. The wrapper div is forced to the
// same 5:7 aspect ratio via container-query units, so the HTML overlay cards
// (positioned in %) stay registered with the SVG coordinates at any size.
// ---------------------------------------------------------------------------

const store = useTowerStore()

const TRANSITION_MS = 750

// How the artwork group is scaled to fake the camera zoom per section
const SECTION_ZOOM = {
  mast: { origin: '250px 150px', scale: 2.1 },
  bts: { origin: '375px 585px', scale: 2.2 },
  perimeter: { origin: '250px 595px', scale: 1.7 },
}

// dot  = leader-line end on the structure (screen space, after zoom)
// card = connection point of the floating card; side = which way it extends
const OVERLAY_GEOMETRY = {
  overview: {
    mast: { dot: { x: 250, y: 158 }, card: { x: 322, y: 95 }, side: 'right' },
    bts: { dot: { x: 362, y: 566 }, card: { x: 408, y: 462 }, side: 'right' },
    perimeter: { dot: { x: 116, y: 597 }, card: { x: 60, y: 468 }, side: 'right' },
  },
  mast: {
    inclinometer: { dot: { x: 250, y: 339 }, card: { x: 322, y: 225 }, side: 'right' },
    accelerometer: { dot: { x: 250, y: 528 }, card: { x: 185, y: 462 }, side: 'left' },
  },
  bts: {
    dht: { dot: { x: 298, y: 523 }, card: { x: 208, y: 430 }, side: 'left' },
    power: { dot: { x: 298, y: 587 }, card: { x: 204, y: 565 }, side: 'left' },
    fuel: { dot: { x: 483, y: 620 }, card: { x: 350, y: 655 }, side: 'left' },
  },
  perimeter: {
    gate: { dot: { x: 30, y: 585 }, card: { x: 64, y: 470 }, side: 'right' },
    pir: { dot: { x: 131, y: 508 }, card: { x: 162, y: 425 }, side: 'right' },
    door: { dot: { x: 452, y: 522 }, card: { x: 345, y: 485 }, side: 'left' },
  },
}

const STROKE = { ok: '#5FA98D', warning: '#F2D0A4', critical: '#C03221' }

// Lattice cross-braces for the placeholder mast
const MAST_BRACES = (() => {
  const top = 170
  const base = 620
  const steps = 9
  const leftX = (y) => 235 - ((y - top) / (base - top)) * 19
  const rightX = (y) => 265 + ((y - top) / (base - top)) * 19
  const braces = []
  for (let i = 0; i < steps; i++) {
    const y1 = top + (i * (base - top)) / steps
    const y2 = top + ((i + 1) * (base - top)) / steps
    braces.push({ x1: leftX(y1), y1, x2: rightX(y2), y2 })
    braces.push({ x1: rightX(y1), y1, x2: leftX(y2), y2 })
  }
  return braces
})()

const FENCE_POSTS = [60, 100, 140, 180, 220, 260, 300, 340, 380, 420, 440]

const viewKey = computed(() => store.zoomedSection ?? 'overview')

const zoomStyle = computed(() => {
  const zoom = store.zoomedSection && SECTION_ZOOM[store.zoomedSection]
  return {
    transform: zoom ? `scale(${zoom.scale})` : 'scale(1)',
    transformOrigin: zoom ? zoom.origin : '250px 350px',
  }
})

// Live store data merged with the geometry for the current view: aggregate
// section cards in the overview, per-sensor cards when zoomed in.
const overlays = computed(() => {
  const geometry = OVERLAY_GEOMETRY[viewKey.value]
  const source =
    viewKey.value === 'overview'
      ? store.sectionSummaries
      : (store.visibleSections[0]?.components ?? [])
  return source.filter((item) => geometry[item.id]).map((item) => ({ ...item, ...geometry[item.id] }))
})

function cardStyle(overlay) {
  return {
    left: `${(overlay.card.x / 500) * 100}%`,
    top: `${(overlay.card.y / 700) * 100}%`,
    transform:
      overlay.side === 'left' ? 'translate(calc(-100% - 8px), -50%)' : 'translate(8px, -50%)',
  }
}

function onOverlayClick(overlay) {
  if (viewKey.value === 'overview') store.zoomIntoSection(overlay.id)
  else store.selectComponent(store.zoomedSection, overlay.id)
}

// Panel hover → highlight the matching structure/card on the stage
const highlightedSection = computed(() => {
  if (store.zoomedSection) return null
  const id = store.hoveredComponentId
  if (!id) return null
  if (store.sections.some((s) => s.id === id)) return id
  return store.sections.find((s) => s.components.some((c) => c.id === id))?.id ?? null
})

const scopeLabel = computed(() =>
  store.zoomedSection ? store.visibleSections[0]?.label : 'Full site view',
)

// Placeholder for the SVG animation's `ended` event: report the transition as
// resolved once the CSS transform settles. Client-only.
onMounted(() => {
  watch(
    () => store.transition.playing,
    (playing) => {
      if (playing) setTimeout(() => store.finishTransition(), TRANSITION_MS)
    },
    { immediate: true },
  )
})
</script>

<template>
  <div
    class="relative flex h-full w-full items-center justify-center p-3 pb-20 lg:p-6 [container-type:size]"
  >
    <div class="relative aspect-[5/7] w-[min(100cqw,71.4cqh)]">
      <svg
        viewBox="0 0 500 700"
        class="h-full w-full select-none"
        role="img"
        :aria-label="`Schematic of ${store.activeTower?.name}`"
      >
        <defs>
          <pattern id="techgrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="#3F826D" stroke-opacity="0.07" />
          </pattern>
        </defs>
        <rect width="500" height="700" fill="url(#techgrid)" />

        <!-- ═══ Placeholder artwork (replace with Blender SVG export) ═══ -->
        <g
          class="transition-transform duration-700 ease-in-out [transform-box:view-box]"
          :style="zoomStyle"
        >
          <!-- ground -->
          <line x1="40" y1="620" x2="460" y2="620" class="stroke-zain-accent/50" stroke-width="1.5" />

          <!-- perimeter fence, gate, PIR -->
          <g>
            <line
              v-for="x in FENCE_POSTS"
              :key="x"
              :x1="x"
              y1="572"
              :x2="x"
              y2="620"
              class="stroke-zain-accent/50"
              stroke-width="1.2"
            />
            <line x1="60" y1="578" x2="440" y2="578" class="stroke-zain-accent/40" stroke-width="1" />
            <line x1="60" y1="600" x2="440" y2="600" class="stroke-zain-accent/40" stroke-width="1" />
            <line x1="100" y1="566" x2="100" y2="620" class="stroke-zain-sand/70" stroke-width="1.5" />
            <line x1="140" y1="566" x2="140" y2="620" class="stroke-zain-sand/70" stroke-width="1.5" />
            <line x1="100" y1="578" x2="140" y2="600" class="stroke-zain-sand/70" stroke-width="1.2" />
            <!-- PIR head on its pole -->
            <line x1="180" y1="620" x2="180" y2="549" class="stroke-zain-sand/50" stroke-width="1.5" />
            <rect x="174" y="540" width="12" height="9" rx="2" class="fill-zain-accent/40 stroke-zain-accent" stroke-width="1" />
            <path d="M186 549 q14 6 18 20" fill="none" class="stroke-zain-accent/40" stroke-dasharray="2 3" />
          </g>

          <!-- mast lattice + antenna head -->
          <g>
            <line x1="235" y1="170" x2="216" y2="620" class="stroke-zain-sand/70" stroke-width="2" />
            <line x1="265" y1="170" x2="284" y2="620" class="stroke-zain-sand/70" stroke-width="2" />
            <line
              v-for="(brace, i) in MAST_BRACES"
              :key="i"
              v-bind="brace"
              class="stroke-zain-sand/30"
              stroke-width="1"
            />
            <line x1="250" y1="80" x2="250" y2="170" class="stroke-zain-sand/70" stroke-width="2.5" />
            <rect x="236" y="96" width="7" height="30" rx="1.5" class="fill-zain-accent/30 stroke-zain-accent" stroke-width="1" />
            <rect x="257" y="96" width="7" height="30" rx="1.5" class="fill-zain-accent/30 stroke-zain-accent" stroke-width="1" />
            <rect x="246.5" y="88" width="7" height="30" rx="1.5" class="fill-zain-accent/30 stroke-zain-accent" stroke-width="1" />
            <circle cx="266" cy="150" r="8" fill="none" class="stroke-zain-accent/80" stroke-width="1.2" />
            <circle cx="250" cy="76" r="3" class="animate-pulse-dot fill-zain-alert" />
            <!-- inclinometer + accelerometer device boxes -->
            <rect x="243" y="235" width="14" height="10" rx="1.5" class="fill-zain-dark-raised stroke-zain-sand/70" stroke-width="1" />
            <rect x="244" y="325" width="12" height="10" rx="1.5" class="fill-zain-dark-raised stroke-zain-sand/70" stroke-width="1" />
          </g>

          <!-- BTS cabinet + fuel tank -->
          <g>
            <rect x="320" y="540" width="80" height="80" rx="3" class="fill-zain-dark-raised stroke-zain-sand/70" stroke-width="2" />
            <line x1="368" y1="544" x2="368" y2="616" class="stroke-zain-sand/40" stroke-width="1" />
            <circle cx="362" cy="580" r="1.5" class="fill-zain-sand/70" />
            <line x1="328" y1="552" x2="352" y2="552" class="stroke-zain-accent/60" stroke-width="1" />
            <line x1="328" y1="557" x2="352" y2="557" class="stroke-zain-accent/60" stroke-width="1" />
            <line x1="328" y1="562" x2="352" y2="562" class="stroke-zain-accent/60" stroke-width="1" />
            <rect x="328" y="570" width="24" height="8" rx="1" fill="none" class="stroke-zain-accent/50" stroke-width="1" />
            <rect x="328" y="584" width="24" height="8" rx="1" fill="none" class="stroke-zain-accent/50" stroke-width="1" />
            <rect x="405" y="588" width="38" height="32" rx="2" fill="none" class="stroke-zain-sand/50" stroke-width="1.5" />
            <line x1="424" y1="588" x2="424" y2="582" class="stroke-zain-sand/50" stroke-width="1.5" />
          </g>

          <!-- clickable section hotspots (overview only) -->
          <g v-if="!store.zoomedSection">
            <rect
              x="200" y="70" width="100" height="480" rx="6"
              class="cursor-pointer fill-zain-accent/0 transition-colors hover:fill-zain-accent/10"
              :class="highlightedSection === 'mast' && 'fill-zain-accent/10'"
              @click="store.zoomIntoSection('mast')"
            />
            <rect
              x="315" y="535" width="135" height="90" rx="6"
              class="cursor-pointer fill-zain-accent/0 transition-colors hover:fill-zain-accent/10"
              :class="highlightedSection === 'bts' && 'fill-zain-accent/10'"
              @click="store.zoomIntoSection('bts')"
            />
            <rect
              x="50" y="530" width="220" height="95" rx="6"
              class="cursor-pointer fill-zain-accent/0 transition-colors hover:fill-zain-accent/10"
              :class="highlightedSection === 'perimeter' && 'fill-zain-accent/10'"
              @click="store.zoomIntoSection('perimeter')"
            />
          </g>
        </g>

        <!-- Leader lines + anchor dots (screen space, drawn above the zoom) -->
        <g v-if="!store.transition.playing" :key="viewKey">
          <g v-for="overlay in overlays" :key="overlay.id">
            <line
              :x1="overlay.dot.x"
              :y1="overlay.dot.y"
              :x2="overlay.card.x"
              :y2="overlay.card.y"
              :stroke="STROKE[overlay.status]"
              stroke-opacity="0.7"
              stroke-width="1.2"
              stroke-dasharray="5 4"
            />
            <circle
              :cx="overlay.dot.x"
              :cy="overlay.dot.y"
              r="4"
              fill="none"
              :stroke="STROKE[overlay.status]"
              class="animate-pulse-dot"
            />
            <circle :cx="overlay.dot.x" :cy="overlay.dot.y" r="1.8" :fill="STROKE[overlay.status]" />
          </g>
        </g>
      </svg>

      <!-- Floating overlay cards (HTML, registered to the SVG coordinates) -->
      <div
        v-if="!store.transition.playing"
        :key="`cards-${viewKey}`"
        class="pointer-events-none absolute inset-0"
      >
        <div v-for="overlay in overlays" :key="overlay.id" class="absolute" :style="cardStyle(overlay)">
          <button
            type="button"
            class="overlay-card animate-fade-up pointer-events-auto text-left transition-colors hover:border-zain-accent"
            :class="
              (store.hoveredComponentId === overlay.id || highlightedSection === overlay.id) &&
              'border-zain-sand'
            "
            @mouseenter="store.setHoveredComponent(overlay.id)"
            @mouseleave="store.setHoveredComponent(null)"
            @click="onOverlayClick(overlay)"
          >
            <p class="flex items-center gap-1.5">
              <span class="status-dot" :class="`status-dot--${overlay.status}`" />
              <span class="truncate text-[10px] font-semibold uppercase tracking-wider text-zain-light/75">
                {{ overlay.label }}
              </span>
            </p>
            <p class="mt-1 font-mono text-base leading-none text-zain-sand">
              {{ formatValue(overlay) }}
              <span class="text-[10px] text-zain-light/45">{{ overlay.unit }}</span>
            </p>
            <p class="mt-1 truncate text-[9px] uppercase tracking-wide text-zain-accent-bright">
              {{ viewKey === 'overview' ? 'Click to inspect ▸' : overlay.metric }}
            </p>
          </button>
        </div>
      </div>

      <!-- Transition veil while an SVG animation "plays" -->
      <div v-if="store.transition.playing" class="absolute inset-0 grid place-items-center">
        <p class="animate-pulse-dot font-mono text-[10px] tracking-[0.3em] text-zain-accent-bright">
          RESOLVING VIEW…
        </p>
      </div>
    </div>

    <!-- Scope chip -->
    <div class="absolute left-4 top-4 flex items-center gap-2">
      <button
        v-if="store.zoomedSection"
        type="button"
        class="rounded border border-zain-accent/40 bg-zain-dark-raised px-2 py-1 text-[10px] uppercase tracking-wider text-zain-sand transition-colors hover:border-zain-accent"
        @click="store.zoomOut()"
      >
        ◂ Full tower
      </button>
      <span class="font-mono text-[10px] uppercase tracking-[0.25em] text-zain-light/50">
        {{ scopeLabel }}
      </span>
    </div>
  </div>
</template>
