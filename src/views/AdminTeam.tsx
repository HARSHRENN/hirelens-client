import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BandChip, Button, Field, Groove, Input, useToast } from '../components/ui'
import { panelStats, recruiterStats } from '../lib/analytics'
import { href } from '../lib/router'
import { getState, put, setConfig, useStore } from '../lib/store'
import { stageLabel, type Level, type Recruiter } from '../lib/types'
import { fmtDate, uid } from '../lib/util'

type Period = 'week' | 'month' | 'quarter' | 'all'
const DAYS = { week: 7, month: 30, quarter: 90 }
const PERIODS = [{ value: 'week' as const, label: '7 days' }, { value: 'month' as const, label: '30 days' }, { value: 'quarter' as const, label: '90 days' }, { value: 'all' as const, label: 'All time' }]
const since = (p: Period) => (p === 'all' ? 0 : Date.now() - DAYS[p] * 864e5)
const RES = { select: 'Select', reject: 'Reject', hold: 'Hold', pending: 'Pending' } as const

export function RecruiterAnalytics() {
  const cmap = useStore((s) => s.candidates)
  const recruiters = useStore((s) => s.config.recruiters)
  const [p, setP] = useState<Period>('month')
  const rows = useMemo(() => recruiterStats(Object.values(cmap), recruiters, since(p)), [cmap, recruiters, p])
  const tot = rows.reduce((a, r) => ({ s: a.s + r.screened, sel: a.sel + r.selected, o: a.o + r.offered, j: a.j + r.joined }), { s: 0, sel: 0, o: 0, j: 0 })
  return <section className="section" aria-labelledby="h-ra">
    <div className="section-head"><h2 id="h-ra">Recruiter analytics</h2><p>Profiles each recruiter added in the period, by where they stand now</p></div>
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <p className="small muted" style={{ margin: 0 }}>{tot.s} screened · {tot.sel} selected · {tot.o} offered · {tot.j} joined{tot.o ? ` · ${Math.round((tot.j / tot.o) * 100)}% offer-to-join` : ''}</p>
      <Groove label="Recruiter period" value={p} onChange={setP} options={PERIODS} />
    </div>
    <div className="table-wrap"><table className="table table--stack kpi-table">
      <thead><tr><th>Recruiter</th><th className="num">Screened</th><th className="num">Shortlisted</th><th className="num">In rounds</th><th className="num">Selected</th><th className="num">Rejected</th><th className="num">Hold</th><th className="num">Offered</th><th className="num">Joined</th><th className="num">Declined</th><th className="num">Avg match</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}>
        <td><b>{r.name}</b></td>
        <td className="num" data-label="Screened">{r.screened}</td><td className="num" data-label="Shortlisted">{r.shortlisted}</td><td className="num" data-label="In rounds">{r.interviewing}</td>
        <td className="num" data-label="Selected">{r.selected}</td><td className="num" data-label="Rejected">{r.rejected}</td><td className="num" data-label="Hold">{r.hold}</td>
        <td className="num" data-label="Offered">{r.offered}</td><td className="num" data-label="Joined"><b>{r.joined}</b></td><td className="num" data-label="Declined">{r.declined}</td>
        <td className="num" data-label="Avg match">{r.avgMatch == null ? '—' : <BandChip score={r.avgMatch} />}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="xs muted">Selected counts everyone who reached Selected, including those later offered, joined or declined. New uploads count toward whoever is selected under “Working as” in the sidebar.</p>
  </section>
}

