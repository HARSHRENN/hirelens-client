import { allow, body, json, pick } from './_util.js'

// POST { to: '9198xxxxxxxx', text, phoneNumberId? } -> Meta WhatsApp Cloud API.
// Free-form text only reaches someone who messaged you in the last 24 hours;
// otherwise send { template: { name, language, params } } with a Meta-approved template.
export default async function handler(req, res) {
  if (!allow(req, res)) return
  const b = await body(req)
  const token = pick(req, 'x-wa-token', 'WHATSAPP_TOKEN')
  const id = b.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !id) return json(res, 400, { error: 'WhatsApp is not set up. Add the phone number ID and access token in Admin.' })
  if (!b.to) return json(res, 400, { error: 'Missing recipient' })
  const msg = b.template
    ? { type: 'template', template: { name: b.template.name, language: { code: b.template.language || 'en' }, components: b.template.params ? [{ type: 'body', parameters: b.template.params.map((t) => ({ type: 'text', text: String(t) })) }] : [] } }
    : { type: 'text', text: { body: String(b.text || '').slice(0, 4096), preview_url: true } }
  const r = await fetch(`https://graph.facebook.com/v21.0/${id}/messages`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: String(b.to).replace(/\D/g, ''), ...msg }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) return json(res, 502, { error: j.error?.message || `WhatsApp ${r.status}` })
  json(res, 200, { id: j.messages?.[0]?.id })
}
