import { describe, it, expect } from 'vitest'
import equipmentData from './data/equipment.json'
import {
  getEquipmentUnit,
  getWorkoutUnit,
  getPrimaryField,
  getPrimaryLabel,
  getPrimaryValue,
  showSetsReps,
  initialMinutes,
  migrateSessionsUnits
} from './workout-metric.js'

describe('workout-metric units', () => {
  it('defaults to kg when no unit is set', () => {
    expect(getEquipmentUnit({})).toBe('kg')
    expect(getEquipmentUnit(undefined)).toBe('kg')
    expect(getWorkoutUnit({ equipmentId: 999 }, equipmentData)).toBe('kg')
  })

  it('uses min for Rudern and kg for strength machines', () => {
    const rudern = equipmentData.find((item) => item.name === 'Rudern')
    const butterfly = equipmentData.find((item) => item.name.trim() === 'Butterfly')
    expect(rudern).toBeTruthy()
    expect(getEquipmentUnit(rudern)).toBe('min')
    expect(rudern.defaultMinutes).toBe(10)
    expect(getEquipmentUnit(butterfly)).toBe('kg')
  })

  it('maps unit to field, label and value', () => {
    expect(getPrimaryField('min')).toBe('minutes')
    expect(getPrimaryField('kg')).toBe('kg')
    expect(getPrimaryLabel('min')).toBe('min')
    expect(getPrimaryLabel('kg')).toBe('kg')
    expect(getPrimaryValue({ equipmentId: 2, kg: 45 }, equipmentData)).toBe(45)
    expect(getPrimaryValue({ equipmentId: 1, minutes: 12, kg: 15 }, equipmentData)).toBe(12)
  })

  it('hides sets×reps for cardio and sauna', () => {
    expect(showSetsReps({ isCardio: false, isSauna: false, sets: 3 })).toBe(true)
    expect(showSetsReps({ isCardio: true, isSauna: false, sets: 10 })).toBe(false)
    expect(showSetsReps({ isCardio: false, isSauna: true, sets: 2 })).toBe(false)
    expect(showSetsReps({ isCardio: false, isSauna: false, sets: 0 })).toBe(false)
  })

  it('defaults Rudern minutes to 10 and carries recent minutes forward', () => {
    const rudern = equipmentData.find((item) => item.id === 1)
    expect(initialMinutes(rudern)).toBe(10)
    expect(initialMinutes(rudern, { minutes: 15 })).toBe(15)
    expect(initialMinutes({ isCardio: true, unit: 'kg' })).toBe(0)
    expect(initialMinutes({ isSauna: true })).toBe(0)
    expect(initialMinutes({ unit: 'kg' })).toBeNull()
  })

  it('migrates leftover kg into minutes without deleting kg', () => {
    const sessions = [
      {
        date: '2026-01-01',
        workouts: [
          { equipmentId: 1, name: 'Rudern', kg: 15, minutes: null },
          { equipmentId: 2, name: 'Butterfly', kg: 45, minutes: null }
        ]
      },
      {
        date: '2026-01-02',
        workouts: [
          { equipmentId: 1, name: 'Rudern', kg: 15, minutes: 10 }
        ]
      }
    ]

    expect(migrateSessionsUnits(sessions, equipmentData)).toBe(true)
    expect(sessions[0].workouts[0].minutes).toBe(15)
    expect(sessions[0].workouts[0].kg).toBe(15)
    expect(sessions[0].workouts[1].minutes).toBeNull()
    expect(sessions[0].workouts[1].kg).toBe(45)
    expect(sessions[1].workouts[0].minutes).toBe(10)
    expect(migrateSessionsUnits(sessions, equipmentData)).toBe(false)
  })
})
