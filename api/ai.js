import { allow, body, json, pick } from './_util.js'

// POST { provider: 'anthropic'|'openai'|'gemini'|'', model?, prompt, quick?, images?: [{type, data(base64)}] } -> { text }
export default async function handler(req, res) {
  if (!allow(req, res)) return
  const b = await body(req)
  const provider = b.provider || process.env.AI_PROVIDER || 'anthropic'
  const key = pick(req, 'x-ai-key', provider === 'openai' ? 'OPENAI_API_KEY' : provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY')
  if (!key) return json(res, 400, { error: `No ${provider} API key. Add one in Admin, or set it on the server.` })
  if (!b.prompt) return json(res, 400, { error: 'Missing prompt' })
  const images = Array.isArray(b.images) ? b.images.slice(0, 4) : []
  try {
    let text = ''
    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: b.model || process.env.AI_MODEL || (b.quick ? 'claude-haiku-5-5' : 'claude-sonnet-5-5'), max_tokens: 4096,
          messages: [{ role: 'user', content: [...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.type, data: i.data } })), { type: 'text', text: b.prompt }] }] }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || `Anthropic ${r.status}`)
      text = j.content?.filter((c) => c.type === 'text').map((c) => c.text).join('') || ''
    } else if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: b.model || process.env.AI_MODEL || 'gpt-5.6-mini',
          messages: [{ role: 'user', content: [...images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.type};base64,${i.data}` } })), { type: 'text', text: b.prompt }] }] }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || `OpenAI ${r.status}`)
      text = j.choices?.[0]?.message?.content || ''
    } else if (provider === 'gemini') {
      const model = b.model || process.env.AI_MODEL || 'gemini-3.1-flash'
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [...images.map((i) => ({ inline_data: { mime_type: i.type, data: i.data } })), { text: b.prompt }] }] }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || `Gemini ${r.status}`)
      text = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
    } else return json(res, 400, { error: `Unknown provider ${provider}` })
    json(res, 200, { text })
  } catch (e) { json(res, 502, { error: e.message }) }
}
