const DB_NAME = "milkonomy-cache"
const DB_VERSION = 1
const STORE_NAME = "kv"

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open IndexedDB"))
    }
  })
}

function withStore<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    const request = callback(store)

    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed"))
    }
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed"))
    }
    transaction.oncomplete = () => {
      db.close()
    }
    transaction.onabort = () => {
      db.close()
    }
  }))
}

export function getIndexedDbValue<T>(key: string) {
  return withStore<T | undefined>("readonly", store => store.get(key)).then(value => value ?? null)
}

export function setIndexedDbValue<T>(key: string, value: T) {
  return withStore("readwrite", store => store.put(value, key)).then(() => undefined)
}

export function removeIndexedDbValue(key: string) {
  return withStore("readwrite", store => store.delete(key)).then(() => undefined)
}
