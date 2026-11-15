import { callModel } from './_lib/ai.js'
import { emailInvoice, ensureInvoices, trialEndOf } from './_lib/billing.js'
import { fail, route } from './_lib/http.js'
import { sendMail } from './_lib/mail.js'
import { migrate } from './_lib/migrate.js'
import { sendReminders } from './_lib/reminders.js'
import { getSettings, publicSettings, saveSettings } from './_lib/settings.js'
import { countUsage, db, isAdminProfile, requireUser, startOfUtcDay, startOfUtcMonth } from './_lib/supa.js'

// The platform admin's panel (/admin). Every action checks the caller is the admin.
const admin = (req) => requireUser(req, { admin: true })

export default route({
  async overview(req) {
    await admin(req)
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
    return { settings: publicSettings(s), users, invoices: invoices || [], usage: { emailsToday, emailsMonth, aiToday, aiMonth, failedToday, recent: recent || [] }, cronSecret: !!process.env.CRON_SECRET }
  },

  async 'save-settings'(req, b) {
    await admin(req)
    return { settings: publicSettings(await saveSettings(b.patch || {})) }
  },

  async 'user-status'(req, b) {
    const { profile: me } = await admin(req)
    if (b.id === me.id) fail(400, "You can't suspend your own account.")
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
    const { profile } = await admin(req)
    const to = b.to || profile.email
    await sendMail({ owner: profile.id, kind: 'email:test', to, subject: 'HireLens test email', text: `This is a test from your ${(await getSettings()).productName} admin panel.\n\nIf you can read this, invites, reminders, invoices and sign-up emails will reach people too.` })
    return { to }
  },
  async migrate(req) { await admin(req); return migrate() },
})
