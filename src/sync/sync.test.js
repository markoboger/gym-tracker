import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db, storage } from '../db/index.js'
import {
  dayToRemote, dayFromRemote, machineToRemote, machineFromRemote,
  configToRemote, configFromRemote, tombstone, resolveConflict, LEGACY_UPDATED_AT, KINDS
} from './mapping.js'
import { createSyncEngine, prepareForUser, applyRemoteChanges } from './engine.js'
import { readFirebaseConfig, isFirebaseConfigured, getFirebaseServices } from '../firebase.js'
import { initSync, syncState, __resetSyncForTests } from './index.js'

function fakeRemote() {
  const docs = { days: new Map(), machines: new Map(), config: new Map() }
  const listeners = {}
  return {
    docs,
    sets: [],
    subscribe(kind, onNext) {
      listeners[kind] = onNext
      return () => { delete listeners[kind] }
    },
    async set(kind, id, data) {
      this.sets.push({ kind, id, data })
      docs[kind].set(id, data)
    },
    emit(kind, changes = null, fromCache = false) {
      const list = changes ?? [...docs[kind]].map(([id, data]) => ({ id, data }))
      return listeners[kind]?.({ fromCache, changes: list })
    },
    async emitAllFromServer() {
      for (const kind of KINDS) await this.emit(kind)
    }
  }
}

async function startEngine(remote, opts = {}) {
  const engine = createSyncEngine({ remote, uid: 'u1', debounceMs: 0, ...opts })
  await engine.start()
  await remote.emitAllFromServer()
  await engine.idle()
  await engine.flush()
  return engine
}

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('mapping Dexie <-> Firestore', () => {
  it('round-trips a day and strips undefined values', () => {
    const session = { date: '2026-11-19', workouts: [{ equipmentId: 2, kg: 45, sets: 2, reps: 15, note: undefined }] }
    const doc = dayToRemote(session, { updatedAt: 123 })
    expect(doc).toMatchObject({ date: '2026-11-19', updatedAt: 123, deleted: false })
    expect('note' in doc.workouts[0]).toBe(false)
    expect(dayFromRemote('2026-11-19', doc)).toEqual({ date: '2026-11-19', workouts: [{ equipmentId: 2, kg: 45, sets: 2, reps: 15 }] })
  })

  it('round-trips machine settings with numeric equipment ids', () => {
    const record = { equipmentId: 7, targetSets: 4, stepSize: 5, startingKg: 50, countDirection: 'up', lastIncreaseDate: '2026-11-01' }
    const doc = machineToRemote(record, { updatedAt: 5 })
    expect(doc.settings).not.toHaveProperty('equipmentId')
    expect(machineFromRemote('7', doc)).toEqual(record)
    expect(machineFromRemote('7', { settings: { targetSets: 2 } }).equipmentId).toBe(7)
  })

  it('maps enabled equipment and tombstones', () => {
    expect(configFromRemote(configToRemote([1, 2, 3], { updatedAt: 9 }))).toEqual([1, 2, 3])
    expect(tombstone('days', '2026-01-01', { updatedAt: 3 })).toMatchObject({ deleted: true, date: '2026-01-01', updatedAt: 3 })
  })

  it('resolves conflicts last-write-wins, legacy ties go to remote', () => {
    expect(resolveConflict(undefined, 5)).toBe('apply')
    expect(resolveConflict({ updatedAt: 10 }, 11)).toBe('apply')
    expect(resolveConflict({ updatedAt: 10 }, 9)).toBe('keep')
    expect(resolveConflict({ updatedAt: 10 }, 10)).toBe('keep')
    expect(resolveConflict({ updatedAt: LEGACY_UPDATED_AT }, LEGACY_UPDATED_AT)).toBe('apply')
  })
})

describe('local change tracking', () => {
  it('marks writes through storage as dirty with monotonic updatedAt', async () => {
    await storage.putSession({ date: '2026-11-19', workouts: [] })
    const first = await db.syncMeta.get('days/2026-11-19')
    await storage.putSession({ date: '2026-11-19', workouts: [{ equipmentId: 1 }] })
    const second = await db.syncMeta.get('days/2026-11-19')
    expect(first.dirty).toBe(1)
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt)
    // stored record itself stays a plain session
    expect(await db.sessions.get('2026-11-19')).toEqual({ date: '2026-11-19', workouts: [{ equipmentId: 1 }] })
  })

  it('writes tombstones when sessions are reset', async () => {
    await storage.putSession({ date: '2026-11-18', workouts: [] })
    await storage.deleteSessions()
    expect(await db.syncMeta.get('days/2026-11-18')).toMatchObject({ deleted: true, dirty: 1 })
  })
})