export function PanelistAnalytics() {
  const cmap = useStore((s) => s.candidates)
  const pmap = useStore((s) => s.panelists)
  const [p, setP] = useState<Period>('all')
  const stats = useMemo(() => panelStats(Object.values(cmap), since(p)), [cmap, p])
  const list = Object.values(pmap).sort((a, b) => (stats[b.id]?.total || 0) - (stats[a.id]?.total || 0))
  return <section className="section" aria-labelledby="h-pa">
    <div className="section-head"><h2 id="h-pa">Panelist analytics</h2><p><a href={href({ name: 'panelists' })}>Manage panelists</a></p></div>
    <div className="row" style={{ justifyContent: 'flex-end' }}><Groove label="Panelist period" value={p} onChange={setP} options={PERIODS} /></div>
    {list.length ? <div className="table-wrap"><table className="table table--stack kpi-table">
      <thead><tr><th>Panelist</th><th className="num">Interviews</th><th className="num">Selects</th><th className="num">Rejects</th><th className="num">Hold</th><th className="num">Select rate</th><th className="num">Avg rating</th><th>Latest remark</th></tr></thead>
      <tbody>{list.map((x) => {
        const s = stats[x.id]; const decided = (s?.select || 0) + (s?.reject || 0) + (s?.hold || 0)
        const last = s?.feedback.find((f) => f.text)
        return <tr key={x.id}>
          <td><div className="who"><b>{x.name}</b><span>{x.expertise}</span></div></td>
          <td className="num" data-label="Interviews"><b>{s?.total || 0}</b></td><td className="num" data-label="Selects">{s?.select || 0}</td><td className="num" data-label="Rejects">{s?.reject || 0}</td><td className="num" data-label="Hold">{s?.hold || 0}</td>
          <td className="num" data-label="Select rate">{decided ? Math.round(((s?.select || 0) / decided) * 100) + '%' : '—'}</td>
          <td className="num" data-label="Avg rating">{s?.avgRating ? s.avgRating.toFixed(1) : '—'}</td>
          <td data-label="Latest remark" className="small">{last ? <><b>{last.candidate}</b>, {stageLabel(last.round)} ({RES[last.result]}, {fmtDate(last.at)}): {last.text}</> : <span className="muted">—</span>}</td>
        </tr>
      })}</tbody>
    </table></div> : <p className="small muted">No panelists yet. <a href={href({ name: 'panelists' })}>Add panelists</a>.</p>}
  </section>
}

export function LevelsEditor() {
  const levels = useStore((s) => s.config.levels)
  const cmap = useStore((s) => s.candidates)
  const [list, setList] = useState<Level[]>(levels)
  const toast = useToast()
  const count = (id: string) => Object.values(cmap).filter((c) => c.stage === id).length
  const nextId = () => { for (let k = 1; k < 99; k++) if (!list.some((l) => l.id === `l${k}`)) return `l${k}`; return uid('lv') }
  const move = (i: number, d: number) => { const n = [...list]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); setList(n) }
  const dirty = JSON.stringify(list) !== JSON.stringify(levels)
  async function save() {
    const clean = list.map((l) => ({ ...l, label: l.label.trim() || l.id.toUpperCase() }))
    const gone = levels.filter((l) => !clean.some((c) => c.id === l.id))
    // anyone sitting at a removed level goes back to Contacted, with a remark, so no profile is lost
    for (const g of gone) for (const c of Object.values(getState().candidates).filter((c) => c.stage === g.id))
      await put('candidates', { ...c, stage: 'contacted', remarks: [...c.remarks, { id: uid('r'), at: Date.now(), kind: 'stage', text: `Level "${g.label}" was removed; moved to Contacted` }] })
    await setConfig({ levels: clean }); toast('Interview levels saved')
  }
  return <section className="section" aria-labelledby="h-lv">
    <div className="section-head"><h2 id="h-lv">Interview levels</h2><p>The rounds between Contacted and Selected. Used on the tracker, pipeline, dashboard and interviews.</p></div>
    <div className="levels-ed">
      {list.map((l, i) => <div className="lv" key={l.id}>
        <code>{l.id}</code>
        <Input aria-label={`Level ${i + 1} name`} value={l.label} onChange={(e) => setList(list.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)))} />
        <Button variant="ghost" icon aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></Button>
        <Button variant="ghost" icon aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></Button>
        <Button variant="ghost" icon aria-label={`Remove ${l.label}`} disabled={list.length <= 1} title={count(l.id) ? `${count(l.id)} candidates here move to Contacted on save` : undefined} onClick={() => setList(list.filter((x) => x.id !== l.id))}><Trash2 size={14} /></Button>
      </div>)}
      <div className="row">
        <Button onClick={() => { const id = nextId(); setList([...list, { id, label: `${id.toUpperCase()} round` }]) }}><Plus size={14} />Add level</Button>
        <Button variant="ink" disabled={!dirty} onClick={save}>Save levels</Button>
        {dirty && <Button variant="ghost" onClick={() => setList(levels)}>Undo</Button>}
      </div>
    </div>
  </section>
}

