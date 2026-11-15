import { ensureInvoices } from './_lib/billing.js'
import { json } from './_lib/http.js'
import { sendReminders } from './_lib/reminders.js'
import { db, isConfigured } from './_lib/supa.js'

// Daily at 02:30 UTC (08:00 IST): morning interview reminders, then invoices for ended trials.
// Vercel calls this with "Authorization: Bearer $CRON_SECRET" when CRON_SECRET is set.
// Both jobs are idempotent, so a repeat call sends nothing twice.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return json(res, 401, { error: 'Unauthorized' })
  if (!isConfigured()) return json(res, 200, { skipped: 'database not connected' })
  const out = { reminders: null, invoices: 0, errors: [] }
  try { out.reminders = await sendReminders() } catch (e) { out.errors.push(`reminders: ${e.message}`) }
  try {
    const { data: profiles } = await db().from('profiles').select('*')
    for (const p of profiles || []) {
      try { out.invoices += (await ensureInvoices(p)).made } catch (e) { out.errors.push(`${p.username}: ${e.message}`) }
    }
  } catch (e) { out.errors.push(`billing: ${e.message}`) }
  json(res, 200, out)
}
