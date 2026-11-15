// Invoice maths and PDF, used by the browser (download) and the server (emailed invoices).
// inv: { number, issuedAt, periodFrom, periodTo, description, planName, amount, taxPct, status, seller, buyer }
// (times as epoch milliseconds or ISO strings)

const D = 864e5
const ms = (t) => (typeof t === 'number' ? t : Date.parse(t))
export const taxOf = (i) => Math.round(i.amount * i.taxPct) / 100
export const totalOf = (i) => Math.round((i.amount + taxOf(i)) * 100) / 100
export const inr = (n) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fy = (t) => { const d = new Date(ms(t)); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, '0')}` }
export const fmtDay = (t) => new Date(ms(t)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

/* Indian numbering: 1,23,456 → "One Lakh Twenty Three Thousand Four Hundred Fifty Six" */
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const two = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`.trim())
const three = (n) => (n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred ${two(n % 100)}`.trim() : two(n))
export function words(n) {
  const r = Math.floor(n), p = Math.round((n - r) * 100)
  if (!r && !p) return 'Rupees Zero Only'
  const parts = []
  const cr = Math.floor(r / 1e7), l = Math.floor((r % 1e7) / 1e5), th = Math.floor((r % 1e5) / 1e3), rest = r % 1e3
  if (cr) parts.push(`${three(cr)} Crore`)
  if (l) parts.push(`${two(l)} Lakh`)
  if (th) parts.push(`${two(th)} Thousand`)
  if (rest) parts.push(three(rest))
  return `Rupees ${parts.join(' ') || 'Zero'}${p ? ` and ${two(p)} Paise` : ''} Only`
}

/** Builds the invoice with the jsPDF constructor you pass in (browser and Node builds differ). */
export function buildInvoicePdf(jsPDF, inv) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth(), M = 48
  const seller = inv.seller || {}, buyer = inv.buyer || {}
  const gst = !!(seller.gstin || '').trim()
  const ink = () => doc.setTextColor(6, 20, 46)
  const mute = () => doc.setTextColor(70, 90, 120)

  doc.setFillColor(6, 20, 46); doc.rect(0, 0, W, 70, 'F')
  doc.setFillColor(221, 245, 69); doc.rect(M, 30, 12, 12, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(seller.name || 'Seller', M + 20, 41)
  doc.setFontSize(11); doc.text(gst && inv.taxPct ? 'TAX INVOICE' : 'INVOICE', W - M, 41, { align: 'right' })

  let y = 104
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); mute()
  doc.text('FROM', M, y); doc.text('BILL TO', W / 2, y); y += 14
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); ink()
  const block = (x, lines) => { let yy = y; for (const l of lines.filter(Boolean)) for (const s of doc.splitTextToSize(String(l), W / 2 - M - 10)) { doc.text(s, x, yy); yy += 13 } return yy }
  const y1 = block(M, [seller.name, seller.address, gst ? `GSTIN: ${seller.gstin}` : ''])
  const y2 = block(W / 2, [buyer.name || 'Customer', buyer.address, buyer.gstin ? `GSTIN: ${buyer.gstin}` : '', buyer.email])
  y = Math.max(y1, y2) + 16

  doc.setFontSize(9)
  ;[['Invoice no.', inv.number], ['Invoice date', fmtDay(inv.issuedAt)], ['Due date', fmtDay(ms(inv.issuedAt) + 7 * D)], ['Status', inv.status === 'paid' ? 'Paid' : inv.status === 'void' ? 'Void' : 'Due']].forEach(([k, v], i) => {
    const x = M + i * ((W - 2 * M) / 4); mute(); doc.text(k, x, y); ink(); doc.setFont('helvetica', 'bold'); doc.text(String(v), x, y + 14); doc.setFont('helvetica', 'normal')
  })
  y += 44

  doc.setFillColor(236, 242, 250); doc.rect(M, y, W - 2 * M, 24, 'F')
  doc.setFont('helvetica', 'bold'); ink(); doc.text('Description', M + 10, y + 16); doc.text('SAC', W - M - 190, y + 16); doc.text('Amount (INR)', W - M - 10, y + 16, { align: 'right' })
  y += 40; doc.setFont('helvetica', 'normal')
  for (const s of doc.splitTextToSize(inv.description, W - 2 * M - 230)) { doc.text(s, M + 10, y); y += 13 }
  doc.text('998314', W - M - 190, y - 13); doc.text(inr(inv.amount), W - M - 10, y - 13, { align: 'right' })
  y += 12; doc.setDrawColor(159, 179, 209); doc.line(M, y, W - M, y); y += 22

  const row = (k, v, bold = false) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.text(k, W - M - 200, y); doc.text(v, W - M - 10, y, { align: 'right' }); y += 18 }
  row('Subtotal', inr(inv.amount))
  if (inv.taxPct) {
    if (gst) { row(`CGST @ ${inv.taxPct / 2}%`, inr(taxOf(inv) / 2)); row(`SGST @ ${inv.taxPct / 2}%`, inr(taxOf(inv) / 2)) }
    else row(`Tax @ ${inv.taxPct}%`, inr(taxOf(inv)))
  }
  doc.setFillColor(221, 245, 69); doc.rect(W - M - 210, y - 13, 210, 24, 'F'); ink()
  row('Total payable', `INR ${inr(totalOf(inv))}`, true)
  y += 6; doc.setFontSize(9); mute(); doc.text(words(totalOf(inv)), M, y)

  y += 40
  const notes = [
    `Thank you for using ${inv.planName}. Payment is due within 7 days of the invoice date.`,
    !gst && inv.taxPct ? "Tax shown at the configured rate. A GST tax invoice needs the seller's GSTIN on it." : '',
    'This is a computer-generated invoice and needs no signature.',
  ].filter(Boolean)
  for (const n of notes) for (const s of doc.splitTextToSize(n, W - 2 * M)) { doc.text(s, M, y); y += 12 }
  return doc
}

/** A database invoice row → the shape above. */
export const fromRow = (r) => ({
  id: r.id, number: r.number, issuedAt: r.issued_at, periodFrom: r.period_from, periodTo: r.period_to, description: r.description,
  planName: r.plan_name, amount: Number(r.amount), taxPct: Number(r.tax_pct), status: r.status, seller: r.seller || {}, buyer: r.buyer || {}, emailedAt: r.emailed_at,
})
