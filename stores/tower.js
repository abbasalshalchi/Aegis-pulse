// Central store for the NOC prototype.
//
// Holds (a) mock telemetry for every monitored site — the shape mirrors what
// /server/api/towers will eventually return from MongoDB Atlas — and (b) the
// view state that keeps the SVG stage and the property panel synchronized:
// active governorate/tower, zoomed section, hovered + selected component, and
// whether an SVG transition (Blender export) is currently playing.
import { defineStore } from 'pinia'
import { $fetch } from 'ofetch'

// Non-reactive guard so overlapping analysis requests (the 2s poll firing while a
// slow Gemini call is still in flight) collapse into one.
let analysisBusy = false

const STATUS_RANK = { ok: 0, warning: 1, critical: 2 }

export function worstStatus(items) {
  return items.reduce(
    (worst, item) => (STATUS_RANK[item.status] > STATUS_RANK[worst] ? item.status : worst),
    'ok',
  )
}

/** Compact display formatting for a sensor reading ({ value, unit }). */
export function formatValue({ value }) {
  if (typeof value !== 'number') return value
  if (Number.isInteger(value)) return String(value)
  return Math.abs(value) < 1 ? value.toFixed(2) : value.toFixed(1)
}

// ---------------------------------------------------------------------------
// Mock telemetry seed
// One healthy baseline per site, overridden per tower to author the demo
// scenarios (unauthorized access in Taji, low fuel in Basra, mast tilt alarm
// in Erbil). Section ids — 'mast' | 'bts' | 'generator' — are also the zoom
// targets used by the stage and the panel.
// ---------------------------------------------------------------------------

function baselineSections() {
  return [
    {
      id: 'mast',
      label: 'Main Mast Structure',
      components: [
        {
          id: 'inclinometer',
          label: 'Inclinometer',
          metric: 'Structural tilt',
          value: 0.4,
          unit: '°',
          status: 'ok',
          detail: { tiltX: 0.31, tiltY: -0.18, thresholdDeg: 1.5 },
        },
        {
          id: 'accelerometer',
          label: '3-Axis Accelerometer',
          metric: 'Vibration',
          value: 0.06,
          unit: 'g RMS',
          status: 'ok',
          detail: { peakG: 0.21, dominantHz: 4.2, thresholdG: 0.35 },
        },
      ],
    },
    {
      id: 'bts',
      label: 'BTS Cabinet',
      components: [
        {
          id: 'dht',
          label: 'Climate (DHT)',
          metric: 'Cabinet temperature',
          value: 27.4,
          unit: '°C',
          status: 'ok',
          detail: { humidityPct: 41, dewPointC: 13.2, thresholdC: 40 },
        },
        {
          id: 'power',
          label: 'DC Power',
          metric: 'Battery bus',
          value: 53.8,
          unit: 'V',
          status: 'ok',
          detail: { loadA: 12.4, chargePct: 96, rectifier: 'float' },
        },
        {
          id: 'door',
          label: 'Cabinet Door (Reed)',
          metric: 'Contact state',
          value: 'CLOSED',
          unit: '',
          status: 'ok',
          detail: { lastChange: '2026-07-12 09:40 UTC', workOrder: 'WO-8841' },
        },
      ],
    },
    {
      id: 'generator',
      label: 'Power Generator',
      components: [
        {
          id: 'fuel',
          label: 'Diesel Fuel (Ultrasonic)',
          metric: 'Tank level',
          value: 78,
          unit: '%',
          status: 'ok',
          detail: { litres: 936, autonomyHrs: 52, thresholdPct: 25 },
        },
        {
          id: 'gate',
          label: 'Main Gate (Reed)',
          metric: 'Contact state',
          value: 'CLOSED',
          unit: '',
          status: 'ok',
          detail: { lastChange: '2026-07-16 21:04 UTC', workOrder: null },
        },
        {
          id: 'pir',
          label: 'PIR Motion',
          metric: 'Events / 24 h',
          value: 2,
          unit: '',
          status: 'ok',
          detail: { lastEvent: '2026-07-17 02:12 UTC', armed: true },
        },
      ],
    },
  ]
}

