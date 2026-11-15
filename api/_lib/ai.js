import { fail } from './http.js'
import { aiKeyFor } from './settings.js'

/** One model call with the platform's key. images: [{ type, data(base64) }] */
export async function callModel(s, { prompt, quick = false, images = [] }) {
  const provider = s.aiProvider || 'openai'
  const key = aiKeyFor(s)
  if (!key) fail(503, 'AI is not set up yet. The platform admin adds an AI key in /admin.')
  if (!prompt) fail(400, 'Missing prompt')
  images = (Array.isArray(images) ? images : []).slice(0, 4)
  try {
    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: s.aiModel || (quick ? 'claude-haiku-5-5' : 'claude-sonnet-5-5'), max_tokens: 4096,
          messages: [{ role: 'user', content: [...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.type, data: i.data } })), { type: 'text', text: prompt }] }] }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || `Anthropic ${r.status}`)
      return j.content?.filter((c) => c.type === 'text').map((c) => c.text).join('') || ''
    }
    if (provider === 'gemini') {
      const model = s.aiModel || 'gemini-3.1-flash'
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [...images.map((i) => ({ inline_data: { mime_type: i.type, data: i.data } })), { text: prompt }] }] }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || `Gemini ${r.status}`)
      return j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
    }
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: s.aiModel || (quick ? 'gpt-5.6-luna' : 'gpt-5.6-terra'),
        messages: [{ role: 'user', content: [...images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.type};base64,${i.data}` } })), { type: 'text', text: prompt }] }] }),
    })
    const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || `OpenAI ${r.status}`)
    return j.choices?.[0]?.message?.content || ''
  } catch (e) {
    fail(502, `${e.message} (key ${key.slice(0, 7)}…${key.slice(-4)})`)
  }
}
