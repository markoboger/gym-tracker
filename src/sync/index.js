import { reactive } from 'vue'
import { getFirebaseServices } from '../firebase.js'
import { createSyncEngine } from './engine.js'
import { createFirestoreRemote } from './firestore-remote.js'

/**
 * Reactive sync status for the UI.
 * status: 'local' (no Firebase config) | 'signed-out' | 'connecting' | 'syncing'
 *         | 'synced' | 'offline' | 'error'
 */
export const syncState = reactive({
  available: false,
  status: 'local',
  user: null,
  pending: 0,
  error: null,
  lastSyncedAt: null
})

let services = null
let engine = null
let started = false

function isStandalonePwa() {
  if (typeof window === 'undefined') return false
  return window.navigator?.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)')?.matches === true
}

function applyStatus({ phase, pending, error }) {
  syncState.pending = pending
  syncState.error = error ? String(error.message || error) : null
  const online = typeof navigator === 'undefined' || navigator.onLine !== false
  if (phase === 'synced') syncState.lastSyncedAt = new Date().toISOString()
  syncState.status = !online && phase !== 'error' ? 'offline' : phase
}

/**
 * Start optional cloud sync. Never throws: without config or on any Firebase problem the
 * app simply stays local-only.
 */
export async function initSync({ onRemoteChange = () => {}, getServices = getFirebaseServices } = {}) {
  if (started) return syncState
  started = true
  try {
    services = await getServices()
  } catch (err) {
    console.warn('[HappyFit] Firebase init failed, staying local-only', err)
    services = null
  }
  if (!services) {
    syncState.available = false
    syncState.status = 'local'
    return syncState
  }

  syncState.available = true
  syncState.status = 'signed-out'
  const { auth, authMod, firestore, firestoreMod } = services

  // Completes a redirect sign-in (fallback flow), errors are shown in the status
  authMod.getRedirectResult(auth).catch(err => {
    syncState.error = String(err.message || err)
  })

  authMod.onAuthStateChanged(auth, async user => {
    engine?.stop()
    engine = null
    syncState.user = user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null
    if (!user) {
      syncState.status = 'signed-out'
      syncState.pending = 0
      return
    }
    syncState.status = 'connecting'
    const current = createSyncEngine({
      remote: createFirestoreRemote({ firestore, firestoreMod, uid: user.uid }),
      uid: user.uid,
      onRemoteChange,
      onStatus: applyStatus
    })
    engine = current
    try {
      await current.start()
    } catch (err) {
      console.error('[HappyFit] sync start failed', err)
      syncState.status = 'error'
      syncState.error = String(err.message || err)
    }
  })

  if (typeof window !== 'undefined') {
    window.addEventListener('offline', () => { if (syncState.user) syncState.status = 'offline' })
  }
  return syncState
}

const REDIRECT_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported'
])

/** Google sign-in: popup first, redirect as fallback (e.g. iOS home-screen PWA). */
export async function signIn() {
  if (!services) return
  const { auth, authMod } = services
  const provider = new authMod.GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  syncState.error = null
  try {
    await authMod.signInWithPopup(auth, provider)
  } catch (err) {
    if (REDIRECT_FALLBACK_CODES.has(err?.code) || (isStandalonePwa() && err?.code === 'auth/internal-error')) {
      await authMod.signInWithRedirect(auth, provider)
      return
    }
    if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
      syncState.error = String(err.message || err)
    }
  }
}

export async function signOut() {
  if (!services) return
  engine?.stop()
  engine = null
  await services.authMod.signOut(services.auth)
}

/** Manually trigger an upload (e.g. "Jetzt synchronisieren"). */
export function syncNow() {
  return engine?.flush()
}

/** Test helper */
export function __resetSyncForTests() {
  engine?.stop()
  engine = null
  services = null
  started = false
  Object.assign(syncState, { available: false, status: 'local', user: null, pending: 0, error: null, lastSyncedAt: null })
}