function makeTower({ id, name, stateId, plot, sla = 99.9, overrides = {} }) {
  const sections = baselineSections()
  for (const section of sections) {
    for (const component of section.components) {
      const patch = overrides[component.id]
      if (patch) {
        Object.assign(component, patch, { detail: { ...component.detail, ...patch.detail } })
      }
    }
  }
  return { id, name, stateId, plot, sla, sections }
}

// Network governorates. `svgId` links to the real Iraq map path in
// assets/iraq-geo.js; the Map View derives each region's centroid and zoom
// from that path's geometry at runtime, so no pixel coordinates live here.
const STATES = [
  { id: 'erbil', name: 'Erbil', svgId: 'IQAR' },
  { id: 'anbar', name: 'Anbar', svgId: 'IQAN' },
  { id: 'baghdad', name: 'Baghdad', svgId: 'IQBG' },
  { id: 'najaf', name: 'Najaf', svgId: 'IQNA' },
  { id: 'basra', name: 'Basra', svgId: 'IQBA' },
]

// `plot` is a { u, v } fraction of the governorate's bounding box (0,0 = top-
// left, 1,1 = bottom-right); the Map View projects it onto the real geometry.
const TOWERS = [
  makeTower({
    id: 'TWR-BGW-014',
    name: 'Karrada Rooftop',
    stateId: 'baghdad',
    plot: { u: 0.52, v: 0.58 },
    sla: 99.94,
  }),
  makeTower({
    id: 'TWR-BGW-021',
    name: 'Taji Greenfield',
    stateId: 'baghdad',
    plot: { u: 0.4, v: 0.3 },
    sla: 99.71,
    overrides: {
      gate: {
        value: 'OPEN',
        status: 'warning',
        detail: { lastChange: '2026-07-17 05:47 UTC', workOrder: null },
      },
      pir: { value: 14, status: 'warning', detail: { lastEvent: '2026-07-17 05:52 UTC' } },
    },
  }),
  makeTower({
    id: 'TWR-BSR-007',
    name: 'Umm Qasr Port',
    stateId: 'basra',
    // Basra curves like a banana; the bbox centre/south falls outside its
    // border, so this sits in the landmass's thick interior (visual centre).
    plot: { u: 0.49, v: 0.36 },
    sla: 99.62,
    overrides: {
      fuel: { value: 22, status: 'warning', detail: { litres: 264, autonomyHrs: 14 } },
      dht: { value: 41.6, status: 'warning', detail: { humidityPct: 18, dewPointC: 12.9 } },
    },
  }),
  makeTower({
    id: 'TWR-EBL-003',
    name: 'Erbil Heights',
    stateId: 'erbil',
    plot: { u: 0.45, v: 0.5 },
    sla: 98.9,
    overrides: {
      inclinometer: { value: 2.1, status: 'critical', detail: { tiltX: 1.9, tiltY: 0.9 } },
      accelerometer: { value: 0.31, status: 'warning', detail: { peakG: 0.66, dominantHz: 1.1 } },
    },
  }),
  makeTower({
    id: 'TWR-ANB-011',
    name: 'Ramadi West',
    stateId: 'anbar',
    plot: { u: 0.72, v: 0.62 },
    sla: 99.88,
  }),
  makeTower({
    id: 'TWR-NJF-005',
    name: 'Kufa Road',
    stateId: 'najaf',
    plot: { u: 0.62, v: 0.32 },
    sla: 99.9,
  }),
]

