import { db } from './supa.js'

// Platform-wide settings, set by the admin in /admin and stored server-side only.
// Keys never leave the server: the admin panel sees a masked fingerprint.
export const DEFAULT_SETTINGS = {
  productName: 'HireLens',
  aiProvider: 'openai', aiModel: '', openaiKey: '', anthropicKey: '', geminiKey: '',
  resendKey: '', emailFrom: '', replyTo: '',
  trialDays: 7, planName: 'HireLens Pro', price: 4999, taxPct: 18,
  seller: { name: 'HireLens', address: '', gstin: '' },
  emailDailyLimit: 100, // Resend free tier: 100 a day, 3,000 a month
  emailMonthlyLimit: 3000,
  userEmailDailyLimit: 40, // per recruiter, for emails they send by hand
  aiDailyLimit: 300, // AI calls per recruiter per day
}
export const SECRET_KEYS = ['openaiKey', 'anthropicKey', 'geminiKey', 'resendKey']

let cache = null, cachedAt = 0
export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < 20_000) return cache
  const { data } = await db().from('platform_settings').select('data').eq('id', 1).maybeSingle()
  const s = { ...DEFAULT_SETTINGS, ...(data?.data || {}) }
  s.seller = { ...DEFAULT_SETTINGS.seller, ...(data?.data?.seller || {}) }
  // env vars still work as a fallback, so an existing deployment keeps its keys
  s.openaiKey ||= process.env.OPENAI_API_KEY || ''
  s.anthropicKey ||= process.env.ANTHROPIC_API_KEY || ''
  s.geminiKey ||= process.env.GEMINI_API_KEY || ''
  s.resendKey ||= process.env.RESEND_API_KEY || ''
  s.emailFrom ||= process.env.EMAIL_FROM || ''
  if (!data?.data?.aiProvider && process.env.AI_PROVIDER) s.aiProvider = process.env.AI_PROVIDER
  if (!data?.data?.aiModel && process.env.AI_MODEL) s.aiModel = process.env.AI_MODEL
  cache = s; cachedAt = Date.now()
  return s
}

const clean = (v) => String(v || '').replace(/["'`​-‍﻿]/g, '').trim().replace(/^bearer\s+/i, '').replace(/\s/g, '')

export async function saveSettings(patch) {
  const { data } = await db().from('platform_settings').select('data').eq('id', 1).maybeSingle()
  const cur = data?.data || {}
  const next = { ...cur }
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in DEFAULT_SETTINGS)) continue
    if (SECRET_KEYS.includes(k)) {
      if (v === null) delete next[k] // explicit clear
      else if (typeof v === 'string' && v.trim()) next[k] = clean(v)
      continue
    }
    if (k === 'seller') next.seller = { ...(cur.seller || {}), ...v }
    else if (k === 'trialDays') next.trialDays = Math.min(7, Math.max(3, Math.round(+v || 7)))
    else if (['price', 'taxPct', 'emailDailyLimit', 'emailMonthlyLimit', 'userEmailDailyLimit', 'aiDailyLimit'].includes(k)) next[k] = Math.max(0, +v || 0)
    else next[k] = typeof v === 'string' ? v.trim() : v
  }
  const { error } = await db().from('platform_settings').upsert({ id: 1, data: next, updated_at: new Date().toISOString() })
  if (error) throw error
  cache = null
  return getSettings({ fresh: true })
}

const fp = (k) => (k ? `${k.slice(0, 7)}…${k.slice(-4)}` : '')
/** Settings as the admin panel may see them: secrets replaced by a fingerprint. */
export function publicSettings(s) {
  const out = { ...s }
  for (const k of SECRET_KEYS) { out[k] = ''; out[`${k}Set`] = !!s[k]; out[`${k}Hint`] = fp(s[k]) }
  return out
}

export const emailReady = (s) => !!(s.resendKey && s.emailFrom)
export const aiKeyFor = (s) => (s.aiProvider === 'anthropic' ? s.anthropicKey : s.aiProvider === 'gemini' ? s.geminiKey : s.openaiKey)
