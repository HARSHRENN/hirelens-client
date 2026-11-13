import { allow, body, json } from './_util.js'

// POST { url, event, payload } -> forwards to a Zapier / Make / n8n hook (avoids browser CORS).
export default async function handler(req, res) {
  if (!allow(req, res)) return
  const b = await body(req)
  if (!/^https:\/\//.test(b.url || '')) return json(res, 400, { error: 'Webhook URL must start with https://' })
  const r = await fetch(b.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: b.event, payload: b.payload, sentAt: new Date().toISOString() }) })
  if (!r.ok) return json(res, 502, { error: `Webhook answered ${r.status}` })
  json(res, 200, { ok: true })
}
