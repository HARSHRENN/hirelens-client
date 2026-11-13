/* Host capabilities. On a claude.ai artifact, `window.claude.use(name)` resolves
 * platform namespaces (db, sample, user, downloads). On the deployed web build it
 * is absent and every capability resolves null; the app then uses its own /api. */

declare const __TARGET__: 'artifact' | 'web'
export const TARGET: 'artifact' | 'web' = typeof __TARGET__ !== 'undefined' ? __TARGET__ : 'web'

type Use = (name: string) => Promise<any>
const host = (): { use?: Use } | undefined => (window as any).claude

async function waitForHost(ms = 1500): Promise<{ use?: Use } | undefined> {
  const start = Date.now()
  while (!host()?.use && Date.now() - start < ms) await new Promise((r) => setTimeout(r, 50))
  return host()
}

const cache = new Map<string, Promise<any>>()
export function cap<T = any>(name: string): Promise<T | null> {
  if (!cache.has(name)) {
    const p = (async () => {
      if (TARGET !== 'artifact') return null
      const h = await waitForHost()
      if (!h?.use) return null
      return Promise.race([
        h.use(name).catch(() => null),
        new Promise((r) => setTimeout(() => r(null), 10_000)),
      ])
    })()
    cache.set(name, p)
  }
  return cache.get(name)! as Promise<T | null>
}
