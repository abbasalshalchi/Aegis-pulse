<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { formatValue, useTowerStore } from '~/stores/tower'
import {
  CLIPS_AVAILABLE,
  PRELOAD_CLIPS,
  STAGE_ASPECT_H,
  STAGE_ASPECT_W,
  STILLS_AVAILABLE,
  clipUrl,
  stillFor,
} from '~/assets/tower-scene.js'

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
  bts: { origin: '360px 580px', scale: 2.2 },
  generator: { origin: '424px 600px', scale: 2.2 },
}

// The overlay coordinate space follows whichever artwork is on screen, so the
// leader-line/dot sizes scale with it.
const VIEW_W = STILLS_AVAILABLE ? 1920 : 500
const VIEW_H = STILLS_AVAILABLE ? 1080 : 700
const DOT_R = STILLS_AVAILABLE ? 14 : 4
const DOT_CORE = STILLS_AVAILABLE ? 6 : 1.8
const LINE_W = STILLS_AVAILABLE ? 4 : 1.2
const LINE_DASH = STILLS_AVAILABLE ? '18 14' : '5 4'

// dot  = leader-line end on the structure (screen space, after zoom)
// card = connection point of the floating card; side = which way it extends

// Placeholder art (viewBox 500x700)
const PLACEHOLDER_GEOMETRY = {
  overview: {
    mast: { dot: { x: 250, y: 158 }, card: { x: 322, y: 95 }, side: 'right' },
    bts: { dot: { x: 362, y: 566 }, card: { x: 408, y: 462 }, side: 'right' },
    generator: { dot: { x: 424, y: 600 }, card: { x: 300, y: 668 }, side: 'left' },
  },
  mast: {
    inclinometer: { dot: { x: 250, y: 339 }, card: { x: 322, y: 225 }, side: 'right' },
    accelerometer: { dot: { x: 250, y: 528 }, card: { x: 185, y: 462 }, side: 'left' },
  },
  bts: {
    dht: { dot: { x: 298, y: 523 }, card: { x: 208, y: 430 }, side: 'left' },
    power: { dot: { x: 298, y: 587 }, card: { x: 204, y: 565 }, side: 'left' },
    door: { dot: { x: 362, y: 580 }, card: { x: 452, y: 540 }, side: 'right' },
  },
  generator: {
    fuel: { dot: { x: 424, y: 604 }, card: { x: 350, y: 660 }, side: 'left' },
    gate: { dot: { x: 120, y: 590 }, card: { x: 64, y: 470 }, side: 'right' },
    pir: { dot: { x: 180, y: 545 }, card: { x: 214, y: 430 }, side: 'right' },
  },
}

// Blender stills (viewBox 1920x1080). Derived from each still's
// data-component groups — nudge these to taste.
const STILL_GEOMETRY = {
  overview: {
    mast: { dot: { x: 957, y: 216 }, card: { x: 657, y: 96 }, side: 'left' },
    bts: { dot: { x: 780, y: 749 }, card: { x: 480, y: 629 }, side: 'left' },
    generator: { dot: { x: 1150, y: 686 }, card: { x: 1450, y: 566 }, side: 'right' },
  },
  mast: {
    inclinometer: { dot: { x: 985, y: 428 }, card: { x: 1285, y: 308 }, side: 'right' },
    accelerometer: { dot: { x: 985, y: 819 }, card: { x: 1285, y: 699 }, side: 'right' },
  },
  bts: {
    dht: { dot: { x: 860, y: 297 }, card: { x: 560, y: 177 }, side: 'left' },
    power: { dot: { x: 860, y: 734 }, card: { x: 560, y: 614 }, side: 'left' },
    door: { dot: { x: 1028, y: 615 }, card: { x: 1328, y: 495 }, side: 'right' },
  },
  generator: {
    fuel: { dot: { x: 987, y: 489 }, card: { x: 1287, y: 369 }, side: 'right' },
    // The generator view shows no distinct gate/PIR geometry — these two are
    // placed by eye on the fence. Colour them in the source SVG for exact anchors.
    gate: { dot: { x: 1620, y: 700 }, card: { x: 1400, y: 840 }, side: 'left' },
    pir: { dot: { x: 1660, y: 200 }, card: { x: 1420, y: 120 }, side: 'left' },
  },
}

