/** Local calendar helpers and per-day workout lookup from session history. */

const WEEKDAYS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

export function toIsoDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayIso() {
  return toIsoDate(new Date())
}

export function shiftIsoDate(iso, deltaDays) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return toIsoDate(new Date(y, m - 1, d + Number(deltaDays)))
}

export function isTodayOrFuture(iso, today = todayIso()) {
  return String(iso) >= today
}

export function clampIsoToToday(iso, today = todayIso()) {
  return String(iso) > today ? today : String(iso)
}

/** Short label that fits an equal-width 44px-tall date button, e.g. "Do 19.11." */
export function formatDateShort(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const wd = WEEKDAYS_DE[date.getDay()]
  return `${wd} ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.`
}

function findWorkout(session, equipmentId) {
  return (session?.workouts || []).find((item) => item.equipmentId === equipmentId)
}

/**
 * Effective machine state as of a calendar day.
 * Ist-Sets come only from that exact day's session (otherwise 0).
 * kg, reps, minutes, meters and targetSets fall back to the latest
 * earlier record when the viewed day did not store them.
 */
export function getWorkoutAsOf(sessions, equipmentId, date) {
  const onOrBefore = [...(sessions || [])]
    .filter((session) => session && session.date && session.date <= date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))

  const sameDayWorkout = findWorkout(onOrBefore.find((session) => session.date === date), equipmentId) || null

  let kg = null
  let reps = null
  let minutes = null
  let meters = null
  let targetSets = null
  let sourceDate = null

  for (const session of onOrBefore) {
    const workout = findWorkout(session, equipmentId)
    if (!workout) continue
    if (!sourceDate) sourceDate = session.date
    if (kg == null && workout.kg != null) kg = workout.kg
    if (reps == null && workout.reps != null) reps = workout.reps
    if (minutes == null && workout.minutes != null) minutes = workout.minutes
    if (meters == null && workout.meters != null) meters = workout.meters
    if (targetSets == null && workout.targetSets != null) targetSets = workout.targetSets
  }

  return {
    equipmentId,
    fromExactDay: !!sameDayWorkout,
    sourceDate,
    kg,
    reps,
    minutes,
    meters,
    targetSets,
    sets: sameDayWorkout ? (sameDayWorkout.sets || 0) : 0,
    source: sameDayWorkout
  }
}
