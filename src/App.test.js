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
    getEnabledEquipment: vi.fn(() => Promise.resolve([]))
  },
  migrateFromLocalStorage: vi.fn(() => Promise.resolve())
}))

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
})
