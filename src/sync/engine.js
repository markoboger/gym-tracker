import { db as defaultDb, onLocalChange as defaultOnLocalChange, toStorable } from '../db/index.js'
import {
  KINDS,
  ENABLED_EQUIPMENT_DOC,
  LEGACY_UPDATED_AT,
  dayToRemote,
  dayFromRemote,
  machineToRemote,
  machineFromRemote,
  machineKeyFromDocId,
  configToRemote,
  configFromRemote,
  tombstone,
  resolveConflict
} from './mapping.js'

const SYNC_UID_KEY = 'sync:uid'
const SYNC_TABLES = db => [db.sessions, db.machineSettings, db.enabledEquipment, db.syncMeta]

/**
 * One-time (per account) migration: make every local record that predates sync
 * part of the outbox. Idempotent: records keep their key, so repeated runs only re-upload
 * the same documents; for the same uid it is a no-op.
 * Returns true when records were marked.
 */
export async function prepareForUser(db, uid) {
  const previous = await db.metadata.get(SYNC_UID_KEY)
  if (previous?.value === uid) return false

  await db.transaction('rw', [...SYNC_TABLES(db), db.metadata], async () => {
    const keys = []
    for (const date of await db.sessions.toCollection().primaryKeys()) keys.push(['days', String(date)])
    const machineIds = new Set((await db.machineSettings.toCollection().primaryKeys()).map(String))
    for (const id of machineIds) keys.push(['machines', id])
    if ((await db.enabledEquipment.count()) > 0) keys.push(['config', ENABLED_EQUIPMENT_DOC])

    for (const [kind, id] of keys) {
      const key = `${kind}/${id}`
      const meta = await db.syncMeta.get(key)
      if (meta) {
        await db.syncMeta.update(key, { dirty: 1 })
      } else {
        await db.syncMeta.put({ key, kind, id, updatedAt: LEGACY_UPDATED_AT, dirty: 1, deleted: false })
      }
    }
    // Tombstones of deleted days must reach the (new) account as well
    await db.syncMeta.filter(meta => meta.deleted).modify({ dirty: 1 })
    await db.metadata.put({ key: SYNC_UID_KEY, value: uid })
  })
  return true
}

async function getMachineRecord(db, id) {
  return (await db.machineSettings.get(machineKeyFromDocId(id))) ?? (await db.machineSettings.get(String(id)))
}

/** Build the Firestore document for a dirty syncMeta row (null = nothing to upload). */
export async function buildRemoteDoc(db, meta) {
  if (meta.deleted) return tombstone(meta.kind, meta.id, meta)
  if (meta.kind === 'days') {
    const session = await db.sessions.get(meta.id)
    return session ? dayToRemote(session, meta) : null
  }
  if (meta.kind === 'machines') {
    const record = await getMachineRecord(db, meta.id)
    return record ? machineToRemote({ ...record, equipmentId: machineKeyFromDocId(meta.id) }, meta) : null
  }
  if (meta.kind === 'config' && meta.id === ENABLED_EQUIPMENT_DOC) {
    const ids = (await db.enabledEquipment.toArray()).map(r => r.equipmentId)
    return configToRemote(ids, meta)
  }
  return null
}

async function writeLocal(db, kind, id, remoteData) {
  // Firestore data may carry class instances (Timestamp); store plain JSON only
  const data = toStorable(remoteData) || {}
  if (kind === 'days') {
    if (data.deleted) await db.sessions.delete(id)
    else await db.sessions.put(dayFromRemote(id, data))
  } else if (kind === 'machines') {
    // Older builds sometimes stored string keys; keep a single numeric record
    const key = machineKeyFromDocId(id)
    if (String(key) !== key) await db.machineSettings.delete(String(id))
    if (data.deleted) await db.machineSettings.delete(key)
    else await db.machineSettings.put(machineFromRemote(id, data))
  } else if (kind === 'config' && id === ENABLED_EQUIPMENT_DOC) {
    await db.enabledEquipment.clear()
    if (!data.deleted) {
      await db.enabledEquipment.bulkAdd(configFromRemote(data).map(equipmentId => ({ equipmentId })))
    }
  }
}

/**
 * Merge remote document changes into Dexie (last-write-wins per document).
 * Writes go straight to Dexie (not through `storage`) so they are not echoed back.
 * Returns true when local data changed.
 */
