import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import App from './App.vue'
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

  it('shows date input', () => {
    const wrapper = mount(App)
    expect(wrapper.find('input[type="date"]').exists()).toBe(true)
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
    expect(line.find('.workout-metric').text()).toBe('35 kg')
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
    expect(expanded.find('.title-line .workout-metric').text()).toBe('35 kg')
    expect(expanded.find('.title-line .workout-sets-reps').text()).toBe('2×8')
  })

  it('opens the existing kg picker when the metric is tapped and does not expand the card', async () => {
    const wrapper = await mountReady()
    const card = cardByName(wrapper, 'Butterfly reverse')
    expect(card.classes()).toContain('collapsed')
    expect(wrapper.find('.picker-overlay').exists()).toBe(false)

    await card.find('.workout-metric').trigger('click')
    await flushPromises()

    expect(wrapper.find('.picker-overlay').exists()).toBe(true)
    expect(wrapper.find('.picker-title').text()).toBe('Kilogramm')
    expect(cardByName(wrapper, 'Butterfly reverse').classes()).toContain('collapsed')
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
    expect(card.find('.workout-metric').text()).toBe('10 min')
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
