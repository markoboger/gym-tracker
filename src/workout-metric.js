/**
 * Per-machine primary unit: 'kg' (default) or 'min' (e.g. Rudern).
 * Session workouts keep both `kg` and `minutes` so existing data is never dropped.
 */

export function getEquipmentUnit(equipment) {
  return equipment?.unit || 'kg'
}

export function getWorkoutUnit(workout, equipmentList = []) {
  if (workout?.unit) return workout.unit
  const equipment = equipmentList.find((item) => item.id === workout?.equipmentId)
  return getEquipmentUnit(equipment)
}

export function getPrimaryField(unit) {
  return unit === 'min' ? 'minutes' : 'kg'
}

export function getPrimaryLabel(unit) {
  return unit === 'min' ? 'min' : 'kg'
}

export function getPrimaryValue(workout, equipmentList = []) {
  const unit = getWorkoutUnit(workout, equipmentList)
  const field = getPrimaryField(unit)
  const value = workout?.[field]
  return typeof value === 'number' ? value : 0
}

export function showSetsReps(workout) {
  return !workout?.isCardio && !workout?.isSauna && (workout?.sets || 0) > 0
}

export function initialMinutes(equipment, recent = null) {
  const unit = getEquipmentUnit(equipment)
  if (unit === 'min') {
    if (recent && recent.minutes != null && recent.minutes !== '') {
      return recent.minutes
    }
    return equipment.defaultMinutes ?? 10
  }
  if (equipment?.isCardio || equipment?.isSauna) {
    return recent ? (recent.minutes || 0) : 0
  }
  return null
}

/**
 * If a minutes-unit machine has a numeric kg value but no minutes yet,
 * copy kg → minutes. The original kg is kept so nothing is lost.
 * Returns true when any workout was updated.
 */
export function migrateSessionsUnits(sessions, equipmentList = []) {
  if (!Array.isArray(sessions)) return false

  const unitById = new Map(
    equipmentList.map((item) => [item.id, getEquipmentUnit(item)])
  )
  let changed = false

  for (const session of sessions) {
    for (const workout of session?.workouts || []) {
      const unit = workout.unit || unitById.get(workout.equipmentId) || 'kg'
      if (unit !== 'min') continue
      const minutesMissing = workout.minutes == null || workout.minutes === ''
      if (minutesMissing && typeof workout.kg === 'number' && workout.kg > 0) {
        workout.minutes = workout.kg
        changed = true
      }
    }
  }

  return changed
}
