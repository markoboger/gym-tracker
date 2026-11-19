import { describe, it, expect } from 'vitest'
import {
  toIsoDate,
  shiftIsoDate,
  isTodayOrFuture,
  clampIsoToToday,
  formatDateShort,
  getWorkoutAsOf
} from './session-day.js'

describe('date helpers', () => {
  it('shifts calendar days without UTC drift around month boundaries', () => {
    expect(shiftIsoDate('2026-11-01', -1)).toBe('2026-10-31')
    expect(shiftIsoDate('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftIsoDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftIsoDate('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('treats today as the last browsable day', () => {
    expect(isTodayOrFuture('2026-11-19', '2026-11-19')).toBe(true)
    expect(isTodayOrFuture('2026-11-20', '2026-11-19')).toBe(true)
    expect(isTodayOrFuture('2026-11-18', '2026-11-19')).toBe(false)
    expect(clampIsoToToday('2026-11-20', '2026-11-19')).toBe('2026-11-19')
    expect(clampIsoToToday('2026-11-18', '2026-11-19')).toBe('2026-11-18')
  })

  it('formats a compact German date label', () => {
    expect(formatDateShort('2026-11-19')).toBe('Do 19.11.')
    expect(formatDateShort('2026-11-16')).toBe('Mo 16.11.')
    expect(toIsoDate(new Date(2026, 10, 19))).toBe('2026-11-19')
  })
})

describe('getWorkoutAsOf', () => {
  const sessions = [
    { date: '2026-11-16', workouts: [{ equipmentId: 3, kg: 30, sets: 2, reps: 8, targetSets: 2 }] },
    { date: '2026-11-17', workouts: [{ equipmentId: 3, sets: 1, reps: 10 }] },
    { date: '2026-11-19', workouts: [{ equipmentId: 3, kg: 40, sets: 4, reps: 8, targetSets: 4 }] }
  ]

  it('returns that day’s ist and stored kg when the session recorded them', () => {
    const row = getWorkoutAsOf(sessions, 3, '2026-11-16')
    expect(row.fromExactDay).toBe(true)
    expect(row.sets).toBe(2)
    expect(row.kg).toBe(30)
    expect(row.reps).toBe(8)
    expect(row.targetSets).toBe(2)
  })

  it('fills kg from the latest earlier day when the viewed day omitted kg, and keeps that day’s ist/reps', () => {
    const row = getWorkoutAsOf(sessions, 3, '2026-11-17')
    expect(row.fromExactDay).toBe(true)
    expect(row.sets).toBe(1)
    expect(row.kg).toBe(30)
    expect(row.reps).toBe(10)
    expect(row.targetSets).toBe(2)
  })

  it('uses ist 0 and carried kg/reps/soll when no session exists on the viewed day', () => {
    const row = getWorkoutAsOf(sessions, 3, '2026-11-18')
    expect(row.fromExactDay).toBe(false)
    expect(row.sets).toBe(0)
    expect(row.kg).toBe(30)
    expect(row.reps).toBe(10)
    expect(row.targetSets).toBe(2)
  })

  it('does not leak later sessions into an earlier day', () => {
    const row = getWorkoutAsOf(sessions, 3, '2026-11-16')
    expect(row.kg).toBe(30)
    expect(row.sets).toBe(2)
    expect(row.targetSets).toBe(2)
  })

  it('returns empty actuals when there is no history on or before the day', () => {
    const row = getWorkoutAsOf(sessions, 3, '2026-11-01')
    expect(row.fromExactDay).toBe(false)
    expect(row.sets).toBe(0)
    expect(row.kg).toBeNull()
    expect(row.reps).toBeNull()
    expect(getWorkoutAsOf(sessions, 99, '2026-11-19').kg).toBeNull()
  })
})
