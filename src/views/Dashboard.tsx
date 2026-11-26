import { positionCounts } from '../../shared/positions.js'
import { matchesProfileFilter } from '../lib/screening'
import { Download, Plus } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { Button, Empty, Groove, Skeleton, useToast } from '../components/ui'
import { go } from '../lib/router'
import { loadSample } from '../lib/sample'
import { useStages, useStore } from '../lib/store'
import type { Candidate } from '../lib/types'
import { useUi } from '../lib/uictx'
import { ago } from '../lib/util'
import { useMe } from '../lib/me'
import { MODE } from '../lib/runtime'
import { vacancyDate, turnaroundDays } from '../lib/jobDates'
import { excelWorkbook, recordSheet, type ExcelCell } from '../lib/excel'
import { saveFile } from '../lib/integrations'
import { JobForm } from './JobForm'
import { AddRecruiter } from '../admin/AddRecruiter'

const RecruiterAnalytics = lazy(() => import('../admin/RecruiterAnalytics'))

type Period = 'day' | 'week' | 'fortnight' | 'month' | 'all' | 'custom'
type Status = 'all' | 'shortlisted' | 'rejected' | 'offered' | 'joined' | 'declined'
const DAYS: Record<Exclude<Period, 'all' | 'custom'>, number> = { day: 1, week: 7, fortnight: 14, month: 30 }
const STATUS: { id: Status; label: string; test: (c: Candidate) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'shortlisted', label: 'Shortlisted', test: (c) => matchesProfileFilter(c, 'short') },
  { id: 'rejected', label: 'Rejected', test: (c) => c.stage === 'rejected' },
  { id: 'offered', label: 'Offered', test: (c) => c.stage === 'offered' },
  { id: 'joined', label: 'Joined', test: (c) => c.stage === 'joined' },
  { id: 'declined', label: 'Declined', test: (c) => c.stage === 'declined' },
]
const iso = (t: number) => new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 10)

