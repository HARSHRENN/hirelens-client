import { createClient } from '@supabase/supabase-js'
import { fail } from './http.js'

// The Supabase integration on Vercel names its variables two ways (legacy and new keys); accept both.
const first = (...names) => names.map((n) => process.env[n]).find(Boolean) || ''
export const supaUrl = () => first('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
export const supaAnon = () => first('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
const supaService = () => first('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY')
export const pgUrl = () => first('POSTGRES_URL_NON_POOLING', 'POSTGRES_URL')
export const isConfigured = () => !!(supaUrl() && supaAnon() && supaService())

let client
/** Service-role client: bypasses row-level security. Server only, never sent to a browser. */
export function db() {
  if (!isConfigured()) fail(503, 'The database is not connected yet. Connect Supabase to this Vercel project (Storage → Supabase).')
  return (client ||= createClient(supaUrl(), supaService(), { auth: { persistSession: false, autoRefreshToken: false } }))
}

export const adminEmails = () => (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
export const isAdminProfile = (p) => !!p && (p.role === 'admin' || adminEmails().includes((p.email || '').toLowerCase()))

/** The signed-in user behind the request's bearer token, with their workspace profile. */
export async function requireUser(req, { admin = false } = {}) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) fail(401, 'Sign in first.')
  const { data, error } = await db().auth.getUser(token)
  if (error || !data?.user) fail(401, 'Your session has expired. Sign in again.')
  const { data: profile } = await db().from('profiles').select('*').eq('id', data.user.id).maybeSingle()
  if (!profile) fail(403, 'This account has no workspace. Sign up again or contact support.')
  const isAdmin = isAdminProfile(profile)
  if (profile.status !== 'active' && !isAdmin) fail(403, 'This account is suspended. Contact support.')
  if (admin && !isAdmin) fail(403, 'Only the platform admin can do that.')
  return { user: data.user, profile, isAdmin }
}

/** Everything a workspace owns, read with the service role (for cron jobs and server-side emails). */
export async function ownerDocs(owner, coll) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from('docs').select('id, data').eq('owner', owner).eq('coll', coll).range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

export async function logUsage(owner, kind, detail = '', ok = true, error = null) {
  try { await db().from('usage_log').insert({ owner: owner || null, kind, detail: String(detail).slice(0, 300), ok, error: error ? String(error).slice(0, 500) : null }) }
  catch (e) { console.warn('usage log failed', e) }
}

export async function countUsage({ owner, kindLike, since }) {
  let q = db().from('usage_log').select('id', { count: 'exact', head: true }).like('kind', kindLike).eq('ok', true).gte('at', new Date(since).toISOString())
  if (owner) q = q.eq('owner', owner)
  const { count } = await q
  return count || 0
}

export const startOfUtcDay = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime() }
export const startOfUtcMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); return d.getTime() }