describe('migration on first sign-in', () => {
  async function seedLegacy() {
    // data written before sync existed (no syncMeta rows)
    await db.sessions.bulkPut([{ date: '2026-11-01', workouts: [{ equipmentId: 2, kg: 40 }] }, { date: '2026-11-02', workouts: [] }])
    await db.machineSettings.put({ equipmentId: 2, targetSets: 4 })
    await db.enabledEquipment.bulkAdd([{ equipmentId: 1 }, { equipmentId: 2 }])
  }

  it('uploads all local data when the cloud is empty', async () => {
    await seedLegacy()
    const remote = fakeRemote()
    const engine = await startEngine(remote)
    expect([...remote.docs.days.keys()].sort()).toEqual(['2026-11-01', '2026-11-02'])
    expect(remote.docs.machines.get('2').settings).toEqual({ targetSets: 4 })
    expect(remote.docs.config.get('enabledEquipment').ids).toEqual([1, 2])
    expect(await db.syncMeta.where('dirty').equals(1).count()).toBe(0)
    engine.stop()
  })

  it('is idempotent: a second start for the same user uploads nothing again', async () => {
    await seedLegacy()
    const remote = fakeRemote()
    ;(await startEngine(remote)).stop()
    const uploads = remote.sets.length
    expect(await prepareForUser(db, 'u1')).toBe(false)
    ;(await startEngine(remote)).stop()
    expect(remote.sets.length).toBe(uploads)
    expect(remote.docs.days.size).toBe(2)
  })

  it('merges with existing cloud data by updatedAt', async () => {
    await seedLegacy()
    await storage.putSession({ date: '2026-11-03', workouts: [{ equipmentId: 2, kg: 50 }] }) // fresh local edit
    const remote = fakeRemote()
    remote.docs.days.set('2026-11-01', { date: '2026-11-01', workouts: [{ equipmentId: 2, kg: 42 }], updatedAt: 1000, deleted: false })
    remote.docs.days.set('2026-11-03', { date: '2026-11-03', workouts: [{ equipmentId: 2, kg: 30 }], updatedAt: 1000, deleted: false })
    remote.docs.days.set('2026-10-31', { date: '2026-10-31', workouts: [], updatedAt: 1000, deleted: false })
    const onRemoteChange = vi.fn()
    const engine = await startEngine(remote, { onRemoteChange })

    // remote newer than legacy local -> remote wins
    expect((await db.sessions.get('2026-11-01')).workouts[0].kg).toBe(42)
    // local edit (now) newer than remote -> local wins and is uploaded
    expect((await db.sessions.get('2026-11-03')).workouts[0].kg).toBe(50)
    expect(remote.docs.days.get('2026-11-03').workouts[0].kg).toBe(50)
    // remote-only and local-only days end up on both sides
    expect(await db.sessions.get('2026-10-31')).toBeTruthy()
    expect(remote.docs.days.has('2026-11-02')).toBe(true)
    expect(onRemoteChange).toHaveBeenCalled()
    engine.stop()
  })
})

