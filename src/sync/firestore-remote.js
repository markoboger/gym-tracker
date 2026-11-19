/**
 * Thin Firestore adapter used by the sync engine (users/{uid}/{kind}/{id}).
 */
export function createFirestoreRemote({ firestore, firestoreMod, uid }) {
  const { collection, doc, setDoc, onSnapshot, serverTimestamp } = firestoreMod
  return {
    subscribe(kind, onNext, onError) {
      return onSnapshot(
        collection(firestore, 'users', uid, kind),
        { includeMetadataChanges: true },
        snapshot => onNext({
          fromCache: snapshot.metadata.fromCache,
          changes: snapshot
            .docChanges()
            .filter(change => change.type !== 'removed')
            .map(change => ({
              id: change.doc.id,
              data: change.doc.data(),
              hasPendingWrites: change.doc.metadata.hasPendingWrites
            }))
        }),
        onError
      )
    },
    set(kind, id, data) {
      return setDoc(doc(firestore, 'users', uid, kind, String(id)), {
        ...data,
        serverUpdatedAt: serverTimestamp()
      })
    }
  }
}
