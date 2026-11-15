// Request plumbing shared by every function: JSON in/out, one `action` per call,
// errors with a status and a message a recruiter can act on.
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
export const fail = (status, message) => { throw new HttpError(status, message) }

export const json = (res, status, body) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  const chunks = []
  for await (const c of req) chunks.push(c)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { return {} }
}

export const query = (req) => Object.fromEntries(new URL(req.url, 'http://local').searchParams)

/** route({ name: async (req, body) => result }) → a Vercel handler that dispatches on body.action or ?action= */
export function route(handlers, { methods = ['POST'] } = {}) {
  return async (req, res) => {
    try {
      const origin = process.env.ALLOWED_ORIGIN
      if (origin) res.setHeader('access-control-allow-origin', origin)
      res.setHeader('access-control-allow-headers', 'content-type, authorization')
      if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end() }
      if (!methods.includes(req.method)) fail(405, `${methods.join(' or ')} only`)
      const q = query(req)
      const body = req.method === 'GET' ? q : await readBody(req)
      const action = body.action || q.action
      const h = handlers[action]
      if (!h) fail(404, `Unknown action "${action || ''}"`)
      const out = await h(req, body, res)
      if (!res.writableEnded) json(res, 200, out ?? { ok: true })
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e)
      if (!res.writableEnded) json(res, e.status || 500, { error: e instanceof HttpError ? e.message : `Server error: ${e.message}` })
    }
  }
}

export function originOf(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000'
  const proto = req.headers['x-forwarded-proto'] || (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export const isEmail = (s) => typeof s === 'string' && /^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/i.test(s.trim())
