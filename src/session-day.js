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


export const WEEKDAYS_MON_FIRST = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
]

/** A day counts as a training entry when any workout has recorded activity. */
export function sessionHasTrainingEntry(session) {
  return (session?.workouts || []).some((workout) => !!(
    workout.completed ||
    (workout.sets || 0) > 0 ||
    (workout.minutes || 0) > 0 ||
    (workout.meters || 0) > 0 ||
    workout.sollEdited ||
    (typeof workout.kg === 'number' && workout.kg > 0)
  ))
}

export function trainingDates(sessions, today = todayIso()) {
  const dates = new Set()
  for (const session of sessions || []) {
    if (session?.date && session.date <= today && sessionHasTrainingEntry(session)) {
      dates.add(session.date)
    }
  }
  return [...dates].sort()
}

export function previousTrainingDate(sessions, current, today = todayIso()) {
  const earlier = trainingDates(sessions, today).filter((date) => date < current)
  return earlier.length ? earlier[earlier.length - 1] : null
}

/**
 * Next training day after `current`, or today when there is no later entry
 * and today itself is still ahead (today is always reachable).
 */
export function nextTrainingDate(sessions, current, today = todayIso()) {
  if (current >= today) return null
  const later = trainingDates(sessions, today).filter((date) => date > current)
  return later.length ? later[0] : today
}

export function shiftMonth(year, month, delta) {
  const date = new Date(year, month + Number(delta), 1)
  return { year: date.getFullYear(), month: date.getMonth() }
}

export function formatMonthTitle(year, month) {
  return `${MONTHS_DE[month]} ${year}`
}

/** Monday-first 6×7 month grid. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - mondayOffset)
  const cells = []
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    cells.push({
      iso: toIsoDate(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month
    })
  }
  return cells
}
