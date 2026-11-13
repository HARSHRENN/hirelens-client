import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { Button, Empty, Groove, Skeleton } from '../components/ui'
import { go } from '../lib/router'
import { loadSample } from '../lib/sample'
import { useStore } from '../lib/store'
import { STAGES, type Stage } from '../lib/types'
import { useUi } from '../lib/uictx'
import { ago } from '../lib/util'
import { JobForm } from './JobForm'

type Range = '7' | '30' | 'all'

export function Dashboard() {
  const ready = useStore((s) => s.ready)
  const jobsMap = useStore((s) => s.jobs)
  const candsMap = useStore((s) => s.candidates)
  const [range, setRange] = useState<Range>('30')
  const [metric, setMetric] = useState<'all' | 'shortlisted' | 'selected'>('all')
  const [creating, setCreating] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const { openCandidate } = useUi()

  const jobs = Object.values(jobsMap)
  const since = range === 'all' ? 0 : Date.now() - +range * 864e5
  const cands = useMemo(() => Object.values(candsMap).filter((c) => c.createdAt >= since), [candsMap, since])

  const byStage = useMemo(() => {
    const m = Object.fromEntries(STAGES.map((s) => [s.id, 0])) as Record<Stage, number>
    cands.forEach((c) => m[c.stage]++); return m
  }, [cands])

  const byTech = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cands) {
      if (metric === 'shortlisted' && !c.shortlisted) continue
      if (metric === 'selected' && c.stage !== 'selected') continue
      const t = jobsMap[c.jobId]?.tech || 'Unassigned'
      m.set(t, (m.get(t) || 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [cands, jobsMap, metric])

  const feed = useMemo(() => Object.values(candsMap).flatMap((c) => c.remarks.map((r) => ({ ...r, c }))).sort((a, b) => b.at - a.at).slice(0, 8), [candsMap])
  const upcoming = Object.values(candsMap).filter((c) => c.interviewAt && c.interviewAt > Date.now()).sort((a, b) => a.interviewAt! - b.interviewAt!)

  const top = <TopBar title="Dashboard" actions={<>
    <Groove label="Date range" value={range} onChange={setRange} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: 'all', label: 'All time' }]} />
    <Button variant="ink" onClick={() => setCreating(true)}><Plus size={16} />New job</Button>
  </>} />

  if (!ready) return <>{top}<Skeleton rows={6} /></>

  if (!jobs.length) return <>{top}
    <Empty title="No jobs yet" action={<div className="row"><Button variant="ink" onClick={() => setCreating(true)}><Plus size={16} />Create the first job</Button>
      <Button busy={seeding} onClick={async () => { setSeeding(true); await loadSample(); setSeeding(false) }}>Load sample data</Button></div>}>
      Start with a job description. Resumes you drop on it are read, scored against it and tracked here. Sample data adds three example jobs and ten made-up profiles you can delete later.
    </Empty>
    {creating && <JobForm onClose={() => setCreating(false)} onSaved={(j) => go({ name: 'job', id: j.id })} />}
  </>

  const maxTech = Math.max(1, ...byTech.map(([, n]) => n))
  const maxStage = Math.max(1, ...Object.values(byStage))
  const shortlisted = cands.filter((c) => c.shortlisted).length
  const contacted = cands.filter((c) => c.stage !== 'new').length

  return <>
    {top}
    <section className="stats" aria-label="Totals">
      <div className="stat"><span className="v">{jobs.filter((j) => j.status === 'open').length}</span><span className="k">Open jobs</span></div>
      <div className="stat"><span className="v">{cands.length}</span><span className="k">Profiles submitted</span></div>
      <div className="stat"><span className="v">{shortlisted}</span><span className="k">Shortlisted</span></div>
      <div className="stat"><span className="v">{contacted}</span><span className="k">Contacted</span></div>
      <div className="stat"><span className="v">{byStage.selected}</span><span className="k">Selected</span></div>
    </section>

    <section className="section" aria-labelledby="h-screen">
      <div className="section-head"><h2 id="h-screen">Screening levels</h2><p>Where every profile in range stands now</p></div>
      <div className="funnel">
        {STAGES.map((s) => (
          <div key={s.id} title={`${s.label}: ${byStage[s.id]}`}>
            <div className="col-bar" aria-hidden><i style={{ height: `${Math.max(2, (byStage[s.id] / maxStage) * 48)}px` }} /></div>
            <span className="v">{byStage[s.id]}</span><span className="k">{s.label}</span>
          </div>
        ))}
      </div>
    </section>

    <div className="grid-2">
      <section className="section" aria-labelledby="h-tech">
        <div className="section-head"><h2 id="h-tech">Profiles by technology</h2>
          <Groove label="Count" value={metric} onChange={setMetric} options={[{ value: 'all', label: 'All' }, { value: 'shortlisted', label: 'Shortlisted' }, { value: 'selected', label: 'Selected' }]} /></div>
        {byTech.length ? <div className="bars" role="list">
          {byTech.map(([t, n]) => <div className="b" role="listitem" key={t} title={`${t}: ${n}`}><span>{t}</span><span className="track"><span className="fill" style={{ width: `${(n / maxTech) * 100}%` }} /></span><span className="fig">{n}</span></div>)}
        </div> : <p className="muted small">No profiles in this range.</p>}
      </section>

      <section className="section" aria-labelledby="h-up">
        <div className="section-head"><h2 id="h-up">Upcoming interviews</h2></div>
        {upcoming.length ? <ul className="feed">{upcoming.slice(0, 6).map((c) => (
          <li key={c.id}><span><button className="linkbtn" onClick={() => openCandidate(c.id)}>{c.name}</button> <span className="kind">for {jobsMap[c.jobId]?.title}</span></span>
            <time>{new Date(c.interviewAt!).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</time></li>))}</ul>
          : <p className="muted small">Nothing scheduled. Schedule a Google Meet from any candidate.</p>}
      </section>
    </div>

    <section className="section" aria-labelledby="h-jobs">
      <div className="section-head"><h2 id="h-jobs">By job</h2></div>
      <div className="table-wrap"><table className="table table--stack">
        <thead><tr><th>Job</th><th className="num">Profiles</th><th className="num">Shortlisted</th><th className="num">L1</th><th className="num">L2</th><th className="num">Selected</th><th className="num">Hold</th><th className="num">Rejected</th><th className="num">Avg match</th></tr></thead>
        <tbody>{jobs.sort((a, b) => b.createdAt - a.createdAt).map((j) => {
          const cs = cands.filter((c) => c.jobId === j.id)
          const n = (s: Stage) => cs.filter((c) => c.stage === s).length
          const scored = cs.filter((c) => c.match)
          const avg = scored.length ? Math.round(scored.reduce((a, c) => a + c.match!.score, 0) / scored.length) : null
          return <tr key={j.id} onClick={() => go({ name: 'job', id: j.id })}>
            <td><div className="who"><b>{j.title}</b><span>{j.client || j.tech}</span></div></td>
            <td className="num" data-label="Profiles">{cs.length}</td><td className="num" data-label="Shortlisted">{cs.filter((c) => c.shortlisted).length}</td>
            <td className="num" data-label="L1">{n('l1')}</td><td className="num" data-label="L2">{n('l2')}</td><td className="num" data-label="Selected">{n('selected')}</td>
            <td className="num" data-label="Hold">{n('hold')}</td><td className="num" data-label="Rejected">{n('rejected')}</td><td className="num" data-label="Avg">{avg == null ? '—' : avg + '%'}</td>
          </tr>
        })}</tbody>
      </table></div>
    </section>

    <section className="section" aria-labelledby="h-feed">
      <div className="section-head"><h2 id="h-feed">Recent activity</h2></div>
      {feed.length ? <ul className="feed">{feed.map((f) => (
        <li key={f.id}><span><button className="linkbtn" onClick={() => openCandidate(f.c.id)}>{f.c.name}</button> <span className="kind">{f.text}</span></span><time>{ago(f.at)}</time></li>))}</ul>
        : <p className="muted small">Calls, messages and stage changes appear here.</p>}
    </section>
    {creating && <JobForm onClose={() => setCreating(false)} onSaved={(j) => go({ name: 'job', id: j.id })} />}
  </>
}
