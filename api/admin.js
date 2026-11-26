import { recruiterFeedbackHandlers } from './_lib/recruiterFeedback.js'
import { createRecruiter } from './_lib/recruiters.js'
import { callModel } from './_lib/ai.js'
import { emailInvoice, ensureInvoices, trialEndOf } from './_lib/billing.js'
import { checkPassword, issueToken, requireAdmin, throttleLogin } from './_lib/adminAuth.js'
import { fail, isEmail, route } from './_lib/http.js'
import { sendMail } from './_lib/mail.js'
import { migrate } from './_lib/migrate.js'
import { sendReminders } from './_lib/reminders.js'
import { recruiterAnalytics } from './_lib/recruiterAnalytics.js'
import { DEFAULT_SETTINGS, getSettings, publicSettings, saveSettings } from './_lib/settings.js'
import { adminEmails, countUsage, db, isAdminProfile, isConfigured, startOfUtcDay, startOfUtcMonth } from './_lib/supa.js'

// The platform admin's panel (/admin). Every action but login checks the caller is the admin.
const admin = (req) => requireAdmin(req)

export default route({
  ...recruiterFeedbackHandlers,
  async 'create-recruiter'(req,b) {
    await admin(req)
    const settings=await getSettings()
    return createRecruiter(db(),b,{trialDays:settings.trialDays,adminEmails:adminEmails()})
  },
  async 'recruiter-analytics'(req, b) {
    await admin(req)
    const from = b.from == null ? 0 : Number(b.from), to = b.to == null ? Date.now() : Number(b.to)
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < from || to > 8640000000000000) fail(400, 'Choose a valid date range.')
    const { data: profiles, error } = await db().from('profiles').select('id, username, full_name, email, company, status, role, last_seen')
    if (error) throw error
    const docs = []
    for (let start = 0; ; start += 1000) {
      const { data, error } = await db().from('docs').select('owner, coll, id, data').in('coll', ['jobs', 'candidates']).order('owner').order('coll').order('id').range(start, start + 999)
      if (error) throw error
      docs.push(...data)
      if (data.length < 1000) break
    }
    const reviews=[]
    for(let offset=0;;offset+=1000){
      const page=await db().from('recruiter_assignment_reviews').select('recruiter_id,outcome,created_at').order('id').range(offset,offset+999)
      if(page.error){if(['PGRST205','42P01'].includes(page.error.code))break;throw page.error}
      reviews.push(...page.data);if(page.data.length<1000)break
    }
    return recruiterAnalytics(profiles, docs, { from, to, reviews })
  },
  async login(req, b) {
    const t = throttleLogin(req)
    await new Promise((r) => setTimeout(r, 400)) // slows guessing
    if (!checkPassword(b.username, b.password)) { t.fail(); fail(401, 'Wrong username or password.') }
    t.ok()
    return { token: issueToken() }
  },
  async whoami(req) { const a = await admin(req); return { ok: true, via: a.via, dbConnected: isConfigured() } },

  async overview(req) {
    await admin(req)
    if (!isConfigured()) {
      return { dbConnected: false, settings: publicSettings({ ...DEFAULT_SETTINGS }), users: [], invoices: [], usage: { emailsToday: 0, emailsMonth: 0, aiToday: 0, aiMonth: 0, failedToday: 0, recent: [] }, cronSecret: !!process.env.CRON_SECRET }
    }
    const s = await getSettings({ fresh: true })
    const [{ data: profiles }, { data: stats }, { data: invoices }] = await Promise.all([
      db().from('profiles').select('*').order('created_at', { ascending: false }),
      db().from('admin_user_stats').select('*'),
      db().from('invoices').select('*').order('issued_at', { ascending: false }).limit(300),
    ])
    const byId = Object.fromEntries((stats || []).map((r) => [r.id, r]))
    const users = (profiles || []).map((p) => ({ ...p, isAdmin: isAdminProfile(p), trialEnd: trialEndOf(p), stats: byId[p.id] || {}, due: (invoices || []).filter((i) => i.owner === p.id && i.status === 'due').reduce((a, i) => a + Number(i.amount) * (1 + Number(i.tax_pct) / 100), 0) }))
    const [emailsToday, emailsMonth, aiToday, aiMonth, failedToday] = await Promise.all([
      countUsage({ kindLike: 'email:%', since: startOfUtcDay() }), countUsage({ kindLike: 'email:%', since: startOfUtcMonth() }),
      countUsage({ kindLike: 'ai', since: startOfUtcDay() }), countUsage({ kindLike: 'ai', since: startOfUtcMonth() }),
      db().from('usage_log').select('id', { count: 'exact', head: true }).eq('ok', false).gte('at', new Date(startOfUtcDay()).toISOString()).then((r) => r.count || 0),
    ])
    const { data: recent } = await db().from('usage_log').select('kind, detail, ok, error, at, owner').like('kind', 'email:%').order('at', { ascending: false }).limit(30)
    return { dbConnected: true, settings: publicSettings(s), users, invoices: invoices || [], usage: { emailsToday, emailsMonth, aiToday, aiMonth, failedToday, recent: recent || [] }, cronSecret: !!process.env.CRON_SECRET }
  },

  async 'save-settings'(req, b) {
    await admin(req)
    return { settings: publicSettings(await saveSettings(b.patch || {})) }
  },

  async 'user-status'(req, b) {
    const me = await admin(req)
    if (me.id && b.id === me.id) fail(400, "You can't suspend your own account.")
    if (!['active', 'suspended'].includes(b.status)) fail(400, 'Unknown status')
    const { error } = await db().from('profiles').update({ status: b.status }).eq('id', b.id)
    if (error) throw error
    return { ok: true }
  },

  async 'user-trial'(req, b) {
    await admin(req)
    const patch = {}
    if (b.trialDays != null) patch.trial_days = Math.min(30, Math.max(1, Math.round(+b.trialDays)))
    if (b.restart) patch.trial_start = new Date().toISOString()
    const { error } = await db().from('profiles').update(patch).eq('id', b.id)
    if (error) throw error
    return { ok: true }
  },

  async 'invoice-status'(req, b) {
    await admin(req)
    if (!['due', 'paid', 'void'].includes(b.status)) fail(400, 'Unknown status')
    const { error } = await db().from('invoices').update({ status: b.status }).eq('id', b.id)
    if (error) throw error
    return { ok: true }
  },

  async 'invoice-email'(req, b) {
    await admin(req)
    const { data: row } = await db().from('invoices').select('*').eq('id', b.id).single()
    const { data: p } = await db().from('profiles').select('*').eq('id', row.owner).single()
    await emailInvoice(row, p, await getSettings())
    return { ok: true }
  },

  // raise invoices for every workspace whose trial has ended (the daily cron does the same)
  async 'run-billing'(req) {
    await admin(req)
    const { data: profiles } = await db().from('profiles').select('*')
    let made = 0
    for (const p of profiles || []) made += (await ensureInvoices(p)).made
    return { made }
  },
  async 'run-reminders'(req) { await admin(req); return sendReminders() },

  async 'test-ai'(req) {
    await admin(req)
    const text = await callModel(await getSettings({ fresh: true }), { prompt: 'Reply with exactly: ready', quick: true })
    return { text: text.trim().slice(0, 60) }
  },
  async 'test-email'(req, b) {
    const me = await admin(req)
    const to = String(b.to || me.email || '').trim()
    if (!isEmail(to)) fail(400, 'Enter the address to send the test to.')
    await sendMail({ owner: me.id, kind: 'email:test', to, subject: 'HireLens test email', text: `This is a test from your ${(await getSettings()).productName} admin panel.\n\nIf you can read this, invites, reminders, invoices and sign-up emails will reach people too.` })
    return { to }
  },
  async migrate(req) { await admin(req); return migrate() },
})
