import { fill, sendMail } from './mail.js'
import { emailReady, getSettings } from './settings.js'
import { db, logUsage, ownerDocs } from './supa.js'

export const DEFAULT_REMINDER = {
  subject: 'Reminder: your {{role}} interview today at {{interviewTime}}',
  body: 'Hi {{name}},\n\nA quick reminder that your {{round}} interview for {{role}} is today at {{interviewTime}}.\n\nJoin here: {{meetLink}}\n\nPlease join 5 minutes early and keep your updated resume handy. Reply to this email if anything has changed.\n\nAll the best,\n{{recruiter}}\n{{company}}',
}

const dayKey = (t, tz) => new Date(t).toLocaleDateString('en-CA', { timeZone: tz })
const timeIn = (t, tz) => new Date(t).toLocaleString('en-IN', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/**
 * Emails every candidate who has an interview later today (in the workspace's time zone)
 * and has not been reminded yet. Runs once a day from the cron job (08:00 IST on the free Vercel plan).
 */
export async function sendReminders() {
  const s = await getSettings()
  if (!emailReady(s)) return { sent: 0, skipped: 'email not set up' }
  const { data: profiles } = await db().from('profiles').select('id, full_name, company, email, status').eq('status', 'active')
  let sent = 0, failed = 0
  const now = Date.now()
  for (const p of profiles || []) {
    const [cfgRows, tplRows] = await Promise.all([ownerDocs(p.id, 'config'), ownerDocs(p.id, 'templates')])
    const cfg = cfgRows.find((r) => r.id === 'app')?.data || {}
    if (cfg.autoReminders === false) continue
    const tz = cfg.timezone || 'Asia/Kolkata'
    const tpl = tplRows.map((r) => r.data).find((t) => t.channel === 'email' && /reminder/i.test(t.name)) || DEFAULT_REMINDER
    const today = dayKey(now, tz)
    const cands = await ownerDocs(p.id, 'candidates')
    const panel = Object.fromEntries((await ownerDocs(p.id, 'panelists')).map((r) => [r.id, r.data]))
    const jobs = Object.fromEntries((await ownerDocs(p.id, 'jobs')).map((r) => [r.id, r.data]))
    const levels = cfg.levels || []
    for (const row of cands) {
      const c = row.data
      if (!c.email) continue
      let changed = false
      const interviews = (c.interviews || []).map((iv) => {
        if (iv.result !== 'pending' || iv.reminderSentAt || iv.at <= now || dayKey(iv.at, tz) !== today) return iv
        return { ...iv, _due: true }
      })
      for (const iv of interviews.filter((x) => x._due)) {
        const job = jobs[c.jobId] || {}
        const vars = {
          name: c.name.split(' ')[0] || c.name, fullName: c.name, role: job.title || 'the role', company: cfg.companyName || p.company || '',
          client: job.client || '', location: job.location?.label || '', recruiter: cfg.recruiterName || p.full_name || 'the hiring team',
          meetLink: iv.meetLink || c.meetLink || '(the link in your invite)', interviewTime: timeIn(iv.at, tz).replace(/^\w+, /, ''),
          round: levels.find((l) => l.id === iv.round)?.label || 'next',
        }
        try {
          await sendMail({
            owner: p.id, kind: 'email:reminder', to: c.email,
            cc: iv.panelistIds.map((id) => panel[id]?.email).filter(Boolean),
            subject: fill(tpl.subject || DEFAULT_REMINDER.subject, vars), text: fill(tpl.body, vars), replyTo: p.email,
          })
          iv.reminderSentAt = Date.now(); changed = true; sent++
        } catch (e) { failed++; await logUsage(p.id, 'reminder:failed', `${c.name}: ${e.message}`, false) }
      }
      if (changed) {
        const next = { ...c, interviews: interviews.map(({ _due, ...iv }) => iv), remarks: [...(c.remarks || []), { id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), kind: 'email', text: 'Interview reminder emailed automatically' }], updatedAt: Date.now() }
        await db().from('docs').update({ data: next, updated_at: new Date().toISOString() }).eq('owner', p.id).eq('coll', 'candidates').eq('id', row.id)
      }
    }
  }
  return { sent, failed }
}
