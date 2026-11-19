/**
 * Mapping between the local Dexie records and Firestore documents.
 *
 * Firestore layout (all under the signed-in user):
 *   users/{uid}/days/{yyyy-mm-dd}          { date, workouts: [...], updatedAt, deleted, schema }
 *   users/{uid}/machines/{equipmentId}     { equipmentId, settings: {...}, updatedAt, deleted, schema }
 *   users/{uid}/config/enabledEquipment    { ids: [...], updatedAt, deleted, schema }
 *
 * updatedAt is a client clock in ms used for last-write-wins per document.
 * Deletions are written as tombstones (deleted: true) so they propagate to other devices.
 */

export const SCHEMA_VERSION = 1
export const KINDS = ['days', 'machines', 'config']
export const ENABLED_EQUIPMENT_DOC = 'enabledEquipment'

/** updatedAt given to local records that existed before sync was ever enabled. */
export const LEGACY_UPDATED_AT = 1

/** Firestore rejects undefined and functions; JSON round trip yields plain, storable data. */
export function plain(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value))
}

/** Firestore doc ids are strings; Dexie machine keys are numeric equipment ids. */
export function machineKeyFromDocId(id) {
  return /^\d+$/.test(String(id)) ? Number(id) : id
}

export function dayToRemote(session, meta) {
  return {
    schema: SCHEMA_VERSION,
    date: session.date,
    workouts: plain(Array.isArray(session.workouts) ? session.workouts : []),
    updatedAt: meta.updatedAt,
    deleted: false
  }
}

export function dayFromRemote(id, data) {
  return {
    date: data.date || id,
    workouts: Array.isArray(data.workouts) ? data.workouts : []
  }
}

export function machineToRemote(record, meta) {
  const { equipmentId, ...settings } = record
  return {
    schema: SCHEMA_VERSION,
    equipmentId: machineKeyFromDocId(equipmentId),
    settings: plain(settings),
    updatedAt: meta.updatedAt,
    deleted: false
  }
}

export function machineFromRemote(id, data) {
  return {
    ...(data.settings || {}),
    equipmentId: machineKeyFromDocId(data.equipmentId ?? id)
  }
}

export function configToRemote(ids, meta) {
  return {
    schema: SCHEMA_VERSION,
    ids: plain(ids),
    updatedAt: meta.updatedAt,
    deleted: false
  }
}

export function configFromRemote(data) {
  return Array.isArray(data.ids) ? data.ids : []
}

export function tombstone(kind, id, meta) {
  const doc = { schema: SCHEMA_VERSION, updatedAt: meta.updatedAt, deleted: true }
  if (kind === 'days') {
    doc.date = id
    doc.workouts = []
  }
  return doc
}

/**
 * Last-write-wins decision for one incoming remote document.
 * Returns 'apply' (overwrite local), 'keep' (local is newer or identical).
 * Ties go to the remote copy only while the local copy is still a never-edited legacy
 * record, so the first device that migrates its data defines the shared history.
 */
export function resolveConflict(localMeta, remoteUpdatedAt) {
  const remote = Number(remoteUpdatedAt) || 0
  if (!localMeta) return 'apply'
  const local = localMeta.updatedAt || 0
  if (remote > local) return 'apply'
  if (remote === local && local <= LEGACY_UPDATED_AT) return 'apply'
  return 'keep'
}
