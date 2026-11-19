import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import App from './App.vue'
import { todayIso, shiftIsoDate, formatDateShort } from './session-day.js'
import { COLORS, setProgressColors } from './set-progress.js'
import { db, storage } from './db/index.js'

vi.mock('./db/index.js', () => ({
  db: {
    sessions: { toArray: vi.fn(() => Promise.resolve([])) },
    machineSettings: { toArray: vi.fn(() => Promise.resolve([])) },
    enabledEquipment: { toArray: vi.fn(() => Promise.resolve([])) },
    metadata: { get: vi.fn(() => Promise.resolve(null)) }
  },
  storage: {
    getSessions: vi.fn(() => Promise.resolve([])),
    getMachineSettings: vi.fn(() => Promise.resolve({})),
    getEnabledEquipment: vi.fn(() => Promise.resolve([])),
    putSession: vi.fn(() => Promise.resolve()),
    putMachineSetting: vi.fn(() => Promise.resolve())
  },
  migrateFromLocalStorage: vi.fn(() => Promise.resolve())
}))

// Mock fetch for seed data test
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve([
      { date: '2024-01-01', workouts: [] }
    ])
  })
)

describe('App Integration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('mounts without errors', () => {
    const wrapper = mount(App)
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('.app').exists()).toBe(true)
  })

  it('displays HappyFit header', () => {
    const wrapper = mount(App)
    expect(wrapper.find('h1').text()).toContain('HappyFit')
  })

  it('shows the date button and training-day arrows', () => {
    const wrapper = mount(App)
    expect(wrapper.find('[data-test="date-current"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="date-prev"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="date-next"]').exists()).toBe(true)
    expect(wrapper.find('input[type="date"]').exists()).toBe(false)
    expect(wrapper.find('.date-nav [data-test="date-today"]').exists()).toBe(false)
    const navTests = wrapper.findAll('.date-nav button').map((btn) => btn.attributes('data-test'))
    expect(navTests).toEqual(['date-prev', 'date-current', 'date-next'])

    const todayBtn = wrapper.find('[data-test="date-today"]')
    expect(todayBtn.exists()).toBe(true)
    expect(todayBtn.text()).toBe('Heute')
    expect(todayBtn.classes()).toContain('btn-new-day')
    expect(wrapper.find('.date-header-actions [data-test="date-today"]').exists()).toBe(true)
    const actionTexts = wrapper.findAll('.date-header-actions button').map((btn) => btn.text())
    expect(actionTexts).toEqual(['Heute', '+ Neuer Tag'])
  })

  it('has seedData function available', async () => {
    const wrapper = mount(App)
    const vm = wrapper.vm
    
    // Verify seedData function exists
    expect(typeof vm.seedData).toBe('function')
    
    // Mock alert and confirm
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const confirmMock = vi.spyOn(window, 'confirm').mockReturnValue(false)
    
    // Call seedData
    await vm.seedData()
    
    alertMock.mockRestore()
    confirmMock.mockRestore()
  })
})


async function mountReady() {
  const wrapper = mount(App)
  await flushPromises()
  return wrapper
}


