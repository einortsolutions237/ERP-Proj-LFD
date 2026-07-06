// Thin promise wrapper over the raw IndexedDB API — this project has no
// existing client-storage dependency and the need here (two object stores,
// basic CRUD) doesn't justify adding one. Every function in this module
// must only ever be called from client-side code (event handlers, effects)
// — IndexedDB doesn't exist during Next.js server rendering.

const DB_NAME = 'lfd-pos-offline'
const DB_VERSION = 1
export const QUEUE_STORE = 'queuedSales'
export const CATALOG_STORE = 'catalogCache'

let dbPromise: Promise<IDBDatabase> | null = null

export function openOfflineDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'idempotencyKey' })
      }
      if (!db.objectStoreNames.contains(CATALOG_STORE)) {
        db.createObjectStore(CATALOG_STORE, { keyPath: 'branchId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export async function dbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openOfflineDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put(value)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function dbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openOfflineDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

export async function dbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openOfflineDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

export async function dbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openOfflineDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
