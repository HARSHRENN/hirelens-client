import { allow, body, json, pick } from './_util.js'

// POST { to, subject, text, from?, attachments?: [{ filename, content(base64) }] } -> Resend.
export default async function handler(req, res) {
  if (!allow(req, res)) return
  const b = await body(req)
  const key = pick(req, 'x-resend-key', 'RESEND_API_KEY')
  const from = b.from || process.env.EMAIL_FROM
  if (!key || !from) return json(res, 400, { error: 'Email is not set up. Add a Resend key and a from address in Admin.' })
  if (!b.to || !b.subject) return json(res, 400, { error: 'Missing recipient or subject' })
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [b.to], subject: b.subject, text: b.text || '', ...(Array.isArray(b.attachments) && b.attachments.length ? { attachments: b.attachments.slice(0, 10).map((a) => ({ filename: String(a.filename), content: String(a.content) })) } : {}) }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) return json(res, 502, { error: j.message || `Resend ${r.status}` })
  json(res, 200, { id: j.id })
}
