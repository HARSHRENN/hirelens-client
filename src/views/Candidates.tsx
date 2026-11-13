import { Download, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { Button, Empty, Input, ScoreCell, Select, Skeleton, StageTag, useToast } from '../components/ui'
import { saveFile } from '../lib/integrations'
import { useStore } from '../lib/store'
import { STAGES, stageLabel, type Candidate } from '../lib/types'
import { useUi } from '../lib/uictx'
import { ago, csv, fmtDays, fmtKm, fmtLpa, fmtYrs } from '../lib/util'

type Key = 'score' | 'name' | 'total' | 'rel' | 'cur' | 'exp' | 'notice' | 'dist' | 'updated'

export function Candidates() {
  const ready = useStore((s) => s.ready)
  const cands = useStore((s) => s.candidates)
  const jobs = useStore((s) => s.jobs)
  const [q, setQ] = useState('')
  const [job, setJob] = useState('all')
  const [stage, setStage] = useState('all')
  const [contacted, setContacted] = useState('all')
  const [sort, setSort] = useState<{ k: Key; dir: 1 | -1 }>({ k: 'updated', dir: -1 })
  const { openCandidate } = useUi()
  const toast = useToast()

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const val: Record<Key, (c: Candidate) => number | string> = {
      score: (c) => c.match?.score ?? -1, name: (c) => c.name.toLowerCase(), total: (c) => c.totalExp ?? -1, rel: (c) => c.relevantExp ?? -1,
      cur: (c) => c.currentCtcLpa ?? -1, exp: (c) => c.expectedCtcLpa ?? -1, notice: (c) => c.noticeDays ?? 999, dist: (c) => c.distanceKm ?? 1e6, updated: (c) => c.updatedAt,
    }
    return Object.values(cands)
      .filter((c) => job === 'all' || c.jobId === job)
      .filter((c) => stage === 'all' || (stage === 'short' ? c.shortlisted : c.stage === stage))
      .filter((c) => contacted === 'all' || (contacted === 'yes' ? c.remarks.some((r) => ['call', 'whatsapp', 'email', 'meet'].includes(r.kind)) : !c.remarks.some((r) => ['call', 'whatsapp', 'email', 'meet'].includes(r.kind))))
      .filter((c) => !ql || [c.name, c.email, c.phone, c.currentLocation.label, c.currentCompany, ...c.skills].join(' ').toLowerCase().includes(ql))
      .sort((a, b) => { const x = val[sort.k](a), y = val[sort.k](b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir })
  }, [cands, job, stage, contacted, q, sort])

  const th = (k: Key, label: string, num = true) => (
    <th className={num ? 'num' : undefined} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : (k === 'name' || k === 'notice' || k === 'dist' ? 1 : -1) }))}>{label}</button>
    </th>
  )

  async function exportCsv() {
    const rows = [['Name', 'Job', 'Client', 'Phone', 'Email', 'Match %', 'Total exp (yrs)', 'Relevant exp (yrs)', 'Current CTC (LPA)', 'Expected CTC (LPA)', 'Notice (days)', 'Current location', 'Job location', 'Distance (km)', 'Stage', 'Shortlisted', 'Interview', 'Latest remark', 'Remark date']]
    for (const c of list) {
      const j = jobs[c.jobId]; const last = [...c.remarks].sort((a, b) => b.at - a.at)[0]
      rows.push([c.name, j?.title || '', j?.client || '', c.phone, c.email, String(c.match?.score ?? ''), String(c.totalExp ?? ''), String(c.relevantExp ?? ''), String(c.currentCtcLpa ?? ''), String(c.expectedCtcLpa ?? ''), String(c.noticeDays ?? ''), c.currentLocation.label, j?.location.label || '', c.distanceKm == null ? '' : String(Math.round(c.distanceKm)), stageLabel(c.stage), c.shortlisted ? 'Yes' : 'No', c.interviewAt ? new Date(c.interviewAt).toLocaleString('en-IN') : '', last?.text || '', last ? new Date(last.at).toLocaleString('en-IN') : ''])
    }
    const r = await saveFile(`candidate-tracker-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + csv(rows), 'text/csv')
    toast(r === 'saved' ? `Exported ${list.length} rows. Opens in Excel or Google Sheets.` : r === 'declined' ? 'Export cancelled' : 'Downloads are blocked in this preview. Use the deployed app to export.')
  }

  const jobOpts = [{ value: 'all', label: 'All jobs' }, ...Object.values(jobs).map((j) => ({ value: j.id, label: j.title }))]
  const stageOpts = [{ value: 'all', label: 'Every stage' }, { value: 'short', label: 'Shortlisted' }, ...STAGES.map((s) => ({ value: s.id, label: s.label }))]

  return <>
    <TopBar title="Candidate tracker" actions={<Button onClick={exportCsv} disabled={!list.length}><Download size={14} />Export CSV</Button>} />
    <div className="row" style={{ gap: 'var(--space-sm)' }}>
      <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
        <Search size={16} aria-hidden style={{ position: 'absolute', left: 14, top: 14, color: 'var(--color-muted)' }} />
        <Input type="search" aria-label="Search candidates" placeholder="Name, phone, skill, city" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 40 }} />
      </div>
      <div style={{ width: 220 }}><Select aria-label="Job" value={job} onChange={(e) => setJob(e.target.value)} options={jobOpts} /></div>
      <div style={{ width: 180 }}><Select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} options={stageOpts} /></div>
      <div style={{ width: 180 }}><Select aria-label="Contacted" value={contacted} onChange={(e) => setContacted(e.target.value)} options={[{ value: 'all', label: 'Contacted or not' }, { value: 'yes', label: 'Contacted' }, { value: 'no', label: 'Not contacted yet' }]} /></div>
    </div>
    {!ready ? <Skeleton rows={8} /> : !Object.keys(cands).length ? (
      <Empty title="No candidates yet" action={<a className="btn btn--ink" href="#jobs">Go to jobs</a>}>Open a job and drop resumes on it. Every profile lands here with experience, CTC, notice period and distance filled in.</Empty>
    ) : !list.length ? <p className="muted small">No one matches these filters.</p> : (
      <div className="table-wrap"><table className="table table--stack">
        <thead><tr>{th('name', 'Candidate', false)}<th>Job</th>{th('score', 'Match')}{th('total', 'Total exp')}{th('rel', 'Relevant')}{th('cur', 'Current CTC')}{th('exp', 'Expected')}{th('notice', 'Notice')}{th('dist', 'Location')}<th>Stage</th>{th('updated', 'Last remark', false)}</tr></thead>
        <tbody>{list.map((c) => {
          const j = jobs[c.jobId]; const last = [...c.remarks].sort((a, b) => b.at - a.at)[0]
          return <tr key={c.id} data-shortlisted={c.shortlisted} onClick={() => openCandidate(c.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openCandidate(c.id)}>
            <td><div className="who"><b>{c.name}</b><span className="fig">{c.phone || c.email}</span></div></td>
            <td data-label="Job"><div className="who"><span style={{ color: 'var(--color-ink)', fontSize: 'var(--text-sm)' }}>{j?.title || '—'}</span><span>{j?.client}</span></div></td>
            <td className="num" data-label="Match"><ScoreCell m={c.match} /></td>
            <td className="num" data-label="Total">{fmtYrs(c.totalExp)}</td>
            <td className="num" data-label="Relevant">{fmtYrs(c.relevantExp)}</td>
            <td className="num" data-label="Current">{fmtLpa(c.currentCtcLpa)}</td>
            <td className="num" data-label="Expected">{fmtLpa(c.expectedCtcLpa)}</td>
            <td className="num" data-label="Notice">{fmtDays(c.noticeDays)}</td>
            <td className="num" data-label="Location"><div className="who" style={{ textAlign: 'right', minWidth: 120 }}><span style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>{c.currentLocation.label || '—'}</span><span>{j?.workMode === 'remote' ? 'remote role' : `${fmtKm(c.distanceKm)} to ${j?.location.label.split(',')[0] || 'job'}`}</span></div></td>
            <td data-label="Stage"><StageTag stage={c.stage} /></td>
            <td data-label="Remark"><div className="who" style={{ maxWidth: 260 }}><span style={{ color: 'var(--color-ink)', fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{last?.text || '—'}</span><span>{last ? ago(last.at) : ''}</span></div></td>
          </tr>
        })}</tbody>
      </table></div>
    )}
    {list.length > 0 && <p className="xs muted">{list.length} of {Object.keys(cands).length} shown. Distances are straight-line × 1.25, a fair guide to road distance inside a city.</p>}
  </>
}
