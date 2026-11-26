import AssignmentFeedback from './AssignmentFeedback'
import { useEffect, useMemo, useState } from 'react'
import { Button, Empty, ErrorBox, Field, Input, Select, Skeleton, useToast } from '../components/ui'
import { api } from '../lib/cloud'
import { saveFile } from '../lib/integrations'
import { demoRecruiterAnalytics } from '../../shared/recruiterDemo.js'

type Metric = 'successfulAssignments' | 'unsuccessfulAssignments' | 'positionsFulfilled' | 'positionsNotFulfilled' | 'candidates' | 'shortlisted' | 'interviewed' | 'interviews' | 'selected' | 'offered' | 'joined' | 'declined' | 'rejected' | 'hold' | 'pending' | 'stale' | 'jobs' | 'openJobs' | 'closedJobs' | 'tatTotal' | 'tatSamples'
interface Recruiter extends Record<Metric, number> {
  id: string; name: string; email: string; company: string; status: string; lastSeen: string | null
  trend: Record<string, number>; technologies: Record<string, number>
}
export interface Report { rows: Recruiter[]; generatedAt: number }
const metrics: [Metric, string][] = [['successfulAssignments','Successful assignment reviews'],['unsuccessfulAssignments','Unsuccessful assignment reviews'],['positionsFulfilled','Positions fulfilled'],['positionsNotFulfilled','Positions not fulfilled'],['candidates', 'Candidates added'], ['shortlisted', 'Shortlisted'], ['interviewed', 'Interviewed candidates'], ['interviews', 'Interview rounds'], ['selected', 'Selected'], ['offered', 'Offered'], ['joined', 'Joined'], ['declined', 'Declined'], ['rejected', 'Rejected'], ['hold', 'On hold'], ['pending', 'In progress'], ['stale', 'No update in 7 days'], ['jobs', 'Jobs added'], ['openJobs', 'Open jobs added'], ['closedJobs', 'Closed jobs added']]
const percent = (a: number, b: number) => b ? `${(a / b * 100).toFixed(1)}%` : '—'
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const initialFrom = () => iso(new Date(Date.now() - 29 * 864e5))
const csvCell = (value: string | number) => `"${String(value).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`