describe('sync engine', () => {
  it('does not upload before the first server snapshot (offline start)', async () => {
    await storage.putSession({ date: '2026-11-19', workouts: [] })
    const remote = fakeRemote()
    const engine = createSyncEngine({ remote, uid: 'u1', debounceMs: 0 })
    await engine.start()
    for (const kind of KINDS) await remote.emit(kind, [], true) // cache only
    await engine.flush()
    expect(remote.sets).toHaveLength(0)
    expect(await db.syncMeta.where('dirty').equals(1).count()).toBe(1) // stays in outbox
    await remote.emitAllFromServer()
    await engine.idle()
    await engine.flush()
    expect(remote.docs.days.has('2026-11-19')).toBe(true)
    engine.stop()
  })

  it('pushes local edits made after sync started', async () => {
    const remote = fakeRemote()
    const engine = await startEngine(remote)
    await storage.putMachineSetting(5, { targetSets: 5, stepSize: 2.5 })
    await engine.flush()
    expect(remote.docs.machines.get('5')).toMatchObject({ equipmentId: 5, settings: { targetSets: 5, stepSize: 2.5 } })
    engine.stop()
  })

  it('applies remote edits and tombstones from another device', async () => {
    const remote = fakeRemote()
    const onRemoteChange = vi.fn()
    const engine = await startEngine(remote, { onRemoteChange })
    await remote.emit('days', [{ id: '2026-11-10', data: { date: '2026-11-10', workouts: [{ equipmentId: 3 }], updatedAt: Date.now() + 1000 } }])
    await engine.idle()
    expect(await db.sessions.get('2026-11-10')).toEqual({ date: '2026-11-10', workouts: [{ equipmentId: 3 }] })
    await remote.emit('days', [{ id: '2026-11-10', data: { date: '2026-11-10', deleted: true, updatedAt: Date.now() + 2000 } }])
    await engine.idle()
    expect(await db.sessions.get('2026-11-10')).toBeUndefined()
    await remote.emit('config', [{ id: 'enabledEquipment', data: { ids: [4, 5], updatedAt: Date.now() + 1000 } }])
    await engine.idle()
    expect((await db.enabledEquipment.toArray()).map(r => r.equipmentId)).toEqual([4, 5])
    expect(onRemoteChange).toHaveBeenCalledTimes(3)
    engine.stop()
  })

  it('ignores own echoes and pending writes', async () => {
    const remote = fakeRemote()
    const onRemoteChange = vi.fn()
    const engine = await startEngine(remote, { onRemoteChange })
    await storage.putSession({ date: '2026-11-19', workouts: [{ equipmentId: 1, sets: 1 }] })
    await engine.flush()
    const doc = remote.docs.days.get('2026-11-19')
    await remote.emit('days', [{ id: '2026-11-19', data: doc }])
    await remote.emit('days', [{ id: '2026-11-19', data: { ...doc, updatedAt: doc.updatedAt + 5, workouts: [] }, hasPendingWrites: true }])
    await engine.idle()
    expect(onRemoteChange).not.toHaveBeenCalled()
    expect((await db.sessions.get('2026-11-19')).workouts).toHaveLength(1)
    engine.stop()
  })

  it('keeps a newer local edit over an older remote change', async () => {
    const remote = fakeRemote()
    const engine = await startEngine(remote)
    await storage.putSession({ date: '2026-11-19', workouts: [{ equipmentId: 1, sets: 2 }] })
    await remote.emit('days', [{ id: '2026-11-19', data: { date: '2026-11-19', workouts: [], updatedAt: 10 } }])
    await engine.idle()
    expect((await db.sessions.get('2026-11-19')).workouts).toHaveLength(1)
    await engine.flush()
    expect(remote.docs.days.get('2026-11-19').workouts).toHaveLength(1)
    engine.stop()
  })

  it('applyRemoteChanges merges string-keyed legacy machine records into one numeric record', async () => {
    await db.machineSettings.put({ equipmentId: '9', targetSets: 2 })
    await applyRemoteChanges(db, 'machines', [{ id: '9', data: { equipmentId: 9, settings: { targetSets: 5 }, updatedAt: 50 } }])
    expect(await db.machineSettings.toArray()).toEqual([{ equipmentId: 9, targetSets: 5 }])
  })
})

describe('local-only mode without Firebase config', () => {
  beforeEach(() => __resetSyncForTests())

  it('readFirebaseConfig returns null when required values are missing', () => {
    expect(readFirebaseConfig({})).toBeNull()
    expect(readFirebaseConfig({ VITE_FIREBASE_PROJECT_ID: 'happyfit-b264a', VITE_FIREBASE_AUTH_DOMAIN: 'happyfit-b264a.firebaseapp.com' })).toBeNull()
    expect(isFirebaseConfigured({})).toBe(false)
    const full = {
      VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_AUTH_DOMAIN: 'happyfit-b264a.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'happyfit-b264a', VITE_FIREBASE_APP_ID: 'a'
    }
    expect(readFirebaseConfig(full)).toMatchObject({ apiKey: 'k', projectId: 'happyfit-b264a', appId: 'a' })
  })

  it('getFirebaseServices resolves to null and loads no SDK', async () => {
    await expect(getFirebaseServices({})).resolves.toBeNull()
  })

  it('initSync stays local-only and never throws', async () => {
    const state = await initSync({ getServices: () => Promise.resolve(null) })
    expect(state.available).toBe(false)
    expect(state.status).toBe('local')
    __resetSyncForTests()
    const failing = await initSync({ getServices: () => Promise.reject(new Error('boom')) })
    expect(syncState.status).toBe('local')
    expect(failing.available).toBe(false)
  })

  it('storage keeps working without sync', async () => {
    await storage.putSession({ date: '2026-11-19', workouts: [] })
    expect(await storage.getSessions()).toHaveLength(1)
  })
})
