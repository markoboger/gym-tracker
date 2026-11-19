import { describe, it, expect } from 'vitest'
import {
  COLORS,
  TARGET_SET_OPTIONS,
  DEFAULT_TARGET_SETS,
  normalizeTargetSets,
  nextTargetSets,
  lerpHex,
  setProgressColors,
  kgCounterColor,
  inferLastIncreaseDate,
  countTargetHitDays
} from './set-progress.js'

describe('normalizeTargetSets', () => {
  it('defaults to 2 and maps 3 → 2 every time', () => {
    expect(DEFAULT_TARGET_SETS).toBe(2)
    expect(TARGET_SET_OPTIONS).toEqual([2, 4, 5])
    expect(normalizeTargetSets(3)).toBe(2)
    expect(normalizeTargetSets('3')).toBe(2)
    expect(normalizeTargetSets(2)).toBe(2)
    expect(normalizeTargetSets(4)).toBe(4)
    expect(normalizeTargetSets(5)).toBe(5)
    expect(normalizeTargetSets(undefined)).toBe(2)
    expect(normalizeTargetSets(1)).toBe(2)
    expect(normalizeTargetSets(6)).toBe(2)
  })

  it('skips 3 when stepping options', () => {
    expect(nextTargetSets(2, 1)).toBe(4)
    expect(nextTargetSets(4, 1)).toBe(5)
    expect(nextTargetSets(5, 1)).toBe(5)
    expect(nextTargetSets(5, -1)).toBe(4)
    expect(nextTargetSets(4, -1)).toBe(2)
    expect(nextTargetSets(2, -1)).toBe(2)
    expect(nextTargetSets(3, 1)).toBe(4)
  })
})

describe('setProgressColors thresholds', () => {
  it('is neutral at 0 actual sets', () => {
    const colors = setProgressColors(0, 2)
    expect(colors.tone).toBe('neutral')
    expect(colors.badge).toBe(COLORS.neutralBadge)
    expect(colors.card).toBe(COLORS.neutralCard)
  })

  it('uses medium blue after 1 set when target is 2', () => {
    const colors = setProgressColors(1, 2)
    expect(colors.tone).toBe('blue-medium')
    expect(colors.badge).toBe(COLORS.mediumBlue)
  })

  it('treats stored target 3 as 2 (so 1 set is medium blue, not a 3-step ramp)', () => {
    const colors = setProgressColors(1, 3)
    expect(colors.badge).toBe(COLORS.mediumBlue)
    expect(setProgressColors(2, 3).badge).toBe(COLORS.green)
  })

  it('is green at target, orange above, red at 4× target', () => {
    expect(setProgressColors(2, 2).badge).toBe(COLORS.green)
    expect(setProgressColors(3, 2).badge).toBe(COLORS.orange)
    expect(setProgressColors(7, 2).badge).toBe(COLORS.orange)
    expect(setProgressColors(8, 2).badge).toBe(COLORS.red)
    expect(setProgressColors(4, 4).badge).toBe(COLORS.green)
    expect(setProgressColors(5, 4).badge).toBe(COLORS.orange)
    expect(setProgressColors(16, 4).badge).toBe(COLORS.red)
    expect(setProgressColors(20, 5).badge).toBe(COLORS.red)
  })

  it('interpolates light → dark blue across sets below a target greater than 2', () => {
    const first = setProgressColors(1, 4)
    const mid = setProgressColors(2, 4)
    const last = setProgressColors(3, 4)
    expect(first.badge).toBe(COLORS.lightBlue)
    expect(last.badge).toBe(COLORS.darkBlue)
    expect(mid.badge).toBe(lerpHex(COLORS.lightBlue, COLORS.darkBlue, 0.5))
    expect(setProgressColors(1, 5).badge).toBe(COLORS.lightBlue)
    expect(setProgressColors(4, 5).badge).toBe(COLORS.darkBlue)
  })
})

describe('kg counter', () => {
  it('colors 0 red, 1–2 orange, ≥3 green', () => {
    expect(kgCounterColor(0)).toBe(COLORS.red)
    expect(kgCounterColor(1)).toBe(COLORS.orange)
    expect(kgCounterColor(2)).toBe(COLORS.orange)
    expect(kgCounterColor(3)).toBe(COLORS.green)
    expect(kgCounterColor(10)).toBe(COLORS.green)
  })

  it('infers the last kg-increase date from history', () => {
    const sessions = [
      { date: '2026-01-01', workouts: [{ equipmentId: 2, kg: 40, sets: 2 }] },
      { date: '2026-01-03', workouts: [{ equipmentId: 2, kg: 40, sets: 2 }] },
      { date: '2026-01-08', workouts: [{ equipmentId: 2, kg: 45, sets: 2 }] },
      { date: '2026-01-10', workouts: [{ equipmentId: 2, kg: 45, sets: 2 }] }
    ]
    expect(inferLastIncreaseDate(sessions, 2)).toBe('2026-01-08')
    expect(inferLastIncreaseDate(sessions, 99)).toBeNull()
  })

  it('counts distinct target-hit days strictly after the last increase; a decrease does not reset', () => {
    const sessions = [
      { date: '2026-01-01', workouts: [{ equipmentId: 2, kg: 40, sets: 2 }] },
      { date: '2026-01-08', workouts: [{ equipmentId: 2, kg: 45, sets: 2 }] },
      { date: '2026-01-10', workouts: [{ equipmentId: 2, kg: 45, sets: 2 }] },
      { date: '2026-01-12', workouts: [{ equipmentId: 2, kg: 45, sets: 1 }] },
      { date: '2026-01-14', workouts: [{ equipmentId: 2, kg: 45, sets: 2 }] },
      { date: '2026-01-16', workouts: [{ equipmentId: 2, kg: 40, sets: 2 }] }
    ]
    expect(countTargetHitDays({
      sessions,
      equipmentId: 2,
      targetSets: 2,
      lastIncreaseDate: '2026-01-08'
    })).toBe(3)
    // Decrease on 01-16 must not change the stored/inferred increase date
    expect(inferLastIncreaseDate(sessions, 2)).toBe('2026-01-08')
  })

  it('resets to 0 when lastIncreaseDate is today (picker increase)', () => {
    const sessions = [
      { date: '2026-01-20', workouts: [{ equipmentId: 2, kg: 50, sets: 2 }] }
    ]
    expect(countTargetHitDays({
      sessions,
      equipmentId: 2,
      targetSets: 2,
      lastIncreaseDate: '2026-01-20'
    })).toBe(0)
  })

  it('counts all target-hit days when kg never increased (imported history)', () => {
    const sessions = [
      { date: '2026-01-01', workouts: [{ equipmentId: 2, kg: 45, sets: 2 }] },
      { date: '2026-01-02', workouts: [{ equipmentId: 2, kg: 45, sets: 2 }] },
      { date: '2026-01-03', workouts: [{ equipmentId: 2, kg: 45, sets: 1 }] }
    ]
    expect(inferLastIncreaseDate(sessions, 2)).toBeNull()
    expect(countTargetHitDays({
      sessions,
      equipmentId: 2,
      targetSets: 2
    })).toBe(2)
  })
})
