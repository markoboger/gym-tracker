import { describe, it, expect } from 'vitest'
import {
  kgHistory, deriveKgStep, effectiveKgStep, isManualStep, fallbackKgStep, nextKgStep, applyKgDelta, formatKg
} from './kg-step.js'

function history(equipmentId, values, start = 1) {
  return values.map((kg, i) => ({
    date: `2026-10-${String(start + i).padStart(2, '0')}`,
    workouts: [{ equipmentId, kg, sets: 2, reps: 12 }]
  }))
}

describe('deriveKgStep', () => {
  it('derives 5 from a 5 kg progression with repeats and a step back', () => {
    const s = history(2, [35, 35, 40, 45, 45, 50, 55, 50, 55])
    expect(kgHistory(s, 2)).toEqual([35, 40, 45, 50, 55, 50, 55])
    expect(deriveKgStep(s, 2)).toBe(5)
  })

  it('derives 8 for the Abduktion-style 8 kg plates', () => {
    expect(deriveKgStep(history(12, [37, 45, 53, 61, 69, 77, 85, 93, 101, 109, 93, 101]), 12)).toBe(8)
  })

  it('uses date order, not array order', () => {
    const s = history(4, [20, 30, 25]).reverse()
    expect(kgHistory(s, 4)).toEqual([20, 30, 25])
  })

  it('picks the most frequent change, ties go to the smaller step', () => {
    expect(deriveKgStep(history(5, [10, 12.5, 15, 20]), 5)).toBe(2.5)
    expect(deriveKgStep(history(5, [10, 15, 17.5]), 5)).toBe(2.5)
  })

  it('ignores implausible jumps and other machines, null without history', () => {
    expect(deriveKgStep(history(6, [10, 60]), 6)).toBeNull()
    expect(deriveKgStep(history(6, [40]), 6)).toBeNull()
    expect(deriveKgStep(history(7, [10, 15, 20]), 6)).toBeNull()
    expect(deriveKgStep([{ date: '2026-10-01', workouts: [{ equipmentId: 6, kg: null }] }], 6)).toBeNull()
  })
})

describe('effectiveKgStep', () => {
  const s = history(12, [77, 85, 93])

  it('uses the derived step when nothing manual is stored', () => {
    expect(effectiveKgStep({ stepSize: 5 }, s, 12)).toEqual({ step: 8, derived: 8, manual: false })
    expect(effectiveKgStep({ stepSize: 9, stepSizeManual: false }, s, 12).step).toBe(8)
  })

  it('manual override wins over the derived step', () => {
    expect(effectiveKgStep({ stepSize: 10, stepSizeManual: true }, s, 12)).toEqual({ step: 10, derived: 8, manual: true })
  })

  it('treats a legacy non-default stepSize as manual', () => {
    expect(isManualStep({ stepSize: 2.5 })).toBe(true)
    expect(isManualStep({ stepSize: 5 })).toBe(false)
    expect(effectiveKgStep({ stepSize: 2.5 }, s, 12).step).toBe(2.5)
  })

  it('falls back without history', () => {
    expect(effectiveKgStep({ stepSize: 5 }, [], 12, fallbackKgStep(7.5)).step).toBe(2.5)
    expect(effectiveKgStep({}, [], 12).step).toBe(5)
    expect(fallbackKgStep(40)).toBe(5)
    expect(fallbackKgStep(6)).toBe(1)
  })
})

describe('helpers', () => {
  it('steps through Δ options and keeps unusual values reachable', () => {
    expect(nextKgStep(5, 1)).toBe(6)
    expect(nextKgStep(8, -1)).toBe(7.5)
    expect(nextKgStep(0.5, -1)).toBe(0.5)
    expect(nextKgStep(11, 1)).toBe(12.5)
  })

  it('applies deltas without going negative or float noise', () => {
    expect(applyKgDelta(7.5, 2.5)).toBe(10)
    expect(applyKgDelta(0.1, 0.2)).toBe(0.3)
    expect(applyKgDelta(3, -5)).toBe(0)
    expect(formatKg(7.5)).toBe('7,5')
  })
})
