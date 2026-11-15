import { Download, Mail, RotateCcw, TimerOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { Button, Field, Input, Select, useToast } from '../components/ui'
import { blobToBase64, ensureBilling, inr, invoicePdf, taxOf, totalOf, trialEnd } from '../lib/billing'
import { canServerSend, gmailLink, saveFile, sendEmailWithFiles } from '../lib/integrations'
import { setConfig, useStore } from '../lib/store'
import type { Billing as B, Invoice } from '../lib/types'
import { fmtDate } from '../lib/util'

const D = 864e5
const TRIALS = [{ value: '3', label: '72 hours (3 days)' }, { value: '4', label: '4 days' }, { value: '5', label: '5 days' }, { value: '6', label: '6 days' }, { value: '7', label: '1 week (7 days)' }]

export function Billing() {
  const b = useStore((s) => s.config.billing)
  const ready = useStore((s) => s.ready)
  const [now, setNow] = useState(Date.now())
  const toast = useToast()
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])
  useEffect(() => { if (ready) ensureBilling().then((n) => n && toast(n === 1 ? 'Trial ended. Invoice generated.' : `${n} invoices generated`)) }, [ready, now, b.trialStart, b.trialDays]) // eslint-disable-line react-hooks/exhaustive-deps

  const end = trialEnd(b)
  const left = end - now
  const onTrial = left > 0
  const set = (p: Partial<B>) => setConfig({ billing: { ...b, ...p } })
  const setParty = (who: 'seller' | 'buyer', k: string, v: string) => set({ [who]: { ...b[who], [k]: v } } as Partial<B>)
  const preview = { amount: b.price, taxPct: b.taxPct }
  const pct = Math.min(100, Math.max(0, ((now - b.trialStart) / (b.trialDays * D)) * 100))

  return <>
    <TopBar title="Billing" />
    <section className="section trial" data-state={onTrial ? 'on' : 'off'} aria-labelledby="h-trial">
      <div className="section-head"><h2 id="h-trial">{onTrial ? 'Free trial' : 'Trial ended'}</h2>
        <p>{onTrial ? `Ends ${fmtDate(end, true)}` : `Ended ${fmtDate(end, true)}. Invoices are raised monthly from that date.`}</p></div>
      <div className="trial-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Trial used"><i style={{ transform: `scaleX(${pct / 100})` }} /></div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <p className="fig" style={{ margin: 0, fontSize: '1.5rem' }}>{onTrial ? countdown(left) : 'Paid plan'}</p>
        <div className="row">
          <div style={{ width: 200 }}><Select aria-label="Trial length" value={String(b.trialDays)} onChange={(e) => set({ trialDays: +e.target.value })} options={TRIALS} /></div>
          {onTrial
            ? <Button onClick={() => set({ trialStart: Date.now() - b.trialDays * D - 1000 })}><TimerOff size={15} />End trial now (demo)</Button>
            : <Button variant="ghost" onClick={() => set({ trialStart: Date.now(), invoices: b.invoices.filter((i) => i.status === 'paid') })}><RotateCcw size={15} />Restart trial</Button>}
        </div>
      </div>
      <p className="xs muted">Restarting the trial removes unpaid invoices and keeps paid ones.</p>
    </section>

    <section className="section" aria-labelledby="h-inv">
      <div className="section-head"><h2 id="h-inv">Invoices</h2><p>{b.invoices.length ? `${b.invoices.filter((i) => i.status === 'due').length} due` : 'The first invoice is generated automatically when the trial ends'}</p></div>
      {b.invoices.length ? <div className="table-wrap"><table className="table table--stack">
        <thead><tr><th>Invoice</th><th>Period</th><th className="num">Product</th><th className="num">Tax</th><th className="num">Final amount</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
        <tbody>{[...b.invoices].reverse().map((inv) => <InvoiceRow key={inv.id} inv={inv} b={b} onToggle={() => set({ invoices: b.invoices.map((x) => x.id === inv.id ? { ...x, status: x.status === 'paid' ? 'due' : 'paid' } : x) })} />)}</tbody>
      </table></div> : <div className="invoice-preview">
        <p className="small muted" style={{ margin: 0 }}>Next invoice on {fmtDate(end)}</p>
        <dl className="sum"><div><dt>{b.planName}</dt><dd>INR {inr(b.price)}</dd></div><div><dt>Tax @ {b.taxPct}%</dt><dd>INR {inr(taxOf(preview))}</dd></div><div className="tot"><dt>Final amount</dt><dd>INR {inr(totalOf(preview))}</dd></div></dl>
      </div>}
    </section>

    <section className="section" aria-labelledby="h-plan">
      <div className="section-head"><h2 id="h-plan">Plan and tax</h2><p>Cost of product plus tax is the final amount. Changes apply to the next invoice.</p></div>
      <div className="form-grid">
        <Field label="Plan name"><Input defaultValue={b.planName} onBlur={(e) => e.target.value.trim() && set({ planName: e.target.value.trim() })} /></Field>
        <Field label="Price per month (INR, before tax)"><Input type="number" min={0} step={1} defaultValue={b.price} onBlur={(e) => set({ price: Math.max(0, +e.target.value || 0) })} /></Field>
        <Field label="Tax %" hint={!b.seller.gstin.trim() && b.taxPct > 0 ? <span style={{ color: 'var(--color-error)' }}>GST can be charged only with a GSTIN. Add the seller's GSTIN, or set this to 0 until you register.</span> : 'GST on software services is 18%. Split into CGST and SGST on the invoice.'}>
          <Input type="number" min={0} max={28} step={0.5} defaultValue={b.taxPct} onBlur={(e) => set({ taxPct: Math.max(0, +e.target.value || 0) })} /></Field>
        <div className="invoice-preview"><dl className="sum"><div><dt>Product</dt><dd>INR {inr(b.price)}</dd></div><div><dt>Tax</dt><dd>INR {inr(taxOf(preview))}</dd></div><div className="tot"><dt>Final</dt><dd>INR {inr(totalOf(preview))}</dd></div></dl></div>
      </div>
    </section>

    <div className="grid-2">
      <section className="section" aria-labelledby="h-seller">
        <div className="section-head"><h2 id="h-seller">Billed by</h2></div>
        <div className="stack">
          <Field label="Business name"><Input defaultValue={b.seller.name} onBlur={(e) => setParty('seller', 'name', e.target.value.trim())} /></Field>
          <Field label="Address"><Input defaultValue={b.seller.address} onBlur={(e) => setParty('seller', 'address', e.target.value.trim())} /></Field>
          <Field label="GSTIN" hint="Leave blank if not registered"><Input defaultValue={b.seller.gstin} onBlur={(e) => setParty('seller', 'gstin', e.target.value.trim().toUpperCase())} /></Field>
        </div>
      </section>
      <section className="section" aria-labelledby="h-buyer">
        <div className="section-head"><h2 id="h-buyer">Billed to</h2></div>
        <div className="stack">
          <Field label="Customer name"><Input defaultValue={b.buyer.name} onBlur={(e) => setParty('buyer', 'name', e.target.value.trim())} /></Field>
          <Field label="Address"><Input defaultValue={b.buyer.address} onBlur={(e) => setParty('buyer', 'address', e.target.value.trim())} /></Field>
          <div className="form-grid">
            <Field label="GSTIN"><Input defaultValue={b.buyer.gstin} onBlur={(e) => setParty('buyer', 'gstin', e.target.value.trim().toUpperCase())} /></Field>
            <Field label="Billing email"><Input type="email" defaultValue={b.buyer.email} onBlur={(e) => setParty('buyer', 'email', e.target.value.trim())} /></Field>
          </div>
        </div>
      </section>
    </div>
  </>
}

