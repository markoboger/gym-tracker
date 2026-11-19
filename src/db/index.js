import Dexie from 'dexie'

/**
 * HappyFit IndexedDB via Dexie.js
 * 
 * Schema:
 * - sessions: workout sessions keyed by date (ISO string)
 * - machineSettings: per-machine configuration keyed by equipmentId
 * - enabledEquipment: list of enabled equipment IDs
 * - metadata: app-level config (e.g., migration version)
 */

export const db = new Dexie('HappyFitDB')

/**
 * Plain, structured-clone-safe copy of app data before it goes into IndexedDB.
 * The UI hands in Vue reactive proxies (e.g. sessions.value[i], workouts.value.filter(...)),
 * and IndexedDB's structured clone rejects Proxy objects with
 * "DataCloneError: The object can not be cloned." (WebKit) / "#<Object> could not be cloned." (V8).
 * A JSON round trip also drops functions/undefined; app data is plain JSON anyway.
 */
export function toStorable(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

db.version(1).stores({
  sessions: 'date',
  machineSettings: 'equipmentId',
  enabledEquipment: '++id',
  metadata: 'key'
})

// v2: sync bookkeeping for the optional Firebase sync (see src/sync/).
// One row per synced document: key = `${kind}/${id}` (kind: days | machines | config),
// updatedAt = last-write-wins clock (ms), dirty = 1 while the change still has to be
// uploaded (doubles as a durable offline outbox), deleted = tombstone flag.
// Records in the other tables stay untouched, so the UI keeps reading plain Dexie data.
db.version(2).stores({
  sessions: 'date',
  machineSettings: 'equipmentId',
  enabledEquipment: '++id',
  metadata: 'key',
  syncMeta: 'key, dirty'
})

const localChangeListeners = new Set()

/** Subscribe to local writes made through `storage` (used by the sync engine). */
export function onLocalChange(listener) {
  localChangeListeners.add(listener)
  return () => localChangeListeners.delete(listener)
}

function notifyLocalChange() {
  for (const listener of localChangeListeners) {
    try { listener() } catch (err) { console.error('[HappyFit] change listener failed', err) }
  }
}

/**
 * Mark a document as locally changed. updatedAt is monotonic per key so a new local edit
 * always wins over whatever version this device has seen before (protects against clock skew).
 * Must run inside a transaction that includes db.syncMeta.
 */
export async function touchSyncMeta(kind, id, { deleted = false, now = Date.now() } = {}) {
  const key = `${kind}/${id}`
  const previous = await db.syncMeta.get(key)
  const updatedAt = Math.max(now, (previous?.updatedAt || 0) + 1)
  await db.syncMeta.put({ key, kind, id: String(id), updatedAt, dirty: 1, deleted })
}

// Migration flag
const MIGRATION_KEY = 'migrated_from_localstorage'

/**
 * Migrate data from localStorage to Dexie (idempotent)
 * Called once on app init
 */
export async function migrateFromLocalStorage() {
  const migrated = await db.metadata.get(MIGRATION_KEY)
  if (migrated?.value) {
    return
  }

  console.log('[HappyFit] Migrating data from localStorage to IndexedDB...')

  try {
    // Migrate sessions
    const sessionsJSON = localStorage.getItem('happyfit-sessions')
    if (sessionsJSON) {
      const sessions = JSON.parse(sessionsJSON)
      if (Array.isArray(sessions)) {
        await db.sessions.bulkPut(toStorable(sessions))
        console.log(`[HappyFit] Migrated ${sessions.length} sessions`)
      }
    }

    // Migrate machine settings
    const machineSettingsJSON = localStorage.getItem('happyfit-machine-settings')
    if (machineSettingsJSON) {
      const machineSettings = JSON.parse(machineSettingsJSON)
      const records = Object.entries(machineSettings).map(([equipmentId, settings]) => ({
        equipmentId,
        ...settings
      }))
      if (records.length > 0) {
        await db.machineSettings.bulkPut(records)
        console.log(`[HappyFit] Migrated ${records.length} machine settings`)
      }
    }

    // Migrate enabled equipment
    const enabledEquipmentJSON = localStorage.getItem('happyfit-enabled-equipment')
    if (enabledEquipmentJSON) {
      const enabledEquipment = JSON.parse(enabledEquipmentJSON)
      if (Array.isArray(enabledEquipment)) {
        const records = enabledEquipment.map(equipmentId => ({ equipmentId }))
        await db.enabledEquipment.bulkAdd(records)
        console.log(`[HappyFit] Migrated ${records.length} enabled equipment entries`)
      }
    }

    // Mark migration complete
    await db.metadata.put({ key: MIGRATION_KEY, value: true })
    console.log('[HappyFit] Migration complete')
  } catch (error) {
    console.error('[HappyFit] Migration failed:', error)
    throw error
  }
}

/**
 * Storage API abstraction (drop-in replacement for localStorage patterns)
 */
export const storage = {
  async getSessions() {
    return await db.sessions.toArray()
  },

  async getSession(date) {
    return await db.sessions.get(date)
  },

  async putSession(session) {
    await db.transaction('rw', db.sessions, db.syncMeta, async () => {
      const record = toStorable(session)
      await db.sessions.put(record)
      await touchSyncMeta('days', record.date)
    })
    notifyLocalChange()
  },

  async deleteSessions() {
    await db.transaction('rw', db.sessions, db.syncMeta, async () => {
      const dates = await db.sessions.toCollection().primaryKeys()
      await db.sessions.clear()
      // Tombstones so the deletion also reaches the cloud and other devices
      for (const date of dates) {
        await touchSyncMeta('days', date, { deleted: true })
      }
    })
    notifyLocalChange()
  },

  async getMachineSettings() {
    const records = await db.machineSettings.toArray()
    return records.reduce((acc, { equipmentId, ...settings }) => {
      acc[equipmentId] = settings
      return acc
    }, {})
  },

  async getMachineSetting(equipmentId) {
    const record = await db.machineSettings.get(equipmentId)
    if (!record) return null
    const { equipmentId: _, ...settings } = record
    return settings
  },

  async putMachineSetting(equipmentId, settings) {
    await db.transaction('rw', db.machineSettings, db.syncMeta, async () => {
      await db.machineSettings.put({ ...toStorable(settings), equipmentId })
      await touchSyncMeta('machines', equipmentId)
    })
    notifyLocalChange()
  },

  async getEnabledEquipment() {
    const records = await db.enabledEquipment.toArray()
    return records.map(r => r.equipmentId)
  },

  async setEnabledEquipment(equipmentIds) {
    await db.transaction('rw', db.enabledEquipment, db.syncMeta, async () => {
      await db.enabledEquipment.clear()
      const records = toStorable(Array.from(equipmentIds)).map(equipmentId => ({ equipmentId }))
      await db.enabledEquipment.bulkAdd(records)
      await touchSyncMeta('config', 'enabledEquipment')
    })
    notifyLocalChange()
  }
}
