import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'
import { db } from './db/index.js'

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
    putSession: vi.fn(() => Promise.resolve())
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
