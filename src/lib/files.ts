/* Original resume files, kept in this browser's IndexedDB (too big for the
 * shared store). The tracker attaches them when sharing with a client. */

const DB = 'hirelens-files', STORE = 'resumes'

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

export interface StoredFile { name: string; type: string; blob: Blob; savedAt: number }

export async function saveOriginal(candidateId: string, file: File): Promise<boolean> {
  try {
    const db = await open()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ name: file.name, type: file.type || 'application/octet-stream', blob: file, savedAt: Date.now() } satisfies StoredFile, candidateId)
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error)
    })
    return true
  } catch { return false }
}

export async function getOriginal(candidateId: string): Promise<StoredFile | null> {
  try {
    const db = await open()
    return await new Promise((res) => {
      const r = db.transaction(STORE).objectStore(STORE).get(candidateId)
      r.onsuccess = () => res((r.result as StoredFile) || null); r.onerror = () => res(null)
    })
  } catch { return null }
}
