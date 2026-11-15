import { api, loadConfig } from './cloud'
import { cap, MODE } from './runtime'

/* One door to a model.
 *  - artifact: Claude, through the artifact's `sample` capability
 *  - cloud: the server's /api/ai with the platform's key (set by the admin; never in the browser)
 *  - demo: no AI; parsing and scoring fall back to rules */

export class AiUnavailable extends Error {}

export async function aiStatus(): Promise<{ ok: boolean; via: string }> {
  if (MODE() === 'artifact') {
    const sample = await cap('sample')
    return sample ? { ok: true, via: 'Claude (built in)' } : { ok: false, via: 'Claude (built in) is not available in this view' }
  }
  if (MODE() === 'demo') return { ok: false, via: 'off in the demo' }
  const c = await loadConfig()
  return c.aiReady ? { ok: true, via: 'on' } : { ok: false, via: 'not set up by the admin yet' }
}

interface Opts { quick?: boolean; images?: Blob[]; signal?: AbortSignal; onText?: (t: string) => void }

export async function complete(prompt: string, opts: Opts = {}): Promise<string> {
  if (MODE() === 'demo') throw new AiUnavailable('AI reading is off in the demo. Sign up to use it.')
  if (MODE() === 'artifact') { // outbound fetch is blocked on artifacts; Claude is the model here
    const sample: any = await cap('sample')
    if (!sample) throw new AiUnavailable('AI is not available in this view.')
    try {
      const r = await sample(prompt, {
        modelTier: opts.quick ? 'quick' : 'default',
        images: opts.images, signal: opts.signal,
        onText: opts.onText ? ({ text }: { text: string }) => opts.onText!(text) : undefined,
      })
      return r.text as string
    } catch (e: any) {
      if (e?.code === 'not_granted') throw new AiUnavailable('AI access was not granted for this page.')
      if (e?.code === 'rate_limited') throw new Error('The AI is busy. Wait a minute and try again.')
      throw new Error(e?.message || 'The AI request failed.')
    }
  }
  const images = opts.images ? await Promise.all(opts.images.map(blobToB64)) : undefined
  const j = await api<{ text: string }>('ai', 'complete', { prompt, quick: !!opts.quick, images }, { signal: opts.signal })
  opts.onText?.(j.text)
  return j.text
}

export async function completeJson<T = any>(prompt: string, opts: Opts = {}): Promise<T> {
  const text = await complete(prompt + '\n\nReturn ONLY valid JSON. No prose, no markdown fences.', opts)
  return parseJson<T>(text)
}

export function parseJson<T>(text: string): T {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try { return JSON.parse(t) } catch { /* fall through */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  const a2 = t.indexOf('['), b2 = t.lastIndexOf(']')
  const cands = [[a, b], [a2, b2]].filter(([x, y]) => x >= 0 && y > x)
  for (const [x, y] of cands) { try { return JSON.parse(t.slice(x, y + 1)) } catch { /* next */ } }
  throw new Error('The AI returned something that was not JSON.')
}

async function blobToB64(b: Blob): Promise<{ type: string; data: string }> {
  const buf = new Uint8Array(await b.arrayBuffer())
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return { type: b.type || 'image/png', data: btoa(s) }
}
