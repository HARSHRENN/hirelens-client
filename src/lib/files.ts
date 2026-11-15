import { api, supaSync } from './cloud'
import { MODE } from './runtime'

/* Original resume files. A signed-in workspace keeps them in private server storage
 * (one folder per account); the demo and the Claude preview keep them in this browser's
 * IndexedDB. The tracker attaches them when sharing with a client. */

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
  if (MODE() === 'cloud') {
    try {
      const { path, token } = await api<{ path: string; token: string }>('app', 'upload-url', { candidateId })
      const { error } = await supaSync()!.storage.from('resumes').uploadToSignedUrl(path, token, file, { contentType: file.type || 'application/octet-stream', upsert: true })
      return !error
    } catch { return false }
  }
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

export async function getOriginal(candidateId: string, name = 'resume'): Promise<StoredFile | null> {
  if (MODE() === 'cloud') {
    try {
      const { url } = await api<{ url: string }>('app', 'file-url', { candidateId })
      const r = await fetch(url)
      if (!r.ok) return null
      const blob = await r.blob()
      return { name, type: blob.type, blob, savedAt: Date.now() }
    } catch { return null }
  }
  try {
    const db = await open()
    return await new Promise((res) => {
      const r = db.transaction(STORE).objectStore(STORE).get(candidateId)
      r.onsuccess = () => res((r.result as StoredFile) || null); r.onerror = () => res(null)
    })
  } catch { return null }
}
