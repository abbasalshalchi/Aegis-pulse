// Static pieces of the Gemini analysis call: the system instruction, the
// response schema, a couple of helpers to shape the volatile payload, and a
// validator. Everything here is a STABLE PREFIX — no timestamps or per-request
// values are baked in, so identical telemetry produces an identical prompt (and
// so the server-side cache in analysis.post.js can actually hit).

// The escalation rules live here explicitly; we do not rely on the model to
// infer the weather↔telemetry correlations.
export const SYSTEM_INSTRUCTION = `You are a NOC analyst for a GSM tower network in Iraq. You receive current sensor
telemetry and a local weather forecast. Produce a triage summary.

Escalate to "urgent" when ANY of these hold:
- inclinometer.value exceeds detail.thresholdDeg, AND forecast wind gust > 60 km/h
- inclinometer status is critical, regardless of weather
- fuel detail.autonomyHrs < 24, AND forecast shows precipitation or a dust storm
  that could block resupply access
- dht.value is within 3 °C of detail.thresholdC, AND forecast ambient max > 45 °C
- gate or door reads OPEN, AND pir.value is elevated versus the network baseline

Escalate to "attention" when:
- any component status is "critical" without a compounding weather factor
- accelerometer.value exceeds detail.thresholdG, or forecast gusts > 60 km/h with
  accelerometer already above baseline
- fuel.value is below detail.thresholdPct with no weather factor
- any warning-status reading whose value has crossed its own threshold — e.g.
  dht.value over detail.thresholdC — with no compounding weather factor

Use "monitor" ONLY for warning-status components that have NOT crossed a numeric
threshold (an expected reed-switch/door state, or a mildly elevated event count,
or a value still below its threshold), with no compounding factor. A reading that
has already exceeded its own threshold is at least "attention".

Set weatherLinked: true ONLY when the forecast changed the severity you assigned.
Order alerts by severity: urgent first, then attention, then monitor.
Do not invent readings. If weather data is absent, assign severity from telemetry
alone and set weatherLinked: false everywhere.
Reference towers by their id and name exactly as given.

Write the summary in 2-3 sentences, in a NOC shift-handover tone. The component
field must be the component id. Keep cause and recommendedAction to one sentence
each; recommendedAction must be concretely actionable.`

// Schema handed to Gemini (generationConfig.responseSchema) AND used to validate
// the parsed reply before we trust it.
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    overallState: { type: 'string', enum: ['stable', 'degraded', 'critical'] },
    summary: { type: 'string' },
    alerts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          towerId: { type: 'string' },
          towerName: { type: 'string' },
          severity: { type: 'string', enum: ['urgent', 'attention', 'monitor'] },
          component: { type: 'string' },
          cause: { type: 'string' },
          recommendedAction: { type: 'string' },
          weatherLinked: { type: 'boolean' },
        },
        required: [
          'towerId',
          'towerName',
          'severity',
          'component',
          'cause',
          'recommendedAction',
          'weatherLinked',
        ],
      },
    },
  },
  required: ['overallState', 'summary', 'alerts'],
}

// Network PIR baseline for the "elevated versus the network baseline" rule —
// the mean of every tower's pir reading, so the model has something to compare
// against rather than guessing.
export function pirBaseline(towers) {
  const values = []
  for (const tower of towers) {
    for (const section of tower.sections ?? []) {
      for (const component of section.components ?? []) {
        if (component.id === 'pir' && typeof component.value === 'number') {
          values.push(component.value)
        }
      }
    }
  }
  if (!values.length) return null
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

// Compact, flat telemetry+weather snapshot for the user turn. Only the fields
// the escalation rules reference, to keep the token count (and cost) down.
export function buildSnapshot(towers, weatherByGov, weatherAvailable) {
  return {
    weatherAvailable,
    networkPirBaseline: pirBaseline(towers),
    towers: towers.map((tower) => ({
      id: tower.id,
      name: tower.name,
      governorate: tower.stateId,
      sla: tower.sla,
      weather: weatherByGov[tower.stateId] ?? null,
      components: (tower.sections ?? []).flatMap((section) =>
        (section.components ?? []).map((c) => ({
          section: section.id,
          id: c.id,
          label: c.label,
          metric: c.metric,
          value: c.value,
          unit: c.unit,
          status: c.status,
          detail: c.detail,
        })),
      ),
    })),
  }
}

// Guard the parsed reply against the schema shape before returning it, so a
// malformed answer surfaces as an error instead of rendering as an empty panel.
export function validateAnalysis(obj) {
  if (!obj || typeof obj !== 'object') return false
  if (!['stable', 'degraded', 'critical'].includes(obj.overallState)) return false
  if (typeof obj.summary !== 'string' || !obj.summary.trim()) return false
  if (!Array.isArray(obj.alerts)) return false

  const severities = ['urgent', 'attention', 'monitor']
  return obj.alerts.every(
    (a) =>
      a &&
      typeof a === 'object' &&
      typeof a.towerId === 'string' &&
      typeof a.towerName === 'string' &&
      severities.includes(a.severity) &&
      typeof a.component === 'string' &&
      typeof a.cause === 'string' &&
      typeof a.recommendedAction === 'string' &&
      typeof a.weatherLinked === 'boolean',
  )
}
