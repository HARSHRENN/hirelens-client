import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto'
import { fail } from './http.js'
import { isAdminProfile, isConfigured, requireUser } from './supa.js'

// The platform admin signs in at /admin with a username and password, separate from
// recruiter accounts, so the panel works even before the database is connected.
// Only a salted scrypt hash is kept here. To change the password, set ADMIN_PASSWORD_HASH
// in Vercel (generate with: node scripts/admin-hash.mjs 'new password').
const DEFAULT_HASH = 'scrypt$f1130814b57fc82e643f22c31eee1677$a57e9c3519e3a5adb1a55b0c0ce537ef3427b3b0bf2eb9243ab8a934eef3b82e'
const hashSpec = () => process.env.ADMIN_PASSWORD_HASH || DEFAULT_HASH
const adminUser = () => (process.env.ADMIN_USERNAME || 'admin').toLowerCase()
const secret = () => process.env.ADMIN_SESSION_SECRET || process.env.CRON_SECRET || hashSpec()
const DAY = 864e5

export function checkPassword(username, password) {
  const [, salt, hex] = hashSpec().split('$')
  const want = Buffer.from(hex, 'hex')
  const got = scryptSync(String(password || ''), salt, want.length, { N: 16384, r: 8, p: 1 })
  const userOk = String(username || '').trim().toLowerCase() === adminUser()
  return timingSafeEqual(got, want) && userOk
}

const sign = (body) => createHmac('sha256', secret()).update(body).digest('base64url')
export function issueToken() {
  const body = Buffer.from(JSON.stringify({ sub: 'admin', exp: Date.now() + 7 * DAY })).toString('base64url')
  return `${body}.${sign(body)}`
}
function validToken(tok) {
  const [body, sig] = String(tok || '').split('.')
  if (!body || !sig) return false
  const a = Buffer.from(sig), b = Buffer.from(sign(body))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()).exp > Date.now() } catch { return false }
}

// a few wrong passwords from one address and it waits (per server instance; enough for now)
const tries = new Map()
export function throttleLogin(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim()
  const t = tries.get(ip) || { n: 0, at: Date.now() }
  if (Date.now() - t.at > 15 * 60e3) { t.n = 0; t.at = Date.now() }
  if (t.n >= 8) fail(429, 'Too many attempts. Wait 15 minutes and try again.')
  return { fail: () => { t.n++; tries.set(ip, t) }, ok: () => tries.delete(ip) }
}

/** The admin behind the request: the password session, or a recruiter account listed in ADMIN_EMAILS. */
export async function requireAdmin(req) {
  if (validToken(req.headers['x-admin-token'])) return { id: null, via: 'password' }
  if (req.headers.authorization && isConfigured()) {
    const { profile } = await requireUser(req)
    if (isAdminProfile(profile)) return { id: profile.id, email: profile.email, via: 'account' }
  }
  fail(401, 'Sign in to the admin panel.')
}