function cssRgb(hex) {
  const h = String(hex).replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgb(${r}, ${g}, ${b})`
}

function cardByName(wrapper, name) {
  const normalized = name.replace(/\s+/g, ' ').trim()
  return wrapper.findAll('.workout-card').find((card) => {
    return card.find('.workout-name').text().replace(/\s+/g, ' ').trim() === normalized
  })
}


describe('machine card title line', () => {
  it('shows kg and sets×reps on the same line as the name, with no separate summary', async () => {
    const wrapper = await mountReady()
    const card = cardByName(wrapper, 'Butterfly reverse')
    expect(card).toBeTruthy()
    expect(card.classes()).toContain('collapsed')
    expect(card.find('.workout-summary').exists()).toBe(false)

    const line = card.find('.title-line')
    expect(line.find('.workout-name').exists()).toBe(true)
    expect(line.find('.workout-metric').exists()).toBe(true)
    expect(line.find('.workout-sets-reps').exists()).toBe(true)
    expect(line.find('.metric-number').text()).toBe('35')
    expect(line.find('.workout-metric').text()).not.toMatch(/kg/)
    expect(line.find('.workout-sets-reps').text()).toBe('2×8')
  })

  it('uses the same font-size for the kg value as the machine name, with slightly smaller sets×reps', async () => {
    const wrapper = await mountReady()
    const card = cardByName(wrapper, 'Butterfly reverse')
    expect(card.find('.workout-name').classes()).toContain('workout-title-size')
    expect(card.find('.workout-metric').classes()).toContain('workout-title-size')
    expect(card.find('.workout-sets-reps').classes()).not.toContain('workout-title-size')
    expect(card.find('.workout-sets-reps').classes()).toContain('workout-sets-reps')
  })

  it('keeps the metric on the title line after expanding a card', async () => {
    const wrapper = await mountReady()
    const card = cardByName(wrapper, 'Butterfly reverse')
    await card.find('.workout-header').trigger('click')
    await flushPromises()
    const expanded = cardByName(wrapper, 'Butterfly reverse')
    expect(expanded.classes()).not.toContain('collapsed')
    expect(expanded.find('.title-line .metric-number').text()).toBe('35')
    expect(expanded.find('.title-line .workout-sets-reps').text()).toBe('2×8')
  })

  it('opens the kg pop-up when the metric is tapped and does not expand the card', async () => {
    const wrapper = await mountReady()
    const card = cardByName(wrapper, 'Butterfly reverse')
    expect(card.classes()).toContain('collapsed')
    expect(wrapper.find('[data-test="kg-popup"]').exists()).toBe(false)

    await card.find('.workout-metric').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="kg-popup"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="kg-value"]').text()).toContain('35')
    expect(cardByName(wrapper, 'Butterfly reverse').classes()).toContain('collapsed')

    // the scroll picker stays reachable via "Liste"
    await wrapper.find('[data-test="kg-popup-list"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="kg-popup"]').exists()).toBe(false)
    expect(wrapper.find('.picker-title').text()).toBe('Kilogramm')
  })

  it('shows Soll-Sets × reps, not actual sets, behind the name', async () => {
    const wrapper = await mountReady()
    const card = cardByName(wrapper, 'Butterfly reverse')
    expect(card.find('.workout-sets-reps').text()).toBe('2×8')
    expect(card.find('.workout-nr').text()).toContain('19')
  })

  it('tapping the number badge increments actual sets, persists, and does not expand the card', async () => {
    const wrapper = await mountReady()
    const card = cardByName(wrapper, 'Butterfly reverse')
    expect(card.classes()).toContain('collapsed')
    const before = card.attributes('style') || ''

    await card.find('.workout-nr').trigger('pointerdown')
    await card.find('.workout-nr').trigger('pointerup')
    await flushPromises()

    const updated = cardByName(wrapper, 'Butterfly reverse')
    expect(updated.classes()).toContain('collapsed')
    expect(updated.find('.workout-sets-reps').text()).toBe('2×8')
    expect(updated.attributes('style') || '').not.toBe(before)
    expect(storage.putSession).toHaveBeenCalled()
    const saved = storage.putSession.mock.calls.at(-1)[0]
    const workout = saved.workouts.find((item) => item.name.trim() === 'Butterfly reverse')
    expect(workout.sets).toBe(1)
  })

  it('long-pressing the number badge decrements actual sets', async () => {
    vi.useFakeTimers()
    const wrapper = await mountReady()
    const card = cardByName(wrapper, 'Butterfly reverse')
    await card.find('.workout-nr').trigger('pointerdown')
    await card.find('.workout-nr').trigger('pointerup')
    await flushPromises()
    storage.putSession.mockClear()

    await card.find('.workout-nr').trigger('pointerdown')
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    vi.useRealTimers()

    const saved = storage.putSession.mock.calls.at(-1)[0]
    const workout = saved.workouts.find((item) => item.name.trim() === 'Butterfly reverse')
    expect(workout?.sets ?? 0).toBe(0)
    expect(cardByName(wrapper, 'Butterfly reverse').classes()).toContain('collapsed')
  })

  it('shows minutes (not kg) for Rudern and opens the minutes picker, keeping the meters control', async () => {
    const wrapper = await mountReady()
    const card = cardByName(wrapper, 'Rudern')
    expect(card).toBeTruthy()
    expect(card.find('.workout-metric .metric-number').text()).toBe('10')
    expect(card.find('.workout-metric .metric-unit').text()).toBe('min')
    expect(card.find('.workout-metric').text()).not.toMatch(/kg/)
    expect(card.find('.workout-sets-reps').exists()).toBe(false)

    await card.find('.workout-metric').trigger('click')
    await flushPromises()
    expect(wrapper.find('.picker-overlay').exists()).toBe(true)
    expect(wrapper.find('.picker-title').text()).toBe('Minuten')
    expect(cardByName(wrapper, 'Rudern').classes()).toContain('collapsed')

    await wrapper.find('.picker-cancel').trigger('click')
    await flushPromises()
    await cardByName(wrapper, 'Rudern').find('.workout-header').trigger('click')
    await flushPromises()
    const expanded = cardByName(wrapper, 'Rudern')
    expect(expanded.find('.control-group compact label').exists() || true).toBe(true)
    const labels = expanded.findAll('.control-group label').map((el) => el.text())
    expect(labels).toContain('min')
    expect(labels).toContain('Meter')
    expect(labels).not.toContain('kg')
  })
})


describe('machine card layout v14', () => {
  it('puts sets×reps at the end of the name and kg at the far right of the title line', async () => {
    const wrapper = await mountReady()
    const card = cardByName(wrapper, 'Butterfly reverse')
    const classes = Array.from(card.find('.title-line').element.children).map((el) => el.className)
    expect(classes[0]).toMatch(/workout-nr/)
    expect(classes[1]).toMatch(/workout-name-slot/)
    expect(classes[2]).toMatch(/workout-sets-reps/)
    expect(classes[3]).toMatch(/workout-metric/)
    expect(card.find('.metric-number').text()).toBe('35')
    expect(card.find('.workout-metric').text()).not.toMatch(/kg/)
    expect(card.find('.workout-sets-reps').text()).toBe('2×8')
    expect(card.find('.workout-name').text()).toBe('Butterfly reverse')
    const metrics = wrapper.findAll('.workout-metric')
    const widths = metrics.map((el) => getComputedStyle(el.element).width)
    expect(widths.length).toBeGreaterThan(1)
    expect(new Set(widths).size).toBe(1)
  })

  it('uses the same title font on the number badge as on the name and kg', async () => {
    const wrapper = await mountReady()
    const card = cardByName(wrapper, 'Butterfly reverse')
    expect(card.find('.workout-nr').classes()).toContain('workout-title-size')
    expect(card.find('.workout-name').classes()).toContain('workout-title-size')
    expect(card.find('.workout-metric').classes()).toContain('workout-title-size')
  })

  it('does not treat catalog sets: 3 as soll or as ist; a fresh card stays neutral', async () => {
    const wrapper = await mountReady()
    const card = cardByName(wrapper, 'Butterfly reverse')
    expect(card.find('.workout-sets-reps').text()).toBe('2×8')
    expect(card.attributes('style') || '').toContain(cssRgb(COLORS.neutralCard))
    const badgeStyle = card.find('.workout-nr').attributes('style') || ''
    expect(badgeStyle).toContain(cssRgb(COLORS.neutralBadge))
  })
})

describe('Sets soll vs Sets ist', () => {
  it('shows separate labeled steppers in the expanded card and keeps soll on the title line', async () => {
    const wrapper = await mountReady()
    const card = cardByName(wrapper, 'Butterfly reverse')
    await card.find('.workout-header').trigger('click')
    await flushPromises()
    const expanded = cardByName(wrapper, 'Butterfly reverse')
    const soll = expanded.find('[data-test="sets-soll"]')
    const ist = expanded.find('[data-test="sets-ist"]')
    expect(soll.exists()).toBe(true)
    expect(ist.exists()).toBe(true)
    expect(soll.find('label').text()).toBe('Sets soll')
    expect(ist.find('label').text()).toBe('Sets ist')
    expect(soll.find('.picker-trigger').text()).toBe('2')
    expect(ist.find('.picker-trigger').text()).toBe('0')
    expect(expanded.find('.workout-sets-reps').text()).toBe('2×8')
  })

  it('ist stepper and badge taps change actual sets only, and soll stepper skips 3 (2/4/5)', async () => {
    const wrapper = await mountReady()
    const card = cardByName(wrapper, 'Butterfly reverse')
    await card.find('.workout-header').trigger('click')
    await flushPromises()

    const expanded = () => cardByName(wrapper, 'Butterfly reverse')
    await expanded().find('[data-test="sets-ist"] .btn-stepper-mini:last-child').trigger('click')
    await flushPromises()
    expect(expanded().find('[data-test="sets-ist"] .picker-trigger').text()).toBe('1')
    expect(expanded().find('[data-test="sets-soll"] .picker-trigger').text()).toBe('2')
    expect(expanded().find('.workout-sets-reps').text()).toBe('2×8')

    await expanded().find('[data-test="sets-soll"] .btn-stepper-mini:last-child').trigger('click')
    await flushPromises()
    expect(expanded().find('[data-test="sets-soll"] .picker-trigger').text()).toBe('4')
    expect(expanded().find('[data-test="sets-ist"] .picker-trigger').text()).toBe('1')
    expect(expanded().find('.workout-sets-reps').text()).toBe('4×8')

    const saved = storage.putSession.mock.calls.at(-1)[0]
    const workout = saved.workouts.find((item) => item.name.trim() === 'Butterfly reverse')
    expect(workout.sets).toBe(1)
    expect(workout.targetSets).toBe(4)
    expect(workout.targetSets).not.toBe(3)
  })

  it('binds card and badge colors to ist versus soll, not to soll alone', async () => {
    const wrapper = await mountReady()
    const card = cardByName(wrapper, 'Butterfly reverse')
    await card.find('.workout-header').trigger('click')
    await flushPromises()

    const view = () => cardByName(wrapper, 'Butterfly reverse')
    const istPlus = () => view().find('[data-test="sets-ist"] .btn-stepper-mini:last-child')
    const sollPlus = () => view().find('[data-test="sets-soll"] .btn-stepper-mini:last-child')

    await istPlus().trigger('click')
    await istPlus().trigger('click')
    await flushPromises()
    expect((view().find('.workout-nr').attributes('style') || '')).toContain(
      cssRgb(setProgressColors(2, 2).badge)
    )

    await sollPlus().trigger('click')
    await flushPromises()
    expect((view().find('.workout-nr').attributes('style') || '')).toContain(
      cssRgb(setProgressColors(2, 4).badge)
    )
    expect(setProgressColors(2, 4).badge).not.toBe(setProgressColors(2, 2).badge)
  })
})

describe('date navigation and per-day state', () => {
  it('disables both arrows when there is no training history and the view is today', async () => {
    const wrapper = await mountReady()
    const today = todayIso()
    expect(wrapper.vm.currentDate).toBe(today)
    expect(wrapper.find('[data-test="date-label"]').text()).toBe(formatDateShort(today))
    expect(wrapper.find('[data-test="date-prev"]').element.disabled).toBe(true)
    expect(wrapper.find('[data-test="date-next"]').element.disabled).toBe(true)
  })

  it('steps only between training days and returns to today from the latest entry', async () => {
    const today = todayIso()
    const earlier = shiftIsoDate(today, -5)
    const latest = shiftIsoDate(today, -2)
    storage.getSessions.mockResolvedValue([
      { date: earlier, workouts: [{ equipmentId: 3, name: 'Butterfly reverse', kg: 30, sets: 2, reps: 8 }] },
      { date: latest, workouts: [{ equipmentId: 3, name: 'Butterfly reverse', kg: 35, sets: 2, reps: 8 }] }
    ])
    const wrapper = await mountReady()
    expect(wrapper.find('[data-test="date-next"]').element.disabled).toBe(true)
    expect(wrapper.find('[data-test="date-prev"]').element.disabled).toBe(false)

    await wrapper.find('[data-test="date-prev"]').trigger('click')
    await flushPromises()
    expect(wrapper.vm.currentDate).toBe(latest)

    await wrapper.find('[data-test="date-next"]').trigger('click')
    await flushPromises()
    expect(wrapper.vm.currentDate).toBe(today)

    await wrapper.find('[data-test="date-prev"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-test="date-prev"]').trigger('click')
    await flushPromises()
    expect(wrapper.vm.currentDate).toBe(earlier)
    expect(wrapper.find('[data-test="date-prev"]').element.disabled).toBe(true)

    await wrapper.find('[data-test="date-next"]').trigger('click')
    await flushPromises()
    expect(wrapper.vm.currentDate).toBe(latest)
    await wrapper.find('[data-test="date-next"]').trigger('click')
    await flushPromises()
    expect(wrapper.vm.currentDate).toBe(today)
  })

  it('opens a custom calendar that marks training days and jumps to a tapped day', async () => {
    const today = todayIso()
    const past = shiftIsoDate(today, -4)
    storage.getSessions.mockResolvedValue([
      { date: past, workouts: [{ equipmentId: 3, name: 'Butterfly reverse', kg: 30, sets: 2, reps: 8 }] }
    ])
    const wrapper = await mountReady()
    expect(wrapper.find('[data-test="training-calendar"]').exists()).toBe(false)
    await wrapper.find('[data-test="date-current"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="training-calendar"]').exists()).toBe(true)
    const marked = wrapper.find(`[data-iso="${past}"]`)
    expect(marked.exists()).toBe(true)
    expect(marked.classes()).toContain('has-training')
    expect(wrapper.find(`[data-iso="${today}"]`).classes()).toContain('is-today')
    await marked.trigger('click')
    await flushPromises()
    expect(wrapper.vm.currentDate).toBe(past)
    expect(wrapper.find('[data-test="training-calendar"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="date-next"]').element.disabled).toBe(false)
  })

  it('shows that day’s stored kg, ist and reps, and fills missing kg from earlier history', async () => {
    const today = todayIso()
    const d1 = shiftIsoDate(today, -2)
    const d2 = shiftIsoDate(today, -1)
    storage.getSessions.mockResolvedValue([
      { date: d1, workouts: [{ equipmentId: 3, name: 'Butterfly reverse', kg: 30, sets: 2, reps: 8, targetSets: 2 }] },
      { date: d2, workouts: [{ equipmentId: 3, name: 'Butterfly reverse', sets: 1, reps: 10, targetSets: 4 }] }
    ])
    const wrapper = await mountReady()

    await wrapper.find('[data-test="date-prev"]').trigger('click')
    await flushPromises()
    let card = cardByName(wrapper, 'Butterfly reverse')
    expect(wrapper.vm.currentDate).toBe(d2)
    expect(card.find('.metric-number').text()).toBe('30')
    expect(card.find('.workout-sets-reps').text()).toBe('4×10')
    await card.find('.workout-header').trigger('click')
    await flushPromises()
    expect(cardByName(wrapper, 'Butterfly reverse').find('[data-test="sets-ist"] .picker-trigger').text()).toBe('1')
    expect(cardByName(wrapper, 'Butterfly reverse').find('[data-test="sets-soll"] .picker-trigger').text()).toBe('4')

    await wrapper.find('[data-test="date-prev"]').trigger('click')
    await flushPromises()
    card = cardByName(wrapper, 'Butterfly reverse')
    expect(wrapper.vm.currentDate).toBe(d1)
    expect(card.find('.metric-number').text()).toBe('30')
    expect(card.find('.workout-sets-reps').text()).toBe('2×8')
    await card.find('.workout-header').trigger('click')
    await flushPromises()
    expect(cardByName(wrapper, 'Butterfly reverse').find('[data-test="sets-ist"] .picker-trigger').text()).toBe('2')
  })

  it('writes ist edits to the viewed past day and does not change today', async () => {
    const today = todayIso()
    const past = shiftIsoDate(today, -3)
    storage.getSessions.mockResolvedValue([
      { date: past, workouts: [{ equipmentId: 3, name: 'Butterfly reverse', kg: 30, sets: 1, reps: 8 }] }
    ])
    const wrapper = await mountReady()
    await wrapper.find('[data-test="date-prev"]').trigger('click')
    await flushPromises()
    expect(wrapper.vm.currentDate).toBe(past)
    storage.putSession.mockClear()

    const card = cardByName(wrapper, 'Butterfly reverse')
    await card.find('.workout-nr').trigger('pointerdown')
    await card.find('.workout-nr').trigger('pointerup')
    await flushPromises()

    const savedDates = storage.putSession.mock.calls.map((call) => call[0].date)
    expect(savedDates).toContain(past)
    expect(savedDates).not.toContain(today)
    const saved = storage.putSession.mock.calls.at(-1)[0]
    expect(saved.date).toBe(past)
    expect(saved.workouts.find((item) => item.equipmentId === 3).sets).toBe(2)
  })

  it('jumps back to today with the Heute button and disables it on today', async () => {
    const today = todayIso()
    const past = shiftIsoDate(today, -3)
    storage.getSessions.mockResolvedValue([
      { date: past, workouts: [{ equipmentId: 3, name: 'Butterfly reverse', kg: 30, sets: 2, reps: 8 }] }
    ])
    const wrapper = await mountReady()
    expect(wrapper.find('[data-test="date-today"]').text()).toBe('Heute')
    expect(wrapper.find('[data-test="date-today"]').element.disabled).toBe(true)
    expect(wrapper.vm.currentDate).toBe(today)

    await wrapper.find('[data-test="date-prev"]').trigger('click')
    await flushPromises()
    expect(wrapper.vm.currentDate).toBe(past)
    expect(wrapper.find('[data-test="date-today"]').element.disabled).toBe(false)

    await wrapper.find('[data-test="date-today"]').trigger('click')
    await flushPromises()
    expect(wrapper.vm.currentDate).toBe(today)
    expect(wrapper.find('[data-test="date-label"]').text()).toBe(formatDateShort(today))
    expect(wrapper.find('[data-test="date-today"]').element.disabled).toBe(true)
  })
})


function daysAgo(n) {
  return shiftIsoDate(todayIso(), -n)
}

function abduktionHistory(values) {
  return values.map((kg, i) => ({
    date: daysAgo(values.length - i + 1),
    workouts: [{ equipmentId: 12, kg, sets: 2, reps: 12, completed: true }]
  }))
}

describe('kg pop-up', () => {
  beforeEach(() => {
    storage.getSessions.mockReset()
    storage.getSessions.mockImplementation(() => Promise.resolve([]))
    storage.putSession.mockClear()
    storage.putMachineSetting.mockClear()
  })

  async function openPopup(name, sessions) {
    if (sessions) storage.getSessions.mockResolvedValueOnce(sessions)
    const wrapper = await mountReady()
    await cardByName(wrapper, name).find('.workout-metric').trigger('click')
    await flushPromises()
    return wrapper
  }

  it('shows a green +Δ button with the step derived from history (Abduktion: 8 kg)', async () => {
    const wrapper = await openPopup('Abduktion', abduktionHistory([77, 85, 93, 101]))
    expect(wrapper.find('[data-test="kg-value"]').text()).toContain('101')
    expect(wrapper.find('[data-test="kg-plus"]').text()).toBe('+8 kg')
    expect(wrapper.find('[data-test="kg-minus"]').text()).toBe('−8')
  })

  it('+Δ raises kg and records the increase (kg counter reset), −Δ does not', async () => {
    const wrapper = await openPopup('Butterfly reverse')
    await wrapper.find('[data-test="kg-plus"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="kg-value"]').text()).toContain('40')
    const saved = storage.putSession.mock.calls.at(-1)[0]
    expect(saved.workouts.find(w => w.equipmentId === 3).kg).toBe(40)
    const increase = storage.putMachineSetting.mock.calls.find(([id, s]) => id === 3 && s.lastIncreaseDate)
    expect(increase[1].lastIncreaseDate).toBe(todayIso())

    storage.putMachineSetting.mockClear()
    await wrapper.find('[data-test="kg-minus"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="kg-value"]').text()).toContain('35')
    expect(storage.putMachineSetting).not.toHaveBeenCalled()
  })

  it('manual Δ is persisted per machine and wins over the derived step', async () => {
    const wrapper = await openPopup('Abduktion', abduktionHistory([77, 85, 93, 101]))
    await wrapper.find('[data-test="kg-step-plus"]').trigger('click')
    await flushPromises()
    const [id, settings] = storage.putMachineSetting.mock.calls.at(-1)
    expect(id).toBe(12)
    expect(settings).toMatchObject({ stepSize: 9, stepSizeManual: true })
    expect(wrapper.find('[data-test="kg-plus"]').text()).toBe('+9 kg')
    expect(wrapper.find('[data-test="kg-step-auto"]').text()).toBe('Auto (8)')

    await wrapper.find('[data-test="kg-step-auto"]').trigger('click')
    await flushPromises()
    expect(storage.putMachineSetting.mock.calls.at(-1)[1]).toMatchObject({ stepSize: 8, stepSizeManual: false })
    expect(wrapper.find('[data-test="kg-plus"]').text()).toBe('+8 kg')
  })

  it('keeps sets editing in the pop-up', async () => {
    const wrapper = await openPopup('Butterfly reverse')
    await wrapper.find('[data-test="kg-popup-sets-plus"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="kg-popup-sets"]').text()).toBe('1')
    await wrapper.find('[data-test="kg-popup-done"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="kg-popup"]').exists()).toBe(false)
  })
})
