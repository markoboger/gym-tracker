/** Target-set options: 3 is not allowed and is always normalized to 2. */
export const TARGET_SET_OPTIONS = [2, 4, 5]
export const DEFAULT_TARGET_SETS = 2

export const COLORS = {
  lightBlue: '#64D2FF',
  mediumBlue: '#0A84FF',
  darkBlue: '#0040DD',
  green: '#34C759',
  orange: '#FF9F0A',
  red: '#FF3B30',
  neutralCard: '#1C1C1E',
  neutralBadge: '#2C2C2E',
  badgeTextOnLight: '#000000',
  badgeTextOnDark: '#FFFFFF',
  badgeTextNeutral: '#8E8E93'
}

export function normalizeTargetSets(value) {
  const n = Number(value)
  if (n === 3) return DEFAULT_TARGET_SETS
  if (TARGET_SET_OPTIONS.includes(n)) return n
  return DEFAULT_TARGET_SETS
}

export function nextTargetSets(current, delta) {
  const opts = TARGET_SET_OPTIONS
  const cur = normalizeTargetSets(current)
  const index = opts.indexOf(cur)
  const next = index + delta
  if (next < 0 || next >= opts.length) return cur
  return opts[next]
}

export function hexToRgb(hex) {
  const h = String(hex).replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ]
}

export function rgbToHex([r, g, b]) {
  return `#${[r, g, b]
    .map((x) => Math.round(x).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

export function lerpHex(from, to, t) {
  const clamped = Math.min(1, Math.max(0, t))
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  return rgbToHex(a.map((value, i) => value + (b[i] - value) * clamped))
}

export function mixOnto(color, background, amount) {
  return lerpHex(background, color, amount)
}

function isLight(hex) {
  const [r, g, b] = hexToRgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b > 160
}

/**
 * Actual (Ist) sets vs target (Soll) → card/badge colors.
 * 0: neutral; below target: blues; == target: green; > target: orange; >= 4× target: red.
 */
export function setProgressColors(actualSets, targetSets) {
  const actual = Math.max(0, Number(actualSets) || 0)
  const target = normalizeTargetSets(targetSets)

  if (actual <= 0) {
    return {
      tone: 'neutral',
      badge: COLORS.neutralBadge,
      badgeText: COLORS.badgeTextNeutral,
      card: COLORS.neutralCard,
      border: 'transparent'
    }
  }

  let badge
  let tone
  if (actual >= 4 * target) {
    badge = COLORS.red
    tone = 'red'
  } else if (actual > target) {
    badge = COLORS.orange
    tone = 'orange'
  } else if (actual === target) {
    badge = COLORS.green
    tone = 'green'
  } else if (target === 2) {
    badge = COLORS.mediumBlue
    tone = 'blue-medium'
  } else {
    const t = (actual - 1) / Math.max(target - 2, 1)
    badge = lerpHex(COLORS.lightBlue, COLORS.darkBlue, t)
    tone = 'blue'
  }

  return {
    tone,
    badge,
    badgeText: isLight(badge) ? COLORS.badgeTextOnLight : COLORS.badgeTextOnDark,
    card: mixOnto(badge, COLORS.neutralCard, 0.38),
    border: badge
  }
}

export function kgCounterColor(count) {
  const n = Number(count) || 0
  if (n <= 0) return COLORS.red
  if (n <= 2) return COLORS.orange
  return COLORS.green
}

/** Last session date on which this machine's kg increased vs the previous session. */
export function inferLastIncreaseDate(sessions, equipmentId) {
  const rows = []
  for (const session of sessions || []) {
    const workout = (session.workouts || []).find((item) => item.equipmentId === equipmentId)
    if (!workout || workout.kg == null) continue
    rows.push({ date: session.date, kg: workout.kg })
  }
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)))
  let last = null
  let previous = null
  for (const row of rows) {
    if (previous != null && row.kg > previous) last = row.date
    previous = row.kg
  }
  return last
}

/**
 * Distinct days on which Ist-Sets >= Soll, strictly after lastIncreaseDate.
 * If lastIncreaseDate is missing, it is inferred from history (last kg increase).
 * If kg never increased, all target-hit days count.
 */
export function countTargetHitDays({
  sessions,
  equipmentId,
  targetSets,
  lastIncreaseDate
}) {
  const target = normalizeTargetSets(targetSets)
  const increaseDate = lastIncreaseDate || inferLastIncreaseDate(sessions, equipmentId)
  const dates = new Set()
  for (const session of sessions || []) {
    if (increaseDate && session.date <= increaseDate) continue
    const workout = (session.workouts || []).find((item) => item.equipmentId === equipmentId)
    if (!workout) continue
    if ((workout.sets || 0) >= target) dates.add(session.date)
  }
  return dates.size
}
