// Shared helpers for the Vercel functions. Keys come from the request header the
// admin panel sets, or from the project's environment variables as a fallback.
export const json = (res, status, body) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)) }
export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const chunks = []; for await (const c of req) chunks.push(c)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { return {} }
}
export const pick = (req, header, env) => (req.headers[header] || process.env[env] || '').toString().trim()
export const allow = (req, res) => {
  const origin = process.env.ALLOWED_ORIGIN
  if (origin) res.setHeader('access-control-allow-origin', origin)
  res.setHeader('access-control-allow-headers', 'content-type, x-ai-key, x-maps-key, x-wa-token, x-resend-key')
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return false }
  if (req.method !== 'POST') { json(res, 405, { error: 'POST only' }); return false }
  return true
}
