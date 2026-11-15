import { Download } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { Button, ErrorBox, Field, Input, Skeleton, useToast } from '../components/ui'
import { fmtDay, fromRow, inr, invoicePdf, taxOf, totalOf, type InvoiceDoc } from '../lib/billing'
import { api } from '../lib/cloud'
import { saveFile } from '../lib/integrations'
import { MODE } from '../lib/runtime'

const D = 864e5
interface BillingData {
  trialStart: string; trialDays: number; trialEnd: number
  plan: { name: string; price: number; taxPct: number }
  seller: { name: string; address: string; gstin: string }
  buyer: { name?: string; address?: string; gstin?: string; email?: string }
  invoices: Record<string, any>[]
  account: { name: string; company: string; email: string }
}

/** The recruiter's own plan: trial countdown, invoices raised by the platform, billing details. */
export function Billing() {
  const [data, setData] = useState<BillingData | null>(null)
  const [err, setErr] = useState('')
  const [now, setNow] = useState(Date.now())
  const load = useCallback(() => { setErr(''); api<BillingData>('app', 'billing').then(setData).catch((e) => setErr(e.message)) }, [])
  useEffect(() => { if (MODE() === 'cloud') load() }, [load])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  // when the trial runs out while the page is open, ask the server, which raises the first invoice
  useEffect(() => { if (data && data.trialEnd <= now && !data.invoices.length) load() }, [data, now, load])

  if (MODE() !== 'cloud') return <>
    <TopBar title="Billing" />
    <p className="small" style={{ maxWidth: '62ch' }}>Billing belongs to a real account. In the demo nothing is charged. <a href="/signup">Start a free trial</a> to get your own workspace: a few days free, then a monthly invoice with tax shown.</p>
  </>
  if (err) return <><TopBar title="Billing" /><ErrorBox onRetry={load}>{err}</ErrorBox></>
  if (!data) return <><TopBar title="Billing" /><Skeleton rows={5} /></>

  const left = data.trialEnd - now
  const onTrial = left > 0
  const pct = Math.min(100, Math.max(0, ((now - Date.parse(data.trialStart)) / (data.trialDays * D)) * 100))
  const preview = { amount: data.plan.price, taxPct: data.plan.taxPct }
  const invoices = data.invoices.map(fromRow).reverse()
  const due = invoices.filter((i) => i.status === 'due')

  return <>
    <TopBar title="Billing" />
    <section className="section trial" data-state={onTrial ? 'on' : 'off'} aria-labelledby="h-trial">
      <div className="section-head"><h2 id="h-trial">{onTrial ? 'Free trial' : due.length ? 'Payment due' : 'Paid plan'}</h2>
        <p>{onTrial ? `Ends ${new Date(data.trialEnd).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : `Trial ended ${fmtDay(data.trialEnd)}`}</p></div>
      <div className="trial-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Trial used"><i style={{ transform: `scaleX(${pct / 100})` }} /></div>
      <p className="fig" style={{ margin: 0, fontSize: '1.5rem' }}>{onTrial ? countdown(left) : due.length ? `INR ${inr(due.reduce((a, i) => a + totalOf(i), 0))} due` : 'All invoices paid'}</p>
      <p className="xs muted" style={{ margin: 0 }}>{data.plan.name}: INR {inr(data.plan.price)} a month plus {data.plan.taxPct}% tax, INR {inr(totalOf(preview))} in all. {onTrial ? 'The first invoice is raised when the trial ends and emailed to your billing address.' : 'Invoices are raised monthly and emailed to your billing address.'}</p>
    </section>

    <section className="section" aria-labelledby="h-inv">
      <div className="section-head"><h2 id="h-inv">Invoices</h2><p>{invoices.length ? `${due.length} due` : `First invoice on ${fmtDay(data.trialEnd)}`}</p></div>
      {invoices.length ? <div className="table-wrap"><table className="table table--stack">
        <thead><tr><th>Invoice</th><th>Period</th><th className="num">Product</th><th className="num">Tax</th><th className="num">Final amount</th><th>Status</th><th><span className="visually-hidden">Download</span></th></tr></thead>
        <tbody>{invoices.map((inv) => <InvoiceRow key={inv.id} inv={inv} />)}</tbody>
      </table></div> : <div className="invoice-preview">
        <dl className="sum"><div><dt>{data.plan.name}</dt><dd>INR {inr(data.plan.price)}</dd></div><div><dt>Tax @ {data.plan.taxPct}%</dt><dd>INR {inr(taxOf(preview))}</dd></div><div className="tot"><dt>Final amount</dt><dd>INR {inr(totalOf(preview))}</dd></div></dl>
      </div>}
      <p className="xs muted">To pay, use the bank details on the invoice or reply to the invoice email. Payments are marked by the platform team.</p>
    </section>

    <BuyerForm data={data} onSaved={load} />
  </>
}

function InvoiceRow({ inv }: { inv: InvoiceDoc }) {
  const toast = useToast()
  const file = `${inv.number.replace(/\//g, '-')}.pdf`
  return <tr>
    <td><div className="who"><b className="fig">{inv.number}</b><span>{fmtDay(inv.issuedAt)}</span></div></td>
    <td data-label="Period" className="small">{inv.description.replace(`${inv.planName}, `, '')}</td>
    <td className="num" data-label="Product">{inr(inv.amount)}</td>
    <td className="num" data-label="Tax">{inr(taxOf(inv))} <span className="xs muted">({inv.taxPct}%)</span></td>
    <td className="num" data-label="Final"><b>{inr(totalOf(inv))}</b></td>
    <td data-label="Status"><span className="stage-tag inv-status" data-status={inv.status}>{inv.status === 'paid' ? 'Paid' : inv.status === 'void' ? 'Void' : 'Due'}</span></td>
    <td><Button variant="ghost" icon aria-label={`Download ${inv.number}`} onClick={async () => { const r = await saveFile(file, invoicePdf(inv), 'application/pdf'); if (r !== 'saved') toast('Downloads are blocked in this view.', { kind: 'error' }) }}><Download size={15} /></Button></td>
  </tr>
}

function BuyerForm({ data, onSaved }: { data: BillingData; onSaved: () => void }) {
  const [b, setB] = useState({ name: data.buyer.name || data.account.company || '', address: data.buyer.address || '', gstin: data.buyer.gstin || '', email: data.buyer.email || data.account.email })
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  return <section className="section" aria-labelledby="h-buyer">
    <div className="section-head"><h2 id="h-buyer">Billing details</h2><p>Printed on your invoices; invoices are emailed to the billing email</p></div>
    <div className="form-grid">
      <Field label="Name or company on the invoice"><Input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} /></Field>
      <Field label="Billing email"><Input type="email" value={b.email} onChange={(e) => setB({ ...b, email: e.target.value })} /></Field>
      <Field label="Address" className="span-2"><Input value={b.address} onChange={(e) => setB({ ...b, address: e.target.value })} /></Field>
      <Field label="GSTIN" hint="Optional. Add it to claim input tax credit."><Input value={b.gstin} onChange={(e) => setB({ ...b, gstin: e.target.value.toUpperCase() })} /></Field>
      <div className="row" style={{ alignItems: 'end' }}><Button variant="ink" busy={busy} onClick={async () => {
        setBusy(true)
        try { await api('app', 'update-profile', { buyer: b }); toast('Billing details saved'); onSaved() } catch (e: any) { toast(e.message, { kind: 'error' }) } finally { setBusy(false) }
      }}>Save billing details</Button></div>
    </div>
    <p className="xs muted">New invoices use these details. Invoices already raised keep the details they were issued with.</p>
  </section>
}

function countdown(ms: number) {
  const d = Math.floor(ms / D), h = Math.floor((ms % D) / 36e5), m = Math.floor((ms % 36e5) / 6e4)
  return d ? `${d} day${d > 1 ? 's' : ''} ${h} h left` : h ? `${h} h ${m} min left` : `${m} min left`
}