export default function RecruiterAnalytics({ refreshKey = 0, demo = false }: { refreshKey?: number; demo?: boolean }) {
  const [demoNow] = useState(Date.now)
  const [period, setPeriod] = useState('30')
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(() => iso(new Date()))
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState<Metric>('candidates')
  const [selected, setSelected] = useState('')
  const toast = useToast()
  useEffect(() => {
    const controller = new AbortController()
    const start = period === 'all' ? 0 : new Date(`${from}T00:00:00`).getTime()
    const end = period === 'all' ? Date.now() : new Date(`${to}T23:59:59.999`).getTime()
    setReport(null); setError('')
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) { setError('Choose a valid start and end date.'); return () => controller.abort() }
    if (demo) { setReport(demoRecruiterAnalytics({ from: start, to: end, now: demoNow })); return () => controller.abort() }
    let pending=false
    const load=async()=>{if(pending || document.visibilityState==='hidden')return;pending=true;try{const data=await api<Report>('admin','recruiter-analytics',{from:start,to:end},{signal:controller.signal});if(!controller.signal.aborted){setReport(data);setError('')}}catch(e){if(!controller.signal.aborted)setError((e as Error).message)}finally{pending=false}}
    load();const timer=window.setInterval(load,10_000);window.addEventListener('focus',load)
    return ()=>{controller.abort();window.clearInterval(timer);window.removeEventListener('focus',load)}
  }, [from, to, period, retry, refreshKey, demo, demoNow])
  const rows = useMemo(() => (report?.rows || []).filter(r => (status === 'all' || r.status === status) && `${r.name} ${r.email} ${r.company}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b[sort] - a[sort] || a.name.localeCompare(b.name)), [report, status, search, sort])
  const total = (key: Metric) => rows.reduce((sum, r) => sum + r[key], 0)
  const focus = rows.find(r => r.id === selected)
  const max = Math.max(1, ...rows.map(r => r[sort]))
  const choosePeriod = (value: string) => {
    setPeriod(value)
    if (value !== 'custom' && value !== 'all') { setFrom(iso(new Date(Date.now() - (Number(value) - 1) * 864e5))); setTo(iso(new Date())) }
  }
  const exportCsv = async () => {
    const headings = ['Data source', 'Recruiter', 'Email', 'Company', 'Account status', ...metrics.map(m => m[1]), 'Shortlist rate', 'Interview rate', 'Offer rate', 'Joining rate', 'Offer to joining rate', 'Average TAT (days)', 'Jobs with recorded TAT', 'Last active', 'Cohort from', 'Cohort to']
    const lines = rows.map(r => [demo ? 'Fictional sample data' : 'Live data', r.name, r.email, r.company, r.status, ...metrics.map(([key]) => r[key]), percent(r.shortlisted, r.candidates), percent(r.interviewed, r.candidates), percent(r.offered, r.candidates), percent(r.joined, r.candidates), percent(r.joined, r.offered), r.tatSamples ? (r.tatTotal / r.tatSamples).toFixed(1) : '', r.tatSamples, r.lastSeen || '', period === 'all' ? 'All time' : from, period === 'all' ? 'Now' : to])
    try { const result = await saveFile(`${demo ? 'sample-' : ''}hirelens-recruiter-analytics.csv`, '\uFEFF' + [headings, ...lines].map(line => line.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8'); toast(result === 'saved' ? 'Analytics exported' : 'Download blocked here') } catch { toast('Could not export analytics.', { kind: 'error' }) }
  }
  return <>
    <div className="section-head"><h2>Recruiter performance</h2><p>Compare workload, candidate outcomes and follow-up needs across recruiter workspaces.</p></div>
    {demo && <p className="setup-list" role="note"><b>Sample recruiter analytics.</b> Fictional recruiters, jobs, candidates and assignment outcomes for preview only. This report is separate from the editable demo workspace and is never saved to the live database.</p>}
    <div className="form-grid">
      <Field label="Period"><Select value={period} onChange={e => choosePeriod(e.target.value)} options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: 'all', label: 'All time' }, { value: 'custom', label: 'Custom dates' }]} /></Field>
      <Field label="Account status"><Select value={status} onChange={e => setStatus(e.target.value)} options={[{ value: 'all', label: 'All recruiters' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} /></Field>
      {period !== 'all' && <><Field label="From"><Input type="date" value={from} onChange={e => { setPeriod('custom'); setFrom(e.target.value) }} /></Field><Field label="To"><Input type="date" value={to} onChange={e => { setPeriod('custom'); setTo(e.target.value) }} /></Field></>}
      <Field label="Search recruiters"><Input placeholder="Name, email or company" value={search} onChange={e => setSearch(e.target.value)} /></Field>
      <Field label="Compare by"><Select value={sort} onChange={e => setSort(e.target.value as Metric)} options={metrics.map(([value, label]) => ({ value, label }))} /></Field>
    </div>
    <p className="small muted" role="note">Dates select candidates and jobs added in the period. Outcomes reflect their current status, not when they changed stage. Interview rounds include all scheduled rounds for those candidates. Selected includes offered, joined and declined; offered includes joined and declined. Positions fulfilled counts joined candidates, capped at each job’s openings. Positions not fulfilled counts the remaining openings, including jobs still being recruited. Position counts use the job cohort and all its candidates. Admin accounts are excluded.</p>
    {!demo && <AssignmentFeedback/>}
    <p className="xs muted">Assignment review counts use the date the feedback was first recorded. They remain credited to that assignment’s recruiter after reassignment.</p>
    {error ? <ErrorBox onRetry={() => setRetry(n => n + 1)}>{error}</ErrorBox> : !report ? <Skeleton rows={5} /> : <>
      <div className="row" style={{ justifyContent: 'space-between' }}><span className="small muted">{rows.length} recruiters · Updated {new Date(report.generatedAt).toLocaleString('en-IN')}</span><Button disabled={!rows.length} onClick={exportCsv}>Export CSV</Button></div>
      {!rows.length ? <Empty title="No recruiters to analyse">{report.rows.length ? 'Try another search or account status.' : 'Recruiter analytics will appear when recruiter accounts are created. Your admin account is excluded.'}</Empty> : <>
        <section className="stats recruiter-stats" aria-label="Recruiter analytics totals">{(['successfulAssignments', 'unsuccessfulAssignments', 'positionsFulfilled', 'positionsNotFulfilled', 'candidates', 'shortlisted', 'interviewed', 'offered', 'joined', 'stale'] as Metric[]).map(key => <div className="stat" key={key}><span className="v">{total(key)}</span><span className="k">{metrics.find(m => m[0] === key)![1]}</span></div>)}</section>
        <section className="section" aria-label="Conversion rates"><div className="section-head"><h2>Conversion rates</h2><p>Based on the filtered candidate cohort. A dash means there is no denominator.</p></div><div className="stats recruiter-stats">{([['Shortlist / added', 'shortlisted', 'candidates'], ['Interview / added', 'interviewed', 'candidates'], ['Offer / added', 'offered', 'candidates'], ['Joining / added', 'joined', 'candidates'], ['Joining / offered', 'joined', 'offered']] as [string, Metric, Metric][]).map(([label, a, b]) => <div className="stat" key={label}><span className="v">{percent(total(a), total(b))}</span><span className="k">{label}</span></div>)}</div></section>
        <section className="section"><div className="section-head"><h2>Recruiter comparison</h2><p>{metrics.find(m => m[0] === sort)![1]} · highest first. Select a recruiter for details.</p></div><div className="stack">{rows.map(r => <button key={r.id} className="btn" aria-pressed={selected === r.id} onClick={() => setSelected(r.id)} style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 1fr) 2fr 40px', gap: 12, width: '100%', textAlign: 'left' }}><span>{r.name}</span><span aria-hidden className="trial-bar" style={{ width: '100%' }}><i style={{ transform: `scaleX(${r[sort] / max})` }} /></span><b>{r[sort]}</b></button>)}</div></section>
        <div className="table-wrap"><table className="table kpi-table"><caption className="small" style={{ textAlign: 'left', padding: '12px 0' }}>Recruiter metrics · click a name for the full breakdown</caption><thead><tr><th scope="col">Recruiter</th>{metrics.map(([key, label]) => <th scope="col" className="num" key={key}>{label}</th>)}<th scope="col">Avg TAT (days)</th><th scope="col">Joining rate</th><th scope="col">Last active</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td><button className="linkbtn" onClick={() => setSelected(r.id)}>{r.name}</button><div className="xs muted">{r.company || r.email} · {r.status}</div></td>{metrics.map(([key]) => <td className="num" key={key}>{r[key]}</td>)}<td>{r.tatSamples ? (r.tatTotal / r.tatSamples).toFixed(1) : '—'}</td><td>{percent(r.joined, r.candidates)}</td><td className="small">{r.lastSeen ? new Date(r.lastSeen).toLocaleDateString('en-IN') : 'Never'}</td></tr>)}</tbody></table></div>
        {focus && <RecruiterDetail key={focus.id} recruiter={focus} />}
      </>}
      <p className="xs muted">“No update in 7 days” counts in-progress candidates whose record has not been updated for seven days. TAT uses recorded vacancy creation and closing dates for closed jobs added in the selected period; jobs without a closing date are excluded from the average. Hiring targets are not estimated. These figures describe workspace activity and should be reviewed with role complexity and workload.</p>
    </>}
  </>
}

function RecruiterDetail({ recruiter: r }: { recruiter: Recruiter }) {
  const days = Object.entries(r.trend).sort(([a], [b]) => a.localeCompare(b))
  const technologies = Object.entries(r.technologies).sort((a, b) => b[1] - a[1])
  return <section className="section" aria-label={`Analysis for ${r.name}`}>
    <div className="section-head"><h2>{r.name}</h2><p>{r.email}{r.company ? ` · ${r.company}` : ''}</p></div>
    <div className="stats recruiter-stats">{(['jobs', 'openJobs', 'selected', 'declined', 'rejected', 'hold', 'pending', 'stale'] as Metric[]).map(key => <div className="stat" key={key}><span className="v">{r[key]}</span><span className="k">{metrics.find(m => m[0] === key)![1]}</span></div>)}</div>
    <p className="small">Average TAT: <b>{r.tatSamples ? `${(r.tatTotal / r.tatSamples).toFixed(1)} days` : 'Not recorded'}</b> · {r.tatSamples} closed jobs with dates</p>
    <div className="form-grid"><div className="stack"><h3>Candidate additions by day</h3><p className="xs muted">UTC dates · days with activity</p>{days.length ? days.map(([day, n]) => <div className="row" key={day} style={{ justifyContent: 'space-between' }}><time>{day}</time><b>{n}</b></div>) : <p className="small muted">No candidates added in this period.</p>}</div><div className="stack"><h3>Technology breakdown</h3>{technologies.length ? technologies.map(([tech, n]) => <div className="row" key={tech} style={{ justifyContent: 'space-between' }}><span>{tech}</span><b>{n}</b></div>) : <p className="small muted">No candidate technology data yet.</p>}</div></div>
  </section>
}
