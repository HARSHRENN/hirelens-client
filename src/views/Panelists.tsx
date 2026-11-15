import { CalendarClock, Mail, Pencil, Phone, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { Button, Dialog, Empty, Field, Groove, Input, Skeleton, useToast } from '../components/ui'
import { panelStats } from '../lib/analytics'
import { put, remove, useStore } from '../lib/store'
import { stageLabel, type Panelist } from '../lib/types'
import { useUi } from '../lib/uictx'
import { fmtDate, uid } from '../lib/util'

type Period = 'all' | 'week' | 'month'
const RESULT = { select: 'Select', reject: 'Reject', hold: 'Hold', pending: 'Pending' } as const

export function Panelists() {
  const ready = useStore((s) => s.ready)
  const pmap = useStore((s) => s.panelists)
  const cmap = useStore((s) => s.candidates)
  const [edit, setEdit] = useState<Panelist | 'new' | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('all')
  const { openCandidate } = useUi()

  const from = period === 'all' ? 0 : Date.now() - (period === 'week' ? 7 : 30) * 864e5
  const stats = useMemo(() => panelStats(Object.values(cmap), from), [cmap, from])
  const list = Object.values(pmap).sort((a, b) => Number(b.active) - Number(a.active) || (stats[b.id]?.total || 0) - (stats[a.id]?.total || 0))
  const totals = list.reduce((a, p) => { const s = stats[p.id]; if (s) { a.t += s.total; a.u += s.upcoming; a.s += s.select } return a }, { t: 0, u: 0, s: 0 })

  const top = <TopBar title="Panelists" actions={<Button variant="ink" onClick={() => setEdit('new')}><Plus size={16} />Add panelist</Button>} />
  if (!ready) return <>{top}<Skeleton rows={5} /></>
  if (!list.length) return <>{top}
    <Empty title="No panelists yet" action={<Button variant="ink" onClick={() => setEdit('new')}><Plus size={16} />Add the first panelist</Button>}>
      Panelists are the interviewers who take L1, L2 and L3 rounds. Add them here, pick them when you schedule a round from a candidate, and their interview count and feedback build up on this page.
    </Empty>
    {edit && <PanelistForm p={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
  </>

  return <>
    {top}
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <p className="small muted" style={{ margin: 0 }}>{list.filter((p) => p.active).length} active panelists · {totals.t} interviews · {totals.u} upcoming · {totals.s} selects</p>
      <Groove label="Period" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Last 7 days' }, { value: 'month', label: 'Last 30 days' }, { value: 'all', label: 'All time' }]} />
    </div>

    <section className="section" aria-labelledby="h-pt">
      <div className="section-head"><h2 id="h-pt">Interview tracker</h2><p>Every round a panelist sat on, from the candidates' Interviews tab</p></div>
      <div className="table-wrap"><table className="table table--stack">
        <thead><tr><th>Panelist</th><th>Contact</th><th>Availability</th><th className="num">Interviews</th><th className="num">Upcoming</th><th className="num">Selects</th><th className="num">Rejects</th><th className="num">Hold</th><th className="num">Avg rating</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
        <tbody>{list.map((p) => {
          const s = stats[p.id]
          return <tr key={p.id} onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id} style={{ opacity: p.active ? 1 : 0.55 }}>
            <td><div className="who"><b className="linkish">{p.name}</b><span>{p.expertise || '—'}{!p.active && ' · inactive'}</span></div></td>
            <td data-label="Contact"><div className="stack" style={{ gap: 2 }}>
              {p.email && <a className="xs icon-link" href={`mailto:${p.email}`} onClick={(e) => e.stopPropagation()}><Mail size={12} aria-hidden /> {p.email}</a>}
              {p.phone && <a className="xs icon-link" href={`tel:${p.phone.replace(/\s/g, '')}`} onClick={(e) => e.stopPropagation()}><Phone size={12} aria-hidden /> {p.phone}</a>}
            </div></td>
            <td data-label="Availability">{p.calendly ? <a className="xs icon-link" href={p.calendly} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><CalendarClock size={12} aria-hidden /> Calendly</a> : <span className="xs muted">No link</span>}</td>
            <td className="num" data-label="Interviews"><b>{s?.total || 0}</b></td>
            <td className="num" data-label="Upcoming">{s?.upcoming || 0}</td>
            <td className="num" data-label="Selects">{s?.select || 0}</td>
            <td className="num" data-label="Rejects">{s?.reject || 0}</td>
            <td className="num" data-label="Hold">{s?.hold || 0}</td>
            <td className="num" data-label="Avg rating">{s?.avgRating ? s.avgRating.toFixed(1) + ' / 5' : '—'}</td>
            <td><Button variant="ghost" icon aria-label={`Edit ${p.name}`} onClick={(e) => { e.stopPropagation(); setEdit(p) }}><Pencil size={15} /></Button></td>
          </tr>
        })}</tbody>
      </table></div>
    </section>

    {open && pmap[open] && <section className="section" aria-labelledby="h-fb">
      <div className="section-head"><h2 id="h-fb">Feedback from {pmap[open]!.name}</h2><p>Newest first</p></div>
      {stats[open]?.feedback.length ? <ul className="feed">{stats[open]!.feedback.map((f, i) => (
        <li key={i}><span><button className="linkbtn" onClick={() => openCandidate(f.candidateId)}>{f.candidate}</button> <span className="kind">{stageLabel(f.round)}: <b data-result={f.result} className="result-tag">{RESULT[f.result]}</b>{f.rating ? ` · ${f.rating}/5` : ''}{f.text ? ` · ${f.text}` : ''}</span></span><time>{fmtDate(f.at)}</time></li>))}</ul>
        : <p className="small muted">No feedback recorded yet. Enter it from a candidate's Interviews tab after the call.</p>}
    </section>}
    <p className="xs muted">Availability opens each panelist's own Calendly booking page. Calendly's API is not connected, so bookings made there are not pulled in automatically.</p>
    {edit && <PanelistForm p={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
  </>
}

function PanelistForm({ p, onClose }: { p: Panelist | null; onClose: () => void }) {
  const [f, setF] = useState({ name: p?.name || '', email: p?.email || '', phone: p?.phone || '', calendly: p?.calendly || '', expertise: p?.expertise || '', active: p?.active ?? true })
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState(false)
  const toast = useToast()
  const set = (x: Partial<typeof f>) => setF({ ...f, ...x })
  async function save() {
    if (!f.name.trim()) return setErr('Add the panelist\'s name')
    if (f.calendly && !/^https?:\/\//.test(f.calendly.trim())) return setErr('The Calendly link should start with https://')
    const now = Date.now()
    await put('panelists', { id: p?.id || uid('p'), createdAt: p?.createdAt || now, updatedAt: now, ...f, name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), calendly: f.calendly.trim(), expertise: f.expertise.trim() })
    toast(p ? 'Panelist updated' : 'Panelist added'); onClose()
  }
  return <Dialog title={p ? `Edit ${p.name}` : 'Add a panelist'} onClose={onClose} footer={<>
    {p && (confirm ? <Button variant="danger" onClick={async () => { await remove('panelists', p.id); toast('Panelist removed'); onClose() }}>Remove for good</Button> : <Button variant="ghost" onClick={() => setConfirm(true)}>Remove</Button>)}
    <span style={{ flex: 1 }} />
    <Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="ink" onClick={save}>{p ? 'Save' : 'Add panelist'}</Button></>}>
    <div className="form-grid">
      <Field label="Name" error={err && !f.name.trim() ? err : undefined}><Input autoFocus autoComplete="off" value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Expertise" hint="What they interview for, e.g. Java, system design"><Input value={f.expertise} onChange={(e) => set({ expertise: e.target.value })} /></Field>
      <Field label="Email"><Input type="email" autoComplete="off" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
      <Field label="Contact number"><Input type="tel" inputMode="tel" autoComplete="off" value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
      <Field label="Availability (Calendly link)" hint="Their booking page. Opened as a link; nothing is synced." error={err && f.calendly ? err : undefined} className="span-2"><Input type="url" inputMode="url" value={f.calendly} placeholder="https://calendly.com/name/45min" onChange={(e) => set({ calendly: e.target.value })} /></Field>
      <label className="row small span-2"><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Active, offered when scheduling rounds</label>
      {confirm && <p className="small span-2" style={{ color: 'var(--color-error)' }}>Past interviews keep their record but will show “Removed panelist”. Mark inactive instead to keep the name.</p>}
    </div>
  </Dialog>
}