export async function applyRemoteChanges(db, kind, changes) {
  let changed = false
  await db.transaction('rw', SYNC_TABLES(db), async () => {
    for (const change of changes) {
      if (change.hasPendingWrites) continue // our own unacknowledged write
      const key = `${kind}/${change.id}`
      const meta = await db.syncMeta.get(key)
      const remoteUpdatedAt = Number(change.data?.updatedAt) || 0
      if (resolveConflict(meta, remoteUpdatedAt) !== 'apply') {
        if (meta && remoteUpdatedAt < meta.updatedAt && !meta.dirty) {
          await db.syncMeta.update(key, { dirty: 1 }) // local is newer but not queued: re-upload
        }
        continue
      }
      await writeLocal(db, kind, change.id, change.data || {})
      await db.syncMeta.put({
        key,
        kind,
        id: String(change.id),
        updatedAt: remoteUpdatedAt,
        dirty: 0,
        deleted: !!change.data?.deleted
      })
      changed = true
    }
  })
  return changed
}

/**
 * Sync engine: Dexie stays the source of truth for the UI and the durable outbox;
 * Firestore is the shared copy.
 *  - pull: onSnapshot listeners per collection merge remote changes into Dexie
 *  - push: dirty syncMeta rows are uploaded after the first server snapshot of every
 *          collection was merged (so stale local data never overwrites newer remote data)
 *
 * `remote` is an adapter ({ subscribe(kind, onSnapshot, onError), set(kind, id, data) })
 * so the engine can be tested without Firebase.
 */
export function createSyncEngine({
  db = defaultDb,
  remote,
  uid,
  onRemoteChange = () => {},
  onStatus = () => {},
  onLocalChange = defaultOnLocalChange,
  debounceMs = 400
}) {
  const unsubscribers = []
  const pulled = new Set()
  let applyQueue = Promise.resolve()
  let flushing = null
  let flushAgain = false
  let stopped = false
  let timer = null
  let lastError = null

  async function report(phase) {
    if (stopped) return
    const pending = await db.syncMeta.where('dirty').equals(1).count().catch(() => 0)
    onStatus({
      phase: lastError ? 'error' : phase ?? (pulled.size < KINDS.length ? 'connecting' : pending > 0 ? 'syncing' : 'synced'),
      pending,
      error: lastError
    })
  }

  function handleSnapshot(kind, snapshot) {
    applyQueue = applyQueue.then(async () => {
      if (stopped) return
      const changed = await applyRemoteChanges(db, kind, snapshot.changes || [])
      if (changed) onRemoteChange()
      if (!snapshot.fromCache && !pulled.has(kind)) {
        pulled.add(kind)
        if (pulled.size === KINDS.length) scheduleFlush(0)
      }
      if (!snapshot.fromCache) lastError = null
      await report()
    }).catch(err => {
      lastError = err
      console.error('[HappyFit] sync apply failed', err)
      return report()
    })
    return applyQueue
  }

  function scheduleFlush(delay = debounceMs) {
    if (stopped) return
    clearTimeout(timer)
    timer = setTimeout(() => { flush() }, delay)
  }

  async function flushOnce() {
    const dirty = await db.syncMeta.where('dirty').equals(1).toArray()
    if (dirty.length === 0) return
    await report('syncing')
    await Promise.all(dirty.map(async meta => {
      const data = await buildRemoteDoc(db, meta)
      if (data) await remote.set(meta.kind, meta.id, data)
      await db.transaction('rw', db.syncMeta, async () => {
        const current = await db.syncMeta.get(meta.key)
        if (current && current.updatedAt === meta.updatedAt) {
          await db.syncMeta.update(meta.key, { dirty: 0 })
        }
      })
    }))
  }

  /** Upload all dirty documents. Resolves when the server acknowledged them. */
  function flush() {
    if (stopped || pulled.size < KINDS.length) return Promise.resolve()
    if (flushing) {
      flushAgain = true
      return flushing
    }
    flushing = (async () => {
      try {
        do {
          flushAgain = false
          await flushOnce()
        } while (flushAgain && !stopped)
        lastError = null
      } catch (err) {
        lastError = err
        console.error('[HappyFit] sync upload failed', err)
      } finally {
        flushing = null
        await report()
      }
    })()
    return flushing
  }

  const onOnline = () => scheduleFlush(0)

  return {
    async start() {
      await prepareForUser(db, uid)
      await report('connecting')
      unsubscribers.push(onLocalChange(() => scheduleFlush()))
      for (const kind of KINDS) {
        unsubscribers.push(remote.subscribe(
          kind,
          snapshot => handleSnapshot(kind, snapshot),
          err => {
            lastError = err
            console.error(`[HappyFit] sync listener (${kind}) failed`, err)
            report()
          }
        ))
      }
      if (typeof window !== 'undefined') window.addEventListener('online', onOnline)
    },
    stop() {
      stopped = true
      clearTimeout(timer)
      for (const unsubscribe of unsubscribers.splice(0)) {
        try { unsubscribe?.() } catch { /* ignore */ }
      }
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline)
    },
    flush,
    /** For tests: wait until queued snapshot merges are done. */
    idle: () => applyQueue
  }
}
