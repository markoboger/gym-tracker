/**
 * Weight step (Δ) per machine for the kg pop-up.
 *
 * Derivation rule: walk the machine's recorded kg values in date order, drop repeats,
 * take every change |Δ| between consecutive distinct values (rounded to 0.5 kg, ignoring
 * changes > 25 kg as data errors) and use the most frequent one. Ties go to the smaller Δ
 * (finer step). Without any change in the history the fallback step is used.
 *
 * A manually chosen step (stepSizeManual) always wins over the derived one.
 * Legacy: a stored stepSize other than the old default 5 (set in the machine settings
 * dialog before this feature existed) also counts as manual.
 */

export const DEFAULT_KG_STEP = 5
export const MAX_PLAUSIBLE_STEP = 25
export const KG_STEP_OPTIONS = [0.5, 1, 1.25, 2, 2.5, 3, 4, 5, 6, 7, 7.5, 8, 9, 10, 12.5, 15, 20]

function roundStep(value) {
  return Math.round(value * 2) / 2
}

/** Distinct consecutive kg values for one machine, oldest first. */
export function kgHistory(sessions, equipmentId) {
  const values = []
  const sorted = [...(sessions || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  for (const session of sorted) {
    const workout = (session.workouts || []).find(w => w && w.equipmentId === equipmentId)
    const kg = workout?.kg
    if (typeof kg !== 'number' || !Number.isFinite(kg) || kg <= 0) continue
    if (values.length === 0 || values[values.length - 1] !== kg) values.push(kg)
  }
  return values
}

/** Most frequent |Δ| between consecutive distinct kg values, or null without history. */
export function deriveKgStep(sessions, equipmentId) {
  const values = kgHistory(sessions, equipmentId)
  const counts = new Map()
  for (let i = 1; i < values.length; i++) {
    const delta = roundStep(Math.abs(values[i] - values[i - 1]))
    if (delta <= 0 || delta > MAX_PLAUSIBLE_STEP) continue
    counts.set(delta, (counts.get(delta) || 0) + 1)
  }
  let best = null
  for (const [delta, count] of counts) {
    if (best === null || count > best.count || (count === best.count && delta < best.delta)) {
      best = { delta, count }
    }
  }
  return best ? best.delta : null
}

export function isManualStep(settings) {
  if (!settings) return false
  if (settings.stepSizeManual === true) return true
  if (settings.stepSizeManual === false) return false
  return typeof settings.stepSize === 'number' && settings.stepSize > 0 && settings.stepSize !== DEFAULT_KG_STEP
}

/** Fallback without history: 5 for multiples of 5, 2.5 for x.5 / 7.5 plates, else 1. */
export function fallbackKgStep(kg) {
  const value = Number(kg)
  if (!Number.isFinite(value) || value <= 0 || value % 5 === 0) return DEFAULT_KG_STEP
  if (value % 2.5 === 0) return 2.5
  return 1
}

/**
 * Effective step for a machine: manual setting > derived from history > stored/default.
 * Returns { step, derived, manual }. `fallback` is used when there is no history and no manual step.
 */
export function effectiveKgStep(settings, sessions, equipmentId, fallback = DEFAULT_KG_STEP) {
  const derived = deriveKgStep(sessions, equipmentId)
  const manual = isManualStep(settings)
  const stored = typeof settings?.stepSize === 'number' && settings.stepSize > 0 ? settings.stepSize : null
  const step = manual && stored ? stored : (derived ?? fallback)
  return { step, derived, manual: manual && !!stored }
}

/** Next/previous option for the Δ stepper (keeps unusual current values reachable). */
export function nextKgStep(current, direction) {
  const options = KG_STEP_OPTIONS.includes(current)
    ? KG_STEP_OPTIONS
    : [...KG_STEP_OPTIONS, current].sort((a, b) => a - b)
  const index = options.indexOf(current)
  const nextIndex = Math.min(options.length - 1, Math.max(0, index + (direction > 0 ? 1 : -1)))
  return options[nextIndex]
}

export function applyKgDelta(kg, delta) {
  return Math.max(0, Math.round(((Number(kg) || 0) + delta) * 10) / 10)
}

export function formatKg(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',')
}
