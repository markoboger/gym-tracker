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

db.version(1).stores({
  sessions: 'date',
  machineSettings: 'equipmentId',
  enabledEquipment: '++id',
  metadata: 'key'
})

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
        await db.sessions.bulkPut(sessions)
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
    await db.sessions.put(session)
  },

  async deleteSessions() {
    await db.sessions.clear()
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
    await db.machineSettings.put({ equipmentId, ...settings })
  },

  async getEnabledEquipment() {
    const records = await db.enabledEquipment.toArray()
    return records.map(r => r.equipmentId)
  },

  async setEnabledEquipment(equipmentIds) {
    await db.enabledEquipment.clear()
    const records = equipmentIds.map(equipmentId => ({ equipmentId }))
    await db.enabledEquipment.bulkAdd(records)
  }
}
