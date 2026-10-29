import { describe, it, expect, beforeEach } from 'vitest'
import { db, storage, migrateFromLocalStorage } from '../db/index.js'

describe('Dexie Database Layer', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    localStorage.clear()
  })

  describe('storage.getSessions', () => {
    it('returns empty array when no sessions exist', async () => {
      const sessions = await storage.getSessions()
      expect(sessions).toEqual([])
    })

    it('returns all sessions', async () => {
      await db.sessions.bulkAdd([
        { date: '2025-10-01', workouts: [] },
        { date: '2025-10-02', workouts: [] }
      ])
      const sessions = await storage.getSessions()
      expect(sessions).toHaveLength(2)
      expect(sessions.map(s => s.date)).toContain('2025-10-01')
      expect(sessions.map(s => s.date)).toContain('2025-10-02')
    })
  })

  describe('storage.getSession', () => {
    it('returns null when session does not exist', async () => {
      const session = await storage.getSession('2025-10-01')
      expect(session).toBeUndefined()
    })

    it('returns session by date', async () => {
      const testSession = { 
        date: '2025-10-01', 
        workouts: [{ equipmentId: 1, kg: 50, sets: 3, reps: 10 }] 
      }
      await db.sessions.put(testSession)
      
      const session = await storage.getSession('2025-10-01')
      expect(session).toEqual(testSession)
    })
  })

  describe('storage.putSession', () => {
    it('creates a new session', async () => {
      const testSession = { date: '2025-10-01', workouts: [] }
      await storage.putSession(testSession)
      
      const saved = await db.sessions.get('2025-10-01')
      expect(saved).toEqual(testSession)
    })

    it('updates an existing session', async () => {
      await db.sessions.put({ date: '2025-10-01', workouts: [] })
      
      const updated = { date: '2025-10-01', workouts: [{ equipmentId: 1 }] }
      await storage.putSession(updated)
      
      const saved = await db.sessions.get('2025-10-01')
      expect(saved.workouts).toHaveLength(1)
    })
  })

  describe('storage.deleteSessions', () => {
    it('clears all sessions', async () => {
      await db.sessions.bulkAdd([
        { date: '2025-10-01', workouts: [] },
        { date: '2025-10-02', workouts: [] }
      ])
      
      await storage.deleteSessions()
      
      const sessions = await db.sessions.toArray()
      expect(sessions).toHaveLength(0)
    })
  })

  describe('storage.getMachineSettings', () => {
    it('returns empty object when no settings exist', async () => {
      const settings = await storage.getMachineSettings()
      expect(settings).toEqual({})
    })

    it('returns all machine settings', async () => {
      await db.machineSettings.bulkAdd([
        { equipmentId: 1, targetSets: 3, stepSize: 5 },
        { equipmentId: 2, targetSets: 2, stepSize: 2.5 }
      ])
      
      const settings = await storage.getMachineSettings()
      expect(Object.keys(settings)).toHaveLength(2)
      expect(settings[1]).toEqual({ targetSets: 3, stepSize: 5 })
      expect(settings[2]).toEqual({ targetSets: 2, stepSize: 2.5 })
    })
  })

  describe('storage.getMachineSetting', () => {
    it('returns null when setting does not exist', async () => {
      const setting = await storage.getMachineSetting(1)
      expect(setting).toBeNull()
    })

    it('returns machine setting without equipmentId field', async () => {
      await db.machineSettings.put({ 
        equipmentId: 1, 
        targetSets: 3, 
        stepSize: 5,
        startingKg: 50
      })
      
      const setting = await storage.getMachineSetting(1)
      expect(setting).toEqual({ targetSets: 3, stepSize: 5, startingKg: 50 })
      expect(setting).not.toHaveProperty('equipmentId')
    })
  })

  describe('storage.putMachineSetting', () => {
    it('saves machine settings', async () => {
      await storage.putMachineSetting(1, { 
        targetSets: 3, 
        stepSize: 5,
        startingKg: 50,
        countDirection: 'up'
      })
      
      const saved = await db.machineSettings.get(1)
      expect(saved.equipmentId).toBe(1)
      expect(saved.targetSets).toBe(3)
      expect(saved.stepSize).toBe(5)
    })
  })

  describe('storage.getEnabledEquipment', () => {
    it('returns empty array when no equipment enabled', async () => {
      const equipment = await storage.getEnabledEquipment()
      expect(equipment).toEqual([])
    })

    it('returns all enabled equipment IDs', async () => {
      await db.enabledEquipment.bulkAdd([
        { equipmentId: 1 },
        { equipmentId: 2 },
        { equipmentId: 3 }
      ])
      
      const equipment = await storage.getEnabledEquipment()
      expect(equipment).toEqual([1, 2, 3])
    })
  })

  describe('storage.setEnabledEquipment', () => {
    it('clears and saves enabled equipment', async () => {
      await db.enabledEquipment.bulkAdd([
        { equipmentId: 1 },
        { equipmentId: 2 }
      ])
      
      await storage.setEnabledEquipment([3, 4, 5])
      
      const equipment = await storage.getEnabledEquipment()
      expect(equipment).toEqual([3, 4, 5])
    })
  })

  describe('migrateFromLocalStorage', () => {
    it('migrates sessions from localStorage', async () => {
      const sessions = [
        { date: '2025-10-01', workouts: [] },
        { date: '2025-10-02', workouts: [] }
      ]
      localStorage.setItem('happyfit-sessions', JSON.stringify(sessions))
      
      await migrateFromLocalStorage()
      
      const migrated = await storage.getSessions()
      expect(migrated).toHaveLength(2)
    })

    it('migrates machine settings from localStorage', async () => {
      const settings = {
        1: { targetSets: 3, stepSize: 5 },
        2: { targetSets: 2, stepSize: 2.5 }
      }
      localStorage.setItem('happyfit-machine-settings', JSON.stringify(settings))
      
      await migrateFromLocalStorage()
      
      const migrated = await storage.getMachineSettings()
      expect(Object.keys(migrated)).toHaveLength(2)
      expect(migrated[1]).toEqual({ targetSets: 3, stepSize: 5 })
    })

    it('migrates enabled equipment from localStorage', async () => {
      localStorage.setItem('happyfit-enabled-equipment', JSON.stringify([1, 2, 3]))
      
      await migrateFromLocalStorage()
      
      const equipment = await storage.getEnabledEquipment()
      expect(equipment).toEqual([1, 2, 3])
    })

    it('is idempotent - does not migrate twice', async () => {
      localStorage.setItem('happyfit-sessions', JSON.stringify([
        { date: '2025-10-01', workouts: [] }
      ]))
      
      await migrateFromLocalStorage()
      
      localStorage.setItem('happyfit-sessions', JSON.stringify([
        { date: '2025-10-01', workouts: [] },
        { date: '2025-10-02', workouts: [] }
      ]))
      
      await migrateFromLocalStorage()
      
      const sessions = await storage.getSessions()
      expect(sessions).toHaveLength(1)
    })

    it('handles missing localStorage data gracefully', async () => {
      await expect(migrateFromLocalStorage()).resolves.not.toThrow()
    })

    it('handles invalid JSON in localStorage gracefully', async () => {
      localStorage.setItem('happyfit-sessions', 'invalid json')
      await expect(migrateFromLocalStorage()).rejects.toThrow()
    })
  })
})
