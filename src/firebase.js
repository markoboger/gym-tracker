/**
 * Optional Firebase setup. Configuration comes from Vite env vars (see .env.example).
 * Without a complete config the app runs local-only and never loads the Firebase SDK
 * (the SDK is imported lazily, so it is not part of the main bundle).
 */

const ENV_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID'
}

const REQUIRED = ['apiKey', 'authDomain', 'projectId', 'appId']

export function readFirebaseConfig(env = import.meta.env) {
  const config = {}
  for (const [field, envKey] of Object.entries(ENV_KEYS)) {
    const value = env?.[envKey]
    if (typeof value === 'string' && value.trim()) config[field] = value.trim()
  }
  return REQUIRED.every(field => config[field]) ? config : null
}

export function isFirebaseConfigured(env = import.meta.env) {
  return readFirebaseConfig(env) !== null
}

let servicesPromise = null

/**
 * Lazily initialise Firebase App, Auth and Firestore. Resolves to null when not configured.
 *
 * Firestore uses the in-memory cache on purpose: Dexie already is the durable offline
 * store and outbox, so a second IndexedDB cache would only add multi-tab locking and
 * iOS WebKit storage issues without improving offline behaviour.
 */
export function getFirebaseServices(env = import.meta.env) {
  const config = readFirebaseConfig(env)
  if (!config) return Promise.resolve(null)
  if (!servicesPromise) {
    servicesPromise = (async () => {
      const [appMod, authMod, firestoreMod] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore')
      ])
      const app = appMod.initializeApp(config)
      const auth = authMod.initializeAuth(app, {
        persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence],
        popupRedirectResolver: authMod.browserPopupRedirectResolver
      })
      const firestore = firestoreMod.initializeFirestore(app, {
        localCache: firestoreMod.memoryLocalCache(),
        ignoreUndefinedProperties: true
      })
      return { app, auth, firestore, authMod, firestoreMod }
    })().catch(err => {
      servicesPromise = null
      throw err
    })
  }
  return servicesPromise
}