export function BandsEditor() {
  const bands = useStore((s) => s.config.bands)
  const [b, setB] = useState(bands)
  const toast = useToast()
  const ok = b.near < b.potential && b.near >= 0 && b.potential <= 100
  return <section className="section" aria-labelledby="h-bd">
    <div className="section-head"><h2 id="h-bd">Match colours</h2><p>How a match percentage is labelled everywhere</p></div>
    <div className="form-grid">
      <Field label="Potential match from (green)"><Input type="number" min={1} max={100} value={b.potential} onChange={(e) => setB({ ...b, potential: +e.target.value })} /></Field>
      <Field label="Near match from (orange)" hint={ok ? `Below ${b.near}% is Not a match (red)` : 'Must be lower than the green threshold'} error={ok ? undefined : ' '}><Input type="number" min={0} max={99} value={b.near} onChange={(e) => setB({ ...b, near: +e.target.value })} /></Field>
      <div className="row span-2">
        <span className="small"><span className="band-swatch" style={{ background: 'var(--match-good)' }} />{b.potential}% and above</span>
        <span className="small"><span className="band-swatch" style={{ background: 'var(--match-near)' }} />{b.near}–{b.potential - 1}%</span>
        <span className="small"><span className="band-swatch" style={{ background: 'var(--match-low)' }} />below {b.near}%</span>
        <Button variant="ink" disabled={!ok || (b.near === bands.near && b.potential === bands.potential)} onClick={async () => { await setConfig({ bands: b }); toast('Match colours saved') }}>Save</Button>
      </div>
    </div>
  </section>
}

export function RecruitersEditor() {
  const recs = useStore((s) => s.config.recruiters)
  const [list, setList] = useState<Recruiter[]>(recs)
  const toast = useToast()
  const dirty = JSON.stringify(list) !== JSON.stringify(recs)
  return <section className="section" aria-labelledby="h-rc">
    <div className="section-head"><h2 id="h-rc">Recruiters</h2><p>Each gets their own row in the analytics and can be picked under “Working as”</p></div>
    <div className="levels-ed" style={{ maxWidth: 720 }}>
      {list.map((r) => <div className="lv" key={r.id} style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto' }}>
        <Input aria-label="Recruiter name" value={r.name} onChange={(e) => setList(list.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))} />
        <Input aria-label="Recruiter email" type="email" value={r.email} onChange={(e) => setList(list.map((x) => (x.id === r.id ? { ...x, email: e.target.value } : x)))} />
        <Button variant="ghost" icon aria-label={`Remove ${r.name}`} onClick={() => setList(list.filter((x) => x.id !== r.id))}><Trash2 size={14} /></Button>
      </div>)}
      <div className="row">
        <Button onClick={() => setList([...list, { id: uid('rec'), name: '', email: '' }])}><Plus size={14} />Add recruiter</Button>
        <Button variant="ink" disabled={!dirty} onClick={async () => { await setConfig({ recruiters: list.filter((r) => r.name.trim()).map((r) => ({ ...r, name: r.name.trim(), email: r.email.trim() })) }); toast('Recruiters saved') }}>Save recruiters</Button>
      </div>
      <p className="xs muted">Profiles owned by a removed recruiter count under Super admin.</p>
    </div>
  </section>
}
