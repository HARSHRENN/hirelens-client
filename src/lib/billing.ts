import { jsPDF } from 'jspdf'
import { getState, setConfig } from './store'
import type { Billing, Invoice } from './types'
import { uid } from './util'

const D = 864e5
export const trialEnd = (b: Billing) => b.trialStart + b.trialDays * D
export const taxOf = (i: Pick<Invoice, 'amount' | 'taxPct'>) => Math.round(i.amount * i.taxPct) / 100
export const totalOf = (i: Pick<Invoice, 'amount' | 'taxPct'>) => Math.round((i.amount + taxOf(i)) * 100) / 100
export const inr = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const addMonth = (t: number) => { const d = new Date(t); d.setMonth(d.getMonth() + 1); return d.getTime() }
const fy = (t: number) => { const d = new Date(t); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, '0')}` }

/* The trial runs trialDays (3 to 7) from trialStart. When it ends, an invoice for the
 * first month is raised; after that one more each month the plan stays on. */
export async function ensureBilling() {
  const b = getState().config.billing
  let next = b
  if (!b.saved) next = { ...b, saved: true }
  const end = trialEnd(next)
  const now = Date.now()
  const invoices = [...next.invoices]
  let start = invoices.length ? Math.max(end, ...invoices.map((i) => i.periodTo)) : end
  let made = 0
  while (start <= now && made < 12) {
    const to = addMonth(start)
    const n = invoices.length + 1
    invoices.push({
      id: uid('inv'), number: `INV/${fy(start)}/${String(n).padStart(4, '0')}`, date: start, periodFrom: start, periodTo: to,
      description: `${next.planName}, ${new Date(start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} to ${new Date(to - D).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      amount: next.price, taxPct: next.taxPct, status: 'due',
    })
    start = to; made++
  }
  if (made || next !== b) await setConfig({ billing: { ...next, invoices } })
  return made
}

/* Indian numbering: 1,23,456 → "One Lakh Twenty Three Thousand Four Hundred Fifty Six" */
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const two = (n: number) => (n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`.trim())
const three = (n: number) => (n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred ${two(n % 100)}`.trim() : two(n))
export function words(n: number) {
  const r = Math.floor(n), p = Math.round((n - r) * 100)
  if (!r && !p) return 'Zero'
  const parts: string[] = []
  const cr = Math.floor(r / 1e7), l = Math.floor((r % 1e7) / 1e5), th = Math.floor((r % 1e5) / 1e3), rest = r % 1e3
  if (cr) parts.push(`${three(cr)} Crore`)
  if (l) parts.push(`${two(l)} Lakh`)
  if (th) parts.push(`${two(th)} Thousand`)
  if (rest) parts.push(three(rest))
  return `Rupees ${parts.join(' ') || 'Zero'}${p ? ` and ${two(p)} Paise` : ''} Only`
}

export function invoicePdf(inv: Invoice, b: Billing): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth(), M = 48
  const gst = !!b.seller.gstin.trim()
  const ink = () => doc.setTextColor(6, 20, 46)
  const mute = () => doc.setTextColor(70, 90, 120)

  doc.setFillColor(6, 20, 46); doc.rect(0, 0, W, 70, 'F')
  doc.setFillColor(221, 245, 69); doc.rect(M, 30, 12, 12, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(b.seller.name || 'Seller', M + 20, 41)
  doc.setFontSize(11); doc.text(gst && inv.taxPct ? 'TAX INVOICE' : 'INVOICE', W - M, 41, { align: 'right' })

  let y = 104
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); mute()
  doc.text('FROM', M, y); doc.text('BILL TO', W / 2, y); y += 14
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); ink()
  const block = (x: number, lines: string[]) => { let yy = y; for (const l of lines.filter(Boolean)) { for (const s of doc.splitTextToSize(l, W / 2 - M - 10)) { doc.text(s, x, yy); yy += 13 } } return yy }
  const y1 = block(M, [b.seller.name, b.seller.address, gst ? `GSTIN: ${b.seller.gstin}` : ''])
  const y2 = block(W / 2, [b.buyer.name || 'Customer', b.buyer.address, b.buyer.gstin ? `GSTIN: ${b.buyer.gstin}` : '', b.buyer.email])
  y = Math.max(y1, y2) + 16

  const d = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  doc.setFontSize(9); mute()
  ;[['Invoice no.', inv.number], ['Invoice date', d(inv.date)], ['Due date', d(inv.date + 7 * D)], ['Status', inv.status === 'paid' ? 'Paid' : 'Due']].forEach(([k, v], i) => {
    const x = M + i * ((W - 2 * M) / 4); mute(); doc.text(k!, x, y); ink(); doc.setFont('helvetica', 'bold'); doc.text(v!, x, y + 14); doc.setFont('helvetica', 'normal')
  })
  y += 44

  doc.setFillColor(236, 242, 250); doc.rect(M, y, W - 2 * M, 24, 'F')
  doc.setFont('helvetica', 'bold'); ink(); doc.text('Description', M + 10, y + 16); doc.text('SAC', W - M - 190, y + 16); doc.text('Amount (INR)', W - M - 10, y + 16, { align: 'right' })
  y += 40; doc.setFont('helvetica', 'normal')
  for (const s of doc.splitTextToSize(inv.description, W - 2 * M - 230)) { doc.text(s, M + 10, y); y += 13 }
  doc.text('998314', W - M - 190, y - 13); doc.text(inr(inv.amount), W - M - 10, y - 13, { align: 'right' })
  y += 12; doc.setDrawColor(159, 179, 209); doc.line(M, y, W - M, y); y += 22

  const row = (k: string, v: string, bold = false) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.text(k, W - M - 200, y); doc.text(v, W - M - 10, y, { align: 'right' }); y += 18 }
  row('Subtotal', inr(inv.amount))
  if (inv.taxPct) {
    if (gst) { row(`CGST @ ${inv.taxPct / 2}%`, inr(taxOf(inv) / 2)); row(`SGST @ ${inv.taxPct / 2}%`, inr(taxOf(inv) / 2)) }
    else row(`Tax @ ${inv.taxPct}%`, inr(taxOf(inv)))
  }
  doc.setFillColor(221, 245, 69); doc.rect(W - M - 210, y - 13, 210, 24, 'F'); ink()
  row('Total payable', `INR ${inr(totalOf(inv))}`, true)
  y += 6; doc.setFontSize(9); mute(); doc.text(words(totalOf(inv)), M, y)

  y += 40; doc.setFontSize(9); mute()
  const notes = [
    'Thank you for using ' + b.planName + '. Payment is due within 7 days of the invoice date.',
    !gst && inv.taxPct ? 'Tax shown at the configured rate. A GST tax invoice needs the seller\'s GSTIN on it.' : '',
    'This is a computer-generated invoice and needs no signature.',
  ].filter(Boolean)
  for (const n of notes) for (const s of doc.splitTextToSize(n, W - 2 * M)) { doc.text(s, M, y); y += 12 }
  return doc.output('blob')
}

export const blobToBase64 = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(b) })