function InvoiceRow({ inv, b, onToggle }: { inv: Invoice; b: B; onToggle: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const file = `${inv.number.replace(/\//g, '-')}.pdf`
  const subject = `Invoice ${inv.number} from ${b.seller.name}`
  const body = `Hi,\n\nPlease find invoice ${inv.number} for ${inv.description}.\n\nProduct: INR ${inr(inv.amount)}\nTax @ ${inv.taxPct}%: INR ${inr(taxOf(inv))}\nFinal amount: INR ${inr(totalOf(inv))}\n\nPayment is due within 7 days.\n\nRegards,\n${b.seller.name}`
  async function download() { const r = await saveFile(file, invoicePdf(inv, b), 'application/pdf'); if (r !== 'saved') toast('Downloads are blocked in this view. Open the deployed app to save the PDF.', { kind: 'error' }) }
  async function email() {
    if (!b.buyer.email) return toast('Add the billing email under "Billed to" first', { kind: 'error' })
    if (canServerSend()) {
      setBusy(true)
      try { await sendEmailWithFiles(b.buyer.email, subject, body, [{ filename: file, content: await blobToBase64(invoicePdf(inv, b)) }]); toast(`Invoice sent to ${b.buyer.email}`) }
      catch (e: any) { toast(`${e.message} Opening a Gmail draft instead; attach the downloaded PDF.`, { kind: 'error' }); await download(); window.open(gmailLink(b.buyer.email, subject, body), '_blank') }
      setBusy(false)
    } else { await download(); window.open(gmailLink(b.buyer.email, subject, body), '_blank') }
  }
  return <tr>
    <td><div className="who"><b className="fig">{inv.number}</b><span>{fmtDate(inv.date)}</span></div></td>
    <td data-label="Period" className="small">{inv.description.replace(`${b.planName}, `, '')}</td>
    <td className="num" data-label="Product">{inr(inv.amount)}</td>
    <td className="num" data-label="Tax">{inr(taxOf(inv))} <span className="xs muted">({inv.taxPct}%)</span></td>
    <td className="num" data-label="Final"><b>{inr(totalOf(inv))}</b></td>
    <td data-label="Status"><button type="button" className="stage-tag inv-status" data-status={inv.status} onClick={onToggle} title="Click to change">{inv.status === 'paid' ? 'Paid' : 'Due'}</button></td>
    <td><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
      <Button variant="ghost" icon aria-label={`Download ${inv.number}`} onClick={download}><Download size={15} /></Button>
      <Button variant="ghost" icon busy={busy} aria-label={`Email ${inv.number}`} onClick={email}><Mail size={15} /></Button>
    </div></td>
  </tr>
}

function countdown(ms: number) {
  const d = Math.floor(ms / D), h = Math.floor((ms % D) / 36e5), m = Math.floor((ms % 36e5) / 6e4)
  return d ? `${d} day${d > 1 ? 's' : ''} ${h} h left` : h ? `${h} h ${m} min left` : `${m} min left`
}
