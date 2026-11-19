# Firebase Cloud-Sync (optional)

HappyFit keeps Dexie/IndexedDB as the local store the UI reads from. When Firebase is
configured and the user signs in with Google, a sync layer mirrors the data to Firestore:

- `src/db/index.js` – every write via `storage` also stamps `syncMeta` (`updatedAt`, `dirty`) = durable outbox
- `src/sync/engine.js` – onSnapshot listeners merge remote docs into Dexie (last-write-wins per doc),
  dirty rows are uploaded after the first server snapshot; first sign-in marks existing local data for upload
- `src/sync/mapping.js` – Dexie <-> Firestore document mapping
- `src/sync/firestore-remote.js`, `src/firebase.js` – lazy Firebase SDK init (Auth + Firestore, memory cache)
- `src/components/SyncStatus.vue` – sign-in / status block in the "Geräte konfigurieren" dialog

Firestore layout: `users/{uid}/days/{yyyy-mm-dd}`, `users/{uid}/machines/{equipmentId}`,
`users/{uid}/config/enabledEquipment`; each doc has `updatedAt` (ms, LWW clock), `deleted` (tombstone),
`schema`, `serverUpdatedAt`.

Config: Vite env vars, see `.env.example` (local: `.env.local`; CI: repository Actions *variables*
`VITE_FIREBASE_*`). Missing config = local-only, the SDK is never loaded.

Rules: `firestore.rules` (only the owner can read/write `users/{uid}/**`).
Deploy with `npx firebase-tools deploy --only firestore:rules` (project in `.firebaserc`).
