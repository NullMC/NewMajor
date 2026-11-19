// Archivio IndexedDB minimale per i file caricati prima del login (carrello ospite).
const DB_NAME = 'newmajor'
const STORE = 'blobs'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const blobStore = {
  set: (key: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, key)).then(() => undefined),
  get: (key: string) => tx<Blob | undefined>('readonly', (s) => s.get(key)),
  del: (key: string) => tx('readwrite', (s) => s.delete(key)).then(() => undefined),
}