export const useTowerStore = defineStore('tower', {
  state: () => ({
    states: STATES,
    towers: TOWERS,

    activeStateId: null,
    activeTowerId: null,

    // null = full-tower view, otherwise 'mast' | 'bts' | 'generator'
    zoomedSection: null,

    // True while an SVG transition (Blender export) plays. Overlays stay
    // hidden until the stage reports the animation has resolved. `from`/`to`
    // ('map' | 'full' | 'mast' | 'bts' | 'generator') pick the clip to play.
    transition: { playing: false, name: null, from: null, to: null },

    // Two-way hover/selection sync between the SVG stage and the panel
    hoveredComponentId: null,
    selectedComponentId: null,

    // Deep-link target set by the analysis panel, applied once the arrival
    // transition resolves (see the watcher in layouts/default.vue).
    pendingFocus: null,

    // AI triage from /api/analysis (Gemini). Populated by fetchAnalysis(); the
    // dashboard renders around it and never blocks on it.
    analysis: { data: null, loading: false, error: null, fetchedAt: null },
  }),

  getters: {
    activeState: (state) => state.states.find((s) => s.id === state.activeStateId) ?? null,
    activeTower: (state) => state.towers.find((t) => t.id === state.activeTowerId) ?? null,
    towersInActiveState: (state) => state.towers.filter((t) => t.stateId === state.activeStateId),

    sections() {
      return this.activeTower?.sections ?? []
    },

    // Sections whose sensors are currently on display (all of them in the
    // full-tower view, only the zoomed one otherwise).
    visibleSections() {
      return this.zoomedSection
        ? this.sections.filter((s) => s.id === this.zoomedSection)
        : this.sections
    },

    // One aggregate card per section for the full-tower spatial overlays:
    // worst status wins and provides the headline reading.
    sectionSummaries() {
      return this.sections.map((section) => {
        const status = worstStatus(section.components)
        const headline = section.components.find((c) => c.status === status) ?? section.components[0]
        return {
          id: section.id,
          label: section.label,
          status,
          value: headline.value,
          unit: headline.unit,
          metric: `${headline.label} · ${headline.metric}`,
        }
      })
    },

    sectionStatus() {
      return (sectionId) => {
        const section = this.sections.find((s) => s.id === sectionId)
        return section ? worstStatus(section.components) : 'ok'
      }
    },

    towerStatus: () => (tower) => worstStatus(tower.sections.flatMap((s) => s.components)),

    stateStatus() {
      return (stateId) =>
        worstStatus(
          this.towers
            .filter((t) => t.stateId === stateId)
            .map((t) => ({ status: this.towerStatus(t) })),
        )
    },

    activeAlerts() {
      return this.sections.flatMap((section) =>
        section.components
          .filter((c) => c.status !== 'ok')
          .map((c) => ({ ...c, sectionId: section.id, sectionLabel: section.label })),
      )
    },

    networkAlertCount: (state) =>
      state.towers
        .flatMap((t) => t.sections)
        .flatMap((s) => s.components)
        .filter((c) => c.status !== 'ok').length,

    // A stable string of every component's status. Watch THIS (not raw values)
    // to re-run the analysis only when a status actually flips — jitterTelemetry
    // drifts the numbers every tick but leaves statuses alone.
    statusSignature: (state) =>
      state.towers
        .flatMap((t) => t.sections.flatMap((s) => s.components.map((c) => `${t.id}:${c.id}:${c.status}`)))
        .join('|'),

    // Which section a component id lives in, for a given tower — lets the
    // analysis panel deep-link to a specific sensor. Null if not found.
    sectionForComponent: (state) => (towerId, componentId) => {
      const tower = state.towers.find((t) => t.id === towerId)
      return tower?.sections.find((s) => s.components.some((c) => c.id === componentId))?.id ?? null
    },
  },

  actions: {
    selectState(stateId) {
      this.activeStateId = stateId
    },

    clearState() {
      this.activeStateId = null
    },

    /** Entering a tower (map click or deep link). Returns false for unknown ids. */
    selectTower(towerId) {
      const tower = this.towers.find((t) => t.id === towerId)
      if (!tower) return false
      this.activeTowerId = tower.id
      this.activeStateId = tower.stateId
      this.zoomedSection = null
      this.selectedComponentId = null
      this.hoveredComponentId = null
      this.beginTransition('map-to-tower', 'map', 'full')
      return true
    },

    leaveTower() {
      this.activeTowerId = null
      this.zoomedSection = null
      this.selectedComponentId = null
      this.hoveredComponentId = null
      this.transition = { playing: false, name: null, from: null, to: null }
    },

    zoomIntoSection(sectionId) {
      if (this.zoomedSection === sectionId || this.transition.playing) return
      this.beginTransition(`zoom-${sectionId}`, this.zoomedSection ?? 'full', sectionId)
      this.zoomedSection = sectionId
    },

    zoomOut() {
      if (!this.zoomedSection || this.transition.playing) return
      this.beginTransition('zoom-out', this.zoomedSection, 'full')
      this.zoomedSection = null
      this.selectedComponentId = null
    },

    /** Panel row click: zoom the stage onto that section and select the sensor. */
    selectComponent(sectionId, componentId) {
      if (this.zoomedSection !== sectionId) this.zoomIntoSection(sectionId)
      this.selectedComponentId = this.selectedComponentId === componentId ? null : componentId
    },

    /**
     * Deep-link focus from the analysis panel (assumes the tower is already
     * active): zoom the stage into the component's section — unless we're mid-
     * transition, where zoomIntoSection is a no-op — and select it so the panel
     * expands its detail.
     */
    focusComponent(sectionId, componentId) {
      if (sectionId && this.zoomedSection !== sectionId && !this.transition.playing) {
        this.zoomIntoSection(sectionId)
      }
      this.selectedComponentId = componentId ?? null
    },

    setHoveredComponent(componentId) {
      this.hoveredComponentId = componentId
    },

    beginTransition(name, from = null, to = null) {
      this.transition = { playing: true, name, from, to }
    },

    /**
     * Called by the stage when the transition resolves — the clip's `ended`
     * event when a Blender export is present, otherwise a timer over the
     * placeholder CSS transform.
     */
    finishTransition() {
      this.transition = { playing: false, name: null, from: null, to: null }
    },

    /**
     * Post the current telemetry snapshot to /api/analysis and store the parsed
     * result. The Gemini call happens server-side (the key never reaches here),
     * and the server dedupes/caches, so calling this on mount + on status change
     * is cheap. Failures land in analysis.error; they never throw into the UI.
     */
    async fetchAnalysis(opts = {}) {
      // `silent` = a background poll: don't toggle the visible loading flag (no
      // skeleton/button flicker) and don't overwrite good data with a transient
      // error. The explicit Re-analyse button and the status watcher run loud.
      const silent = opts.silent === true
      const force = opts.force === true // Re-analyse: bypass the server cache
      if (analysisBusy) return
      analysisBusy = true
      if (!silent) {
        this.analysis.loading = true
        this.analysis.error = null
      }
      try {
        const data = await $fetch('/api/analysis', {
          method: 'POST',
          body: { towers: this.towers, force },
        })
        if (data?.error) throw new Error(data.error)
        this.analysis.data = data
        this.analysis.error = null
        this.analysis.fetchedAt = Date.now()
      } catch (err) {
        // Keep the last good analysis on a quiet poll failure; only surface an
        // error when it's loud, or when we've got nothing to show yet.
        if (!silent || !this.analysis.data) {
          this.analysis.error = err?.data?.error ?? err?.message ?? 'Analysis unavailable.'
        }
      } finally {
        analysisBusy = false
        if (!silent) this.analysis.loading = false
      }
    },

    /** Small random drift on numeric readings so the demo feels live. */
    jitterTelemetry() {
      for (const tower of this.towers) {
        for (const section of tower.sections) {
          for (const component of section.components) {
            if (typeof component.value !== 'number' || !component.unit) continue
            const drift = component.value * 0.01 * (Math.random() - 0.5)
            component.value = Math.round((component.value + drift) * 100) / 100
          }
        }
      }
    },
  },
})