const OVERLAY_GEOMETRY = STILLS_AVAILABLE ? STILL_GEOMETRY : PLACEHOLDER_GEOMETRY

// Click targets shown in the full view, one or more boxes per section. For the
// stills these are the measured data-component bounds (mast box also covers the
// dish + sector antennas); drawn last-wins, so bts/generator take any overlap.
const SECTION_HOTSPOTS = STILLS_AVAILABLE
  ? [
      { section: 'mast', x: 837, y: 23, w: 238, h: 869 },
      { section: 'bts', x: 685, y: 630, w: 191, h: 294 },
      { section: 'generator', x: 1024, y: 576, w: 252, h: 244 },
    ]
  : [
      { section: 'mast', x: 200, y: 70, w: 100, h: 480 },
      { section: 'bts', x: 315, y: 535, w: 88, h: 90 },
      { section: 'generator', x: 398, y: 572, w: 56, h: 53 },
      { section: 'generator', x: 50, y: 530, w: 220, h: 95 },
    ]

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
    left: `${(overlay.card.x / VIEW_W) * 100}%`,
    top: `${(overlay.card.y / VIEW_H) * 100}%`,
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

// --- Cinematic transitions -------------------------------------------------
// Resting states are pre-rendered vector line-art + a raster fill; the camera
// moves between them are pre-rendered clips (Blender). The clip plays over the
// stage, then we hard-cut to the destination still. While CLIPS_AVAILABLE is
// false the stage keeps the built-in placeholder art + CSS-zoom fallback so the
// app works before the exports land (see assets/tower-scene.js).
const stageAspect = STAGE_ASPECT_W / STAGE_ASPECT_H
const videoEl = ref(null)
const clipPlaying = ref(false)
const currentStill = ref(store.zoomedSection ?? 'full')
let safetyTimer = null

function preloadClips() {
  for (const url of PRELOAD_CLIPS) if (url) fetch(url).catch(() => {})
}

// Once the clip is actually rendering (covering the stage), swap the still
// underneath to the destination so its SVG is decoded before the clip ends —
// otherwise the outgoing still flashes for a frame as the video hides.
function onClipPlaying() {
  currentStill.value = store.transition.to ?? store.zoomedSection ?? 'full'
}

function playTransition() {
  const clip = CLIPS_AVAILABLE ? clipUrl(store.transition.from, store.transition.to) : null
  const video = videoEl.value
  if (clip && video) {
    clipPlaying.value = true
    video.src = clip
    video.addEventListener('playing', onClipPlaying, { once: true })
    video.addEventListener('ended', finishTransition, { once: true })
    video.addEventListener('error', finishTransition, { once: true })
    video.play().catch(finishTransition)
    safetyTimer = setTimeout(finishTransition, 6000) // clip stalled / never ends
  } else {
    // No clip: let the CSS transform settle, then resolve (placeholder path).
    safetyTimer = setTimeout(finishTransition, TRANSITION_MS)
  }
}

function finishTransition() {
  clearTimeout(safetyTimer)
  const video = videoEl.value
  if (video) {
    video.removeEventListener('playing', onClipPlaying)
    video.removeEventListener('ended', finishTransition)
    video.removeEventListener('error', finishTransition)
  }
  currentStill.value = store.zoomedSection ?? 'full'
  clipPlaying.value = false
  if (store.transition.playing) store.finishTransition()
}

onMounted(() => {
  if (CLIPS_AVAILABLE) preloadClips()
  watch(
    () => store.transition.playing,
    (playing) => {
      if (playing) playTransition()
    },
    { immediate: true },
  )
})
</script>

