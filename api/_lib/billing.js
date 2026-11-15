import { jsPDF } from 'jspdf'
import { buildInvoicePdf, fmtDay, fromRow, fy, inr, taxOf, totalOf } from '../../shared/invoice.js'
import { sendMail } from './mail.js'
import { emailReady, getSettings } from './settings.js'
import { db } from './supa.js'

const D = 864e5
const addMonth = (t) => { const d = new Date(t); d.setMonth(d.getMonth() + 1); return d.getTime() }
export const trialEndOf = (p) => Date.parse(p.trial_start) + p.trial_days * D

const buyerOf = (p) => ({
  name: p.buyer?.name || p.company || p.full_name,
  address: p.buyer?.address || '',
  gstin: p.buyer?.gstin || '',
  email: p.buyer?.email || p.email,
})

export function invoicePdfBase64(inv) {
  return Buffer.from(buildInvoicePdf(jsPDF, inv).output('arraybuffer')).toString('base64')
}

export async function emailInvoice(row, profile, s) {
  const inv = fromRow(row)
  const to = inv.buyer.email || profile.email
  const text = `Hi ${profile.full_name?.split(' ')[0] || 'there'},

Your ${s.productName} free trial has ended, so here is invoice ${inv.number} for ${inv.description}.

Plan: INR ${inr(inv.amount)}
Tax @ ${inv.taxPct}%: INR ${inr(taxOf(inv))}
Total payable: INR ${inr(totalOf(inv))}

Payment is due within 7 days. The invoice PDF is attached and also sits on your Billing page.

Regards,
${inv.seller.name || s.productName}`
  await sendMail({
    owner: profile.id, kind: 'email:invoice', to, subject: `Invoice ${inv.number} from ${inv.seller.name || s.productName}`, text,
    attachments: [{ filename: `${inv.number.replace(/\//g, '-')}.pdf`, content: invoicePdfBase64(inv), contentType: 'application/pdf' }],
  })
  await db().from('invoices').update({ emailed_at: new Date().toISOString() }).eq('id', row.id)
}

/**
 * Raises every invoice that has fallen due for one workspace: the first when the
 * trial ends, then one a month. Each new invoice is emailed with its PDF when email is set up.
 * Returns the invoice rows, oldest first.
 */
export async function ensureInvoices(profile, { email = true } = {}) {
  const s = await getSettings()
  const { data: rows, error } = await db().from('invoices').select('*').eq('owner', profile.id).order('period_from')
  if (error) throw error
  const list = rows || []
  const end = trialEndOf(profile)
  const now = Date.now()
  let start = Math.max(end, ...list.map((r) => Date.parse(r.period_to)))
  if (!list.length) start = end
  const made = []
  while (start <= now && made.length < 12 && s.price > 0) {
    const to = addMonth(start)
    const { data: n, error: e1 } = await db().rpc('next_invoice_no')
    if (e1) throw e1
    const row = {
      owner: profile.id, number: `INV/${fy(start)}/${String(n).padStart(4, '0')}`, issued_at: new Date(start).toISOString(),
      period_from: new Date(start).toISOString(), period_to: new Date(to).toISOString(),
      description: `${s.planName}, ${fmtDay(start)} to ${fmtDay(to - D)}`, plan_name: s.planName,
      amount: s.price, tax_pct: s.taxPct, seller: s.seller, buyer: buyerOf(profile), status: 'due',
    }
    const { data: ins, error: e2 } = await db().from('invoices').insert(row).select().single()
    if (e2) { if (e2.code === '23505') break; throw e2 } // another request raised it first
    made.push(ins); list.push(ins)
    start = to
  }
  if (email && emailReady(s)) {
    for (const r of list.filter((r) => !r.emailed_at && r.status === 'due')) {
      try { await emailInvoice(r, profile, s) } catch (e) { console.warn('invoice email failed', r.number, e.message) }
    }
  }
  return { rows: list, made: made.length, trialEnd: end, settings: s }
}
