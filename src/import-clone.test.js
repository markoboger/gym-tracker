// Regression tests for "DataCloneError: The object can not be cloned." on JSON import
// and on every day save: Vue reactive proxies were written straight into IndexedDB.
// Uses the real Dexie layer on fake-indexeddb (no storage mocks).
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { reactive, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import App from './App.vue'
import { db, storage, toStorable } from './db/index.js'

const seedFile = JSON.parse(readFileSync(resolve(__dirname, '../public/happyfit-import-sessions.json'), 'utf8'))

beforeEach(async () => {
  await db.delete()
  await db.open()
  localStorage.clear()
})

describe('IndexedDB writes accept Vue reactive data', () => {
  it('reproduces the clone error without normalization (root cause)', async () => {
    const sessions = ref([{ date: '2026-11-01', workouts: [{ equipmentId: 2, kg: 40 }] }])
    await expect(db.sessions.put(sessions.value[0])).rejects.toThrow(/could not be cloned|can not be cloned|DataCloneError/i)
  })

  it('putSession stores a reactive session (import path: sessions.value = imported)', async () => {
    const sessions = ref([])
    sessions.value = [{ date: '2026-11-01', workouts: [{ equipmentId: 2, kg: 40, sets: 2 }] }]
    await storage.putSession(sessions.value[0])
    expect(await db.sessions.get('2026-11-01')).toEqual({ date: '2026-11-01', workouts: [{ equipmentId: 2, kg: 40, sets: 2 }] })
  })

  it('putSession stores a plain wrapper around reactive workouts (saveToday path)', async () => {
    const workouts = ref([{ equipmentId: 3, kg: 35, sets: 1 }, { equipmentId: 4, kg: 20, sets: 0 }])
    await storage.putSession({ date: '2026-11-19', workouts: workouts.value.filter(w => w.sets > 0) })
    expect((await db.sessions.get('2026-11-19')).workouts).toEqual([{ equipmentId: 3, kg: 35, sets: 1 }])
  })

  it('putMachineSetting / setEnabledEquipment accept reactive values (incl. v19 step fields)', async () => {
    const settings = reactive({ targetSets: 2, stepSize: 8, stepSizeManual: true, nested: { a: [1] } })
    await storage.putMachineSetting(12, settings)
    expect(await db.machineSettings.get(12)).toEqual({ equipmentId: 12, targetSets: 2, stepSize: 8, stepSizeManual: true, nested: { a: [1] } })
    await storage.setEnabledEquipment(reactive([1, 2, 3]))
    expect(await storage.getEnabledEquipment()).toEqual([1, 2, 3])
  })

  it('toStorable drops functions and undefined', () => {
    expect(toStorable({ a: 1, f() {}, u: undefined, r: reactive({ x: 1 }) })).toEqual({ a: 1, r: { x: 1 } })
  })
})

describe('JSON import through the app', () => {
  async function mountApp() {
    const wrapper = mount(App)
    // real IndexedDB (fake-indexeddb) resolves on macrotasks: wait until the cards rendered
    for (let i = 0; i < 50 && !wrapper.find('.workout-card').exists(); i++) {
      await new Promise(r => setTimeout(r, 10))
      await flushPromises()
    }
    return wrapper
  }

  it('imports the old happyfit-import-sessions.json and marks it for sync', async () => {
    const wrapper = await mountApp()
    const count = await wrapper.vm.applyImportedSessions(JSON.parse(JSON.stringify(seedFile)))
    expect(count).toBe(seedFile.length)
    expect(await db.sessions.count()).toBe(seedFile.length)
    expect(await db.syncMeta.where('dirty').equals(1).count()).toBe(seedFile.length)
  })

  it('export -> re-import round trip of a v19 backup', async () => {
    const wrapper = await mountApp()
    await wrapper.vm.applyImportedSessions(JSON.parse(JSON.stringify(seedFile)))
    // a v19 day with kg-only edit
    await storage.putSession({ date: '2026-11-19', workouts: [{ equipmentId: 12, kg: 101, sets: 0, kgEdited: true }] })
    const reloaded = await storage.getSessions()
    const exported = JSON.stringify(reloaded, null, 2) // same as exportData()

    await db.delete()
    await db.open()
    const fresh = await mountApp()
    const count = await fresh.vm.applyImportedSessions(JSON.parse(exported))
    expect(count).toBe(seedFile.length + 1)
    const stored = await storage.getSessions()
    expect(stored.sort((a, b) => a.date.localeCompare(b.date))).toEqual(JSON.parse(exported).sort((a, b) => a.date.localeCompare(b.date)))
  })

  it('accepts { sessions: [...] } and rejects invalid files', async () => {
    const wrapper = await mountApp()
    expect(await wrapper.vm.applyImportedSessions({ sessions: [{ date: '2026-01-01', workouts: [] }] })).toBe(1)
    await expect(wrapper.vm.applyImportedSessions({ foo: 1 })).rejects.toThrow(/Ungültiges Datenformat/)
  })

  it('a tap on the machine number persists the day (saveToday) in IndexedDB', async () => {
    const wrapper = await mountApp()
    const card = wrapper.findAll('.workout-card').find(c => c.find('.workout-name').text().replace(/\s+/g, ' ').trim() === 'Butterfly reverse')
    await card.find('.workout-nr').trigger('pointerdown')
    await card.find('.workout-nr').trigger('pointerup')
    await flushPromises()
    await new Promise(r => setTimeout(r, 20))
    const stored = await db.sessions.toArray()
    expect(stored).toHaveLength(1)
    expect(stored[0].workouts.find(w => w.equipmentId === 3).sets).toBe(1)
  })
})
