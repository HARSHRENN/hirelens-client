import { cap, TARGET } from './runtime'
import { getState } from './store'

/* One door to a model.
 *  - artifact build + provider "builtin": Claude, through the artifact's `sample` capability
 *  - otherwise: the deployed /api/ai proxy, with the key from the admin panel
 *    (or the server's own env key when the panel is left blank) */

export class AiUnavailable extends Error {}

export async function aiStatus(): Promise<{ ok: boolean; via: string }> {
  const s = getState().secrets
  if (s.aiProvider === 'builtin') {
    if (TARGET === 'artifact') {
      const sample = await cap('sample')
      return sample ? { ok: true, via: 'Claude (built in)' } : { ok: false, via: 'Claude (built in) is not available in this view' }
    }
    return { ok: true, via: 'Server default model' }
  }
  const key = s.aiProvider === 'anthropic' ? s.anthropicKey : s.aiProvider === 'openai' ? s.openaiKey : s.geminiKey
  return { ok: TARGET === 'web', via: `${s.aiProvider}${key ? '' : ' (server key)'}${TARGET === 'artifact' ? ', runs on the deployed app only' : ''}` }
}

interface Opts { quick?: boolean; images?: Blob[]; signal?: AbortSignal; onText?: (t: string) => void }

export async function complete(prompt: string, opts: Opts = {}): Promise<string> {
  const s = getState().secrets
  if (TARGET === 'artifact') { // outbound fetch is blocked on artifacts; Claude is the model here
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
  const key = s.aiProvider === 'anthropic' ? s.anthropicKey : s.aiProvider === 'openai' ? s.openaiKey : s.aiProvider === 'gemini' ? s.geminiKey : ''
  const images = opts.images ? await Promise.all(opts.images.map(blobToB64)) : undefined
  const res = await fetch(`${s.apiBase || ''}/api/ai`, {
    method: 'POST', signal: opts.signal,
    headers: { 'content-type': 'application/json', ...(key ? { 'x-ai-key': key } : {}) },
    body: JSON.stringify({ provider: s.aiProvider === 'builtin' ? '' : s.aiProvider, model: s.aiModel || undefined, prompt, quick: !!opts.quick, images }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `AI request failed (${res.status})`)
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