<template>
  <div
    class="relative flex h-full w-full items-center justify-center pb-20 lg:p-0 [container-type:size]"
  >
    <div
      class="relative"
      :style="{
        aspectRatio: `${STAGE_ASPECT_W} / ${STAGE_ASPECT_H}`,
        width: `min(100cqw, calc(${stageAspect} * 100cqh))`,
      }"
    >
      <!-- Static resting state: one self-contained themed vector SVG -->
      <img
        v-if="STILLS_AVAILABLE"
        :src="stillFor(currentStill)"
        alt=""
        class="pointer-events-none absolute inset-0 h-full w-full object-contain"
      />

      <svg
        v-if="!STILLS_AVAILABLE"
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

        </g>
      </svg>

      <!-- Section click targets (full view only), in the active artwork space -->
      <svg
        v-if="!store.zoomedSection && !store.transition.playing"
        :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
        class="pointer-events-none absolute inset-0 h-full w-full"
      >
        <rect
          v-for="(spot, i) in SECTION_HOTSPOTS"
          :key="`${spot.section}-${i}`"
          :x="spot.x"
          :y="spot.y"
          :width="spot.w"
          :height="spot.h"
          :rx="STILLS_AVAILABLE ? 14 : 6"
          class="pointer-events-auto cursor-pointer fill-zain-accent/0 transition-colors hover:fill-zain-accent/10"
          :class="highlightedSection === spot.section && 'fill-zain-accent/10'"
          @click="store.zoomIntoSection(spot.section)"
          @mouseenter="store.setHoveredComponent(spot.section)"
          @mouseleave="store.setHoveredComponent(null)"
        />
      </svg>

      <!-- Leader lines + anchor dots, in whichever artwork's coordinate space -->
      <svg
        v-if="!store.transition.playing"
        :key="`leads-${viewKey}`"
        :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
        class="pointer-events-none absolute inset-0 h-full w-full"
      >
        <!-- Each mark gets a dark halo first so it stays legible on any fill
             (the door fill and the 'ok' status colour are the same green). -->
        <g v-for="overlay in overlays" :key="overlay.id">
          <line
            :x1="overlay.dot.x"
            :y1="overlay.dot.y"
            :x2="overlay.card.x"
            :y2="overlay.card.y"
            stroke="#102B30"
            stroke-opacity="0.85"
            :stroke-width="LINE_W * 2.4"
            :stroke-dasharray="LINE_DASH"
          />
          <line
            :x1="overlay.dot.x"
            :y1="overlay.dot.y"
            :x2="overlay.card.x"
            :y2="overlay.card.y"
            :stroke="STROKE[overlay.status]"
            stroke-opacity="0.85"
            :stroke-width="LINE_W"
            :stroke-dasharray="LINE_DASH"
          />
          <circle
            :cx="overlay.dot.x"
            :cy="overlay.dot.y"
            :r="DOT_R"
            fill="none"
            stroke="#102B30"
            stroke-opacity="0.85"
            :stroke-width="LINE_W * 2.6"
          />
          <circle
            :cx="overlay.dot.x"
            :cy="overlay.dot.y"
            :r="DOT_R"
            fill="none"
            :stroke="STROKE[overlay.status]"
            :stroke-width="LINE_W"
            class="animate-pulse-dot"
          />
          <circle
            :cx="overlay.dot.x"
            :cy="overlay.dot.y"
            :r="DOT_CORE"
            :fill="STROKE[overlay.status]"
            stroke="#102B30"
            :stroke-width="LINE_W * 0.8"
          />
        </g>
      </svg>

      <!-- Transition clip player: covers the stage while a clip plays, then we
           hard-cut to the destination still underneath (seamless if the clip's
           last frame matches it). Hidden/idle when no clip is playing. -->
      <video
        ref="videoEl"
        v-show="clipPlaying"
        class="pointer-events-none absolute inset-0 h-full w-full object-contain"
        muted
        playsinline
        preload="auto"
        disablepictureinpicture
      />

      <!-- Floating overlay cards (HTML, registered to the SVG coordinates).
           Placeholder-only until OVERLAY_GEOMETRY is retuned to the real art. -->
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

      <!-- Transition veil (fallback path only — hidden while a clip is playing) -->
      <div
        v-if="store.transition.playing && !clipPlaying"
        class="absolute inset-0 grid place-items-center"
      >
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