export function Dashboard() {
  const { me } = useMe()
  const canCreate = MODE() !== 'cloud' || !!me?.isAdmin
  const canViewAnalytics = MODE() === 'demo' || (MODE() === 'cloud' && !!me?.isAdmin)
  const ready = useStore((s) => s.ready)
  const jobsMap = useStore((s) => s.jobs)
  const candsMap = useStore((s) => s.candidates)
  const panelFeedback = useStore((s) => s.panelFeedback)
  const STAGES = useStages()
  const [period, setPeriod] = useState<Period>('month')
  const [from, setFrom] = useState(iso(Date.now() - 30 * 864e5))
  const [to, setTo] = useState(iso(Date.now()))
  const [status, setStatus] = useState<Status>('all')
  const [creating, setCreating] = useState(false)
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const { openCandidate } = useUi()

  const jobs = Object.values(jobsMap)
  const [t0, t1] = useMemo(() => {
    if (period === 'all') return [0, Infinity]
    if (period === 'custom') return [from ? new Date(from + 'T00:00').getTime() : 0, to ? new Date(to + 'T23:59:59').getTime() : Infinity]
    const start = new Date(); start.setHours(0, 0, 0, 0)
    return [start.getTime() - (DAYS[period] - 1) * 864e5, Infinity]
  }, [period, from, to])
  const inRange = useMemo(() => Object.values(candsMap).filter((c) => c.createdAt >= t0 && c.createdAt <= t1), [candsMap, t0, t1])
  const test = STATUS.find((s) => s.id === status)!.test
  const cands = useMemo(() => inRange.filter(test), [inRange, test])

  const byStage = useMemo(() => { const m: Record<string, number> = {}; STAGES.forEach((s) => (m[s.id] = 0)); cands.forEach((c) => (m[c.stage] = (m[c.stage] || 0) + 1)); return m }, [cands, STAGES])
  const byTech = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cands) { const t = jobsMap[c.jobId]?.tech || 'Unassigned'; m.set(t, (m.get(t) || 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [cands, jobsMap])
  const feed = useMemo(() => Object.values(candsMap).flatMap((c) => c.remarks.map((r) => ({ ...r, c }))).filter((r) => r.at >= t0 && r.at <= t1).sort((a, b) => b.at - a.at).slice(0, 8), [candsMap, t0, t1])
  const upcoming = Object.values(candsMap).filter((c) => c.interviewAt && c.interviewAt > Date.now()).sort((a, b) => a.interviewAt! - b.interviewAt!)
  const count = (s: Status) => inRange.filter(STATUS.find((x) => x.id === s)!.test).length

  const positions=positionCounts(jobs,Object.values(candsMap))
  const closedDays = jobs.map(turnaroundDays).filter((days): days is number => days != null)
  const averageTat = closedDays.length ? Math.round(closedDays.reduce((sum, days) => sum + days, 0) / closedDays.length * 10) / 10 : null
  async function downloadExcel() {
    setExporting(true)
    try {
      const filtered = new Set(cands.map(c => c.id))
      const summary: ExcelCell[][] = [['Metric', 'Value'], ['Exported at', new Date().toISOString()], ['Period', period], ['From (local calendar date)', period === 'all' ? 'All time' : iso(t0)], ['To (local calendar date)', period === 'custom' ? to : iso(Date.now())], ['Status filter', status], ['Open jobs (all jobs)', jobs.filter(j => j.status === 'open').length], ...STATUS.map(st => [st.id === 'all' ? 'Profiles submitted' : st.label, count(st.id)]), ['Positions fulfilled (joined, capped at openings)',positions.positionsFulfilled],['Positions not fulfilled (remaining openings)',positions.positionsNotFulfilled],['Closed jobs with recorded TAT (all jobs)', closedDays.length], ['Average TAT, days (all jobs)', averageTat ?? 'Not available'], ['Candidate scope', 'All accessible candidates; Included in dashboard filter identifies filtered records.'], ['Resume files', 'File names and extracted text are included; original binary files are not embedded.']]
      const jobRows = jobs.map(j => {
        const cs = cands.filter(c => c.jobId === j.id), scored = cs.filter(c => c.match)
        return { ...j, 'Vacancy creation date': vacancyDate(j), 'Position close date': j.positionClosedDate || '', 'TAT days': turnaroundDays(j), 'Profiles in dashboard filter': cs.length, 'Shortlisted in dashboard filter': cs.filter(c => matchesProfileFilter(c, 'short')).length, ...Object.fromEntries(STAGES.map(stage => [stage.label, cs.filter(c => c.stage === stage.id).length])), 'Average match in dashboard filter': scored.length ? Math.round(scored.reduce((sum, c) => sum + c.match!.score, 0) / scored.length) : null }
      })
      const all = Object.values(candsMap)
      const workbook = await excelWorkbook([
        { name: 'Dashboard', rows: summary },
        { name: 'Screening stages', rows: [['Stage', 'Count'], ...STAGES.map(stage => [stage.label, byStage[stage.id] || 0])] },
        { name: 'Categories', rows: [['Skill or requirement category', 'Candidates'], ...byTech] },
        recordSheet('Jobs', jobRows),
        recordSheet('Candidates', all.map(c => ({ ...c, 'Job title': jobsMap[c.jobId]?.title || '', 'Included in dashboard filter': filtered.has(c.id) }))),
        recordSheet('Interviews', all.flatMap(c => (c.interviews || []).map(iv => ({ candidateId: c.id, candidateName: c.name, jobId: c.jobId, ...iv })))),
        recordSheet('Panelist feedback', [...panelFeedback, ...all.flatMap(c => (c.interviews || []).flatMap(iv => iv.demoPanelFeedback || []))].map(f => ({ ...f, candidateName: candsMap[f.candidate_id]?.name || '', jobTitle: jobsMap[candsMap[f.candidate_id]?.jobId || '']?.title || '' }))),
        recordSheet('Remarks', all.flatMap(c => c.remarks.map(r => ({ candidateId: c.id, candidateName: c.name, ...r })))),
        recordSheet('Upcoming interviews', upcoming.map(c => ({ candidateId: c.id, name: c.name, job: jobsMap[c.jobId]?.title || '', date: new Date(c.interviewAt!).toISOString(), meetLink: c.meetLink || '' }))),
        recordSheet('Recent activity', feed.map(({ c, ...event }) => ({ candidateId: c.id, name: c.name, ...event }))),
      ])
      const result = await saveFile(`HireLens-report-${iso(Date.now())}.xlsx`, workbook, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      toast(result === 'saved' ? 'Excel report downloaded' : 'Download cancelled or unavailable')
    } catch (e) { toast((e as Error).message, { kind: 'error' }) }
    finally { setExporting(false) }
  }
  const top = <TopBar title="Dashboard" actions={<>
    {MODE() === 'cloud' && me?.isAdmin && <AddRecruiter/>}
    {canViewAnalytics && <a className="btn" href="#recruiter-analytics">Recruiter Analytics</a>}
    <Button variant="ink" busy={exporting} disabled={!ready} onClick={downloadExcel}><Download size={16} />Download Excel</Button>
  </>} />
  const recruiterAnalytics = canViewAnalytics ? (
    <section className="section" aria-label="Recruiter analytics">
      <Suspense fallback={<Skeleton rows={5} />}><RecruiterAnalytics demo={MODE() === 'demo'} /></Suspense>
    </section>
  ) : null

  if (!ready) return <>{top}<Skeleton rows={6} /></>
  if (!jobs.length) return <>{top}
    <Empty title="No jobs yet" action={canCreate ? <div className="row"><Button variant="ink" onClick={() => setCreating(true)}><Plus size={16} />Create the first job</Button>
      <Button busy={seeding} onClick={async () => { setSeeding(true); await loadSample(); setSeeding(false) }}>Load sample data</Button></div> : undefined}>
      {canCreate ? 'Start with a job description. Resumes you drop on it are read, scored against it and tracked here. Sample data adds four example jobs and sixteen made-up profiles you can delete later.' : 'Your dashboard will show jobs and candidates assigned to you by the admin.'}
    </Empty>
    {recruiterAnalytics}
    {creating && <JobForm onClose={() => setCreating(false)} onSaved={(j) => go({ name: 'job', id: j.id })} />}
  </>

  const levels = STAGES.filter((s) => s.kind === 'level')
  const maxTech = Math.max(1, ...byTech.map(([, n]) => n))
  const maxStage = Math.max(1, ...Object.values(byStage))

  return <>
    {top}
    <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-md)' }}>
      <div className="row">
        <Groove label="Period" value={period} onChange={setPeriod} options={[{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }, { value: 'fortnight', label: 'Fortnightly' }, { value: 'month', label: 'Monthly' }, { value: 'all', label: 'All time' }, { value: 'custom', label: 'Custom' }]} />
        <label className="row small" style={{ gap: 6 }}>From<input className="input" style={{ width: 150 }} type="date" value={period === 'custom' ? from : t0 ? iso(t0) : ''} onChange={(e) => { setFrom(e.target.value); setPeriod('custom') }} /></label>
        <label className="row small" style={{ gap: 6 }}>To<input className="input" style={{ width: 150 }} type="date" value={period === 'custom' ? to : iso(Date.now())} onChange={(e) => { setTo(e.target.value); setPeriod('custom') }} /></label>
      </div>
      <Groove label="Show" value={status} onChange={setStatus} options={STATUS.map((s) => ({ value: s.id, label: s.label }))} />
    </div>

    <section className="stats" aria-label="Totals for the period">
      <div className="stat"><span className="v">{jobs.filter((j) => j.status === 'open').length}</span><span className="k">Open jobs</span></div>
      {STATUS.map((s) => <button key={s.id} type="button" className="stat-btn" aria-pressed={status === s.id} onClick={() => setStatus(s.id)}>
        <span className="v">{count(s.id)}</span><span className="k">{s.id === 'all' ? 'Profiles submitted' : s.label}</span></button>)}
    </section>

    {recruiterAnalytics}

    <section className="section" aria-label="Position fulfilment"><div className="section-head"><h2>Position fulfilment</h2><p>All accessible jobs · fulfilled means joined, capped at openings · unfilled includes active vacancies</p></div><div className="stats"><div className="stat"><span className="v">{positions.positionsFulfilled}</span><span className="k">Positions fulfilled</span></div><div className="stat"><span className="v">{positions.positionsNotFulfilled}</span><span className="k">Positions not fulfilled</span></div></div></section>
    <section className="section" aria-label="Vacancy turnaround time"><div className="section-head"><h2>Vacancy turnaround time</h2><p>All accessible jobs · calendar days · closed jobs with recorded dates</p></div><div className="stats"><div className="stat"><span className="v">{closedDays.length}</span><span className="k">Closed jobs with TAT</span></div><div className="stat"><span className="v">{averageTat ?? '—'}</span><span className="k">Average TAT (days)</span></div></div></section>
    <section className="section" aria-labelledby="h-screen">
      <div className="section-head"><h2 id="h-screen">Screening levels</h2><p>{status === 'all' ? 'Every profile' : STATUS.find((s) => s.id === status)!.label + ' profiles'} added in the period, by where they stand now</p></div>
      <div className="funnel" style={{ gridTemplateColumns: `repeat(${STAGES.length}, minmax(0, 1fr))` }}>
        {STAGES.map((s) => (
          <div key={s.id} title={`${s.label}: ${byStage[s.id]}`}>
            <div className="col-bar" aria-hidden><i style={{ height: `${Math.max(2, ((byStage[s.id] || 0) / maxStage) * 48)}px` }} /></div>
            <span className="v">{byStage[s.id] || 0}</span><span className="k">{s.label}</span>
          </div>
        ))}
      </div>
    </section>

    <div className="grid-2">
      <section className="section" aria-labelledby="h-tech">
        <div className="section-head"><h2 id="h-tech">Profiles by technology</h2></div>
        {byTech.length ? <div className="bars" role="list">
          {byTech.map(([t, n]) => <div className="b" role="listitem" key={t} title={`${t}: ${n}`}><span>{t}</span><span className="track"><span className="fill" style={{ width: `${(n / maxTech) * 100}%` }} /></span><span className="fig">{n}</span></div>)}
        </div> : <p className="muted small">No profiles in this period.</p>}
      </section>
      <section className="section" aria-labelledby="h-up">
        <div className="section-head"><h2 id="h-up">Upcoming interviews</h2></div>
        {upcoming.length ? <ul className="feed">{upcoming.slice(0, 6).map((c) => (
          <li key={c.id}><span><button className="linkbtn" onClick={() => openCandidate(c.id)}>{c.name}</button> <span className="kind">for {jobsMap[c.jobId]?.title}</span></span>
            <time>{new Date(c.interviewAt!).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</time></li>))}</ul>
          : <p className="muted small">Nothing scheduled. Schedule a round from any candidate.</p>}
      </section>
    </div>

    <section className="section" aria-labelledby="h-jobs">
      <div className="section-head"><h2 id="h-jobs">By job</h2></div>
      <div className="table-wrap"><table className="table table--stack">
        <thead><tr><th>Job</th><th className="num">Profiles</th><th className="num">Shortlisted</th>{levels.map((l) => <th key={l.id} className="num">{l.label.split(' ')[0]}</th>)}<th className="num">Offered</th><th className="num">Joined</th><th className="num">Declined</th><th className="num">Hold</th><th className="num">Rejected</th><th className="num">Avg match</th><th>Vacancy created</th><th>Position closed</th><th className="num">TAT (days)</th></tr></thead>
        <tbody>{[...jobs].sort((a, b) => b.createdAt - a.createdAt).map((j) => {
          const cs = cands.filter((c) => c.jobId === j.id)
          const n = (s: string) => cs.filter((c) => c.stage === s).length
          const scored = cs.filter((c) => c.match)
          const avg = scored.length ? Math.round(scored.reduce((a, c) => a + c.match!.score, 0) / scored.length) : null
          return <tr key={j.id} onClick={() => go({ name: 'job', id: j.id })}>
            <td><div className="who"><b>{j.title}</b><span>{j.client || j.tech}</span></div></td>
            <td className="num" data-label="Profiles">{cs.length}</td><td className="num" data-label="Shortlisted">{cs.filter((c) => matchesProfileFilter(c, 'short')).length}</td>
            {levels.map((l) => <td key={l.id} className="num" data-label={l.label}>{n(l.id)}</td>)}
            <td className="num" data-label="Offered">{n('offered')}</td><td className="num" data-label="Joined">{n('joined')}</td><td className="num" data-label="Declined">{n('declined')}</td>
            <td className="num" data-label="Hold">{n('hold')}</td><td className="num" data-label="Rejected">{n('rejected')}</td><td className="num" data-label="Avg">{avg == null ? '—' : avg + '%'}</td><td data-label="Vacancy created">{vacancyDate(j)}</td><td data-label="Position closed">{j.positionClosedDate || '—'}</td><td className="num" data-label="TAT (days)">{turnaroundDays(j) ?? '—'}</td>
          </tr>
        })}</tbody>
      </table></div>
    </section>

    <section className="section" aria-labelledby="h-feed">
      <div className="section-head"><h2 id="h-feed">Recent activity</h2></div>
      {feed.length ? <ul className="feed">{feed.map((f) => (
        <li key={f.id}><span><button className="linkbtn" onClick={() => openCandidate(f.c.id)}>{f.c.name}</button> <span className="kind">{f.text}</span></span><time>{ago(f.at)}</time></li>))}</ul>
        : <p className="muted small">No activity in this period.</p>}
    </section>
    {creating && <JobForm onClose={() => setCreating(false)} onSaved={(j) => go({ name: 'job', id: j.id })} />}
  </>
}
