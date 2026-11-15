import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'

/* The browser's door to the server: the public config, the Supabase client
 * (sign-in and the recruiter's own rows) and the /api functions. */

export interface PublicConfig {
  configured: boolean
  supabaseUrl?: string
  supabaseAnonKey?: string
  productName?: string
  emailReady?: boolean
  aiReady?: boolean
  schemaReady?: boolean
}

export interface Profile {
  id: string; username: string; full_name: string; company: string; phone: string; email: string
  role: 'hr' | 'admin'; status: 'active' | 'suspended'; trial_start: string; trial_days: number
  buyer: { name?: string; address?: string; gstin?: string; email?: string }; created_at: string
}
export interface Me { profile: Profile; isAdmin: boolean; trialEnd: number; emailReady: boolean; aiReady: boolean; productName: string }

let cfgP: Promise<PublicConfig> | null = null
export function loadConfig(): Promise<PublicConfig> {
  return (cfgP ||= fetch('/api/app', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'config' }) })
    .then((r) => (r.ok ? r.json() : { configured: false }))
    .catch(() => ({ configured: false })))
}

let client: SupabaseClient | null = null
export async function supa(): Promise<SupabaseClient | null> {
  if (client) return client
  const c = await loadConfig()
  if (!c.configured || !c.supabaseUrl || !c.supabaseAnonKey) return null
  client = createClient(c.supabaseUrl, c.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'hirelens-auth' } })
  return client
}
/** The client once it exists (call supa() first). */
export const supaSync = () => client

export async function session(): Promise<Session | null> {
  const s = await supa()
  if (!s) return null
  const { data } = await s.auth.getSession()
  return data.session
}

export class ApiError extends Error {
  status: number
  constructor(msg: string, status: number) { super(msg); this.status = status }
}

/* The admin's own password session (separate from recruiter accounts), kept in this browser. */
const ADMIN_KEY = 'hl-admin-token'
export const adminToken = () => { try { return localStorage.getItem(ADMIN_KEY) || '' } catch { return '' } }
export const setAdminToken = (t: string) => { try { if (t) localStorage.setItem(ADMIN_KEY, t); else localStorage.removeItem(ADMIN_KEY) } catch { /* storage blocked */ } }

export async function api<T = any>(fn: 'app' | 'auth' | 'admin' | 'ai', action: string, body: Record<string, unknown> = {}, opts: { signal?: AbortSignal } = {}): Promise<T> {
  const adm = fn === 'admin' ? adminToken() : ''
  const ses = fn === 'auth' || adm ? null : await session()
  const r = await fetch(`/api/${fn}`, {
    method: 'POST', signal: opts.signal,
    headers: { 'content-type': 'application/json', ...(ses ? { authorization: `Bearer ${ses.access_token}` } : {}), ...(adm ? { 'x-admin-token': adm } : {}) },
    body: JSON.stringify({ action, ...body }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiError(j.error || (r.status === 413 ? 'That is too large to send in one go.' : `Request failed (${r.status})`), r.status)
  return j as T
}

export async function signOut() {
  const s = await supa()
  await s?.auth.signOut()
  location.href = '/login'
}
