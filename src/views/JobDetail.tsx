import { ArrowLeft, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { Button, Dialog, Empty, ErrorBox, Groove, ScoreCell, Skeleton, StageTag, Tabs, Textarea, useToast } from '../components/ui'
import { analyse, rescore } from '../lib/match'
import { ACCEPT, extractText } from '../lib/parse'
import { go, href } from '../lib/router'
import { getState, put, remove, useStore } from '../lib/store'
import type { Candidate, Job } from '../lib/types'
import { useUi } from '../lib/uictx'
import { fmtDays, fmtKm, fmtLpa, fmtYrs, uid } from '../lib/util'
import { Calibration } from './Calibration'
import { IdealProfile } from './IdealProfile'
import { JobForm } from './JobForm'
import { Share } from './Share'

type Tab = 'candidates' | 'ideal' | 'share' | 'calibration' | 'details'

export function JobDetail({ id, tab = 'candidates' }: { id: string; tab?: string }) {
  const ready = useStore((s) => s.ready)
  const job = useStore((s) => s.jobs[id])
  const [editing, setEditing] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const toast = useToast()
  const t = (['candidates', 'ideal', 'share', 'calibration', 'details'].includes(tab) ? tab : 'candidates') as Tab

  if (!ready) return <Skeleton rows={6} />
  if (!job) return <Empty title="This job no longer exists" action={<a className="btn" href="#jobs">Back to jobs</a>}>It may have been deleted by someone on your team.</Empty>

  async function del() {
    const cs = Object.values(getState().candidates).filter((c) => c.jobId === id)
    for (const c of cs) await remove('candidates', c.id)
    await remove('jobs', id); toast('Job and its profiles deleted'); go({ name: 'jobs' })
  }

  return <>
    <TopBar crumb={<a className="crumb btn btn--ghost btn--icon btn--sm" href="#jobs" aria-label="Back to jobs"><ArrowLeft size={16} /></a>} title={job.title}
      actions={<Button size="sm" onClick={() => setEditing(true)}><Pencil size={14} />Edit job</Button>} />
    <p className="muted small" style={{ marginTop: 'calc(var(--space-md) * -1)' }}>{job.client || 'Internal'}, {job.location.label} ({job.workMode}). {job.expMin} to {job.expMax} years, up to {job.ctcMaxLpa} LPA, notice up to {job.noticeMaxDays} days.</p>
    <Tabs value={t} onChange={(v) => { location.hash = href({ name: 'job', id, tab: v === 'candidates' ? undefined : v }).slice(1) }}
      tabs={[{ id: 'candidates', label: 'Profiles' }, { id: 'ideal', label: 'Ideal candidate' }, { id: 'share', label: 'Share job' }, { id: 'calibration', label: 'Calibration call' }, { id: 'details', label: 'Description' }]} />
    {t === 'candidates' && <Profiles job={job} />}
    {t === 'ideal' && <IdealProfile job={job} />}
    {t === 'share' && <Share job={job} />}
    {t === 'calibration' && <Calibration job={job} />}
    {t === 'details' && <section className="section">
      <div className="grid-2">
        <div className="stack"><h2>Description</h2><p className="prose">{job.description || 'No description yet. Edit the job to add one.'}</p></div>
        <div className="stack">
          <h2>Requirements</h2>
          <dl className="facts">
            <div><dt>Experience</dt><dd className="fig">{job.expMin}–{job.expMax} yrs</dd></div>
            <div><dt>Budget</dt><dd className="fig">{job.ctcMaxLpa} LPA</dd></div>
            <div><dt>Notice</dt><dd className="fig">{fmtDays(job.noticeMaxDays)}</dd></div>
            <div><dt>Openings</dt><dd className="fig">{job.openings}</dd></div>
            <div><dt>Technology</dt><dd>{job.tech}</dd></div>
            <div><dt>Map pin</dt><dd>{job.location.lat != null ? 'Placed' : 'Not found'}</dd></div>
          </dl>
          <span className="label">Must-have</span><div className="chips">{job.mustSkills.map((s) => <span key={s} className="chip chip--hit">{s}</span>)}</div>
          <span className="label">Nice-to-have</span><div className="chips">{job.niceSkills.map((s) => <span key={s} className="chip">{s}</span>)}</div>
          <div><Button variant="danger" size="sm" onClick={() => setConfirmDel(true)}><Trash2 size={14} />Delete job</Button></div>
        </div>
      </div>
    </section>}
    {editing && <JobForm job={job} onClose={() => setEditing(false)} onSaved={(j) => {
      const w = getState().config.weights
      Object.values(getState().candidates).filter((c) => c.jobId === j.id).forEach((c) => put('candidates', rescore(c, j, w)))
    }} />}
    {confirmDel && <Dialog title="Delete this job?" onClose={() => setConfirmDel(false)} footer={<><Button variant="ghost" onClick={() => setConfirmDel(false)}>Keep it</Button><Button variant="ink" onClick={del}>Delete job and profiles</Button></>}>
      <p className="small">This removes “{job.title}” and every profile uploaded to it, for everyone on your team. It cannot be undone. Export your data from Admin first if you need a copy.</p>
    </Dialog>}
  </>
}

/* ---------------- profiles: drop, read, score, rank ---------------- */

type QItem = { id: string; name: string; state: 'waiting' | 'reading' | 'scoring' | 'done' | 'error' | 'duplicate'; note?: string; candId?: string }

function Profiles({ job }: { job: Job }) {
  const cands = useStore((s) => s.candidates)
  const cfg = useStore((s) => s.config)
  const [queue, setQueue] = useState<QItem[]>([])
  const [over, setOver] = useState(false)
  const [filter, setFilter] = useState<'all' | 'short' | 'active'>('all')
  const [sort, setSort] = useState<'score' | 'exp' | 'ctc' | 'notice' | 'distance' | 'recent'>('score')
  const [paste, setPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [useAi, setUseAi] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const { openCandidate } = useUi()

  const list = useMemo(() => {
    let l = Object.values(cands).filter((c) => c.jobId === job.id)
    if (filter === 'short') l = l.filter((c) => c.shortlisted)
    if (filter === 'active') l = l.filter((c) => c.stage !== 'rejected')
    const k: Record<typeof sort, (c: Candidate) => number> = {
      score: (c) => -(c.match?.score ?? -1), exp: (c) => -(c.relevantExp ?? -1), ctc: (c) => c.expectedCtcLpa ?? 1e9,
      notice: (c) => c.noticeDays ?? 1e9, distance: (c) => c.distanceKm ?? 1e9, recent: (c) => -c.createdAt,
    }
    return l.sort((a, b) => k[sort](a) - k[sort](b))
  }, [cands, job.id, filter, sort])

  const upd = (id: string, p: Partial<QItem>) => setQueue((q) => q.map((x) => (x.id === id ? { ...x, ...p } : x)))

  async function ingest(name: string, getText: () => Promise<{ text: string; kind: string }>, qid: string) {
    try {
      upd(qid, { state: 'reading' })
      const { text, kind } = await getText()
      if (text.trim().length < 30) throw new Error('No readable text found in this file.')
      upd(qid, { state: 'scoring' })
      const st = getState()
      const { ex, match, distanceKm, place } = await analyse(text, job, st.config.weights, useAi)
      const dupe = Object.values(st.candidates).find((c) => c.jobId === job.id && ((ex.email && c.email.toLowerCase() === ex.email.toLowerCase()) || (ex.phone && ex.phone.length >= 10 && c.phone.slice(-10) === ex.phone.slice(-10))))
      const now = Date.now()
      const base: Candidate = dupe ? { ...dupe } : {
        id: uid('c'), jobId: job.id, stage: 'new', shortlisted: false, remarks: [], createdAt: now, updatedAt: now,
      } as unknown as Candidate
      const cand: Candidate = {
        ...base, name: ex.name || base.name || name.replace(/\.[^.]+$/, ''), email: ex.email || base.email || '', phone: ex.phone || base.phone || '',
        fileName: name, fileKind: kind, resumeText: text.slice(0, 40000), currentRole: ex.currentRole || '', currentCompany: ex.currentCompany || '',
        totalExp: ex.totalExp, relevantExp: ex.relevantExp ?? ex.totalExp, currentCtcLpa: dupe?.currentCtcLpa ?? ex.currentCtcLpa, expectedCtcLpa: dupe?.expectedCtcLpa ?? ex.expectedCtcLpa,
        noticeDays: dupe?.noticeDays ?? ex.noticeDays, currentLocation: place.label ? place : (dupe?.currentLocation || { label: '' }), distanceKm,
        skills: ex.skills || [], education: ex.education || '', summary: ex.summary || '', match,
        shortlisted: dupe?.shortlisted || match.score >= st.config.shortlistAt,
        remarks: [...(base.remarks || []), { id: uid('r'), at: now, kind: 'note', text: dupe ? `Resume updated (${name}), now ${match.score}% match` : `Resume added (${name}), ${match.score}% match` }],
      }
      await put('candidates', cand)
      upd(qid, { state: dupe ? 'duplicate' : 'done', note: dupe ? 'Same email or phone, profile updated' : `${match.score}%`, candId: cand.id })
    } catch (e: any) {
      upd(qid, { state: 'error', note: e.message || 'Could not read this file' })
    }
  }

  async function onFiles(files: FileList | File[]) {
    const fs = [...files]
    if (!fs.length) return
    const items = fs.map((f) => ({ id: uid('q'), name: f.name, state: 'waiting' as const }))
    setQueue((q) => [...items, ...q].slice(0, 60))
    let i = 0
    const worker = async () => { while (i < fs.length) { const k = i++; await ingest(fs[k]!.name, () => extractText(fs[k]!), items[k]!.id) } }
    await Promise.all([worker(), worker()])
    toast(`${fs.length} resume${fs.length > 1 ? 's' : ''} processed`)
  }

  async function onPaste() {
    const qid = uid('q'); const text = pasteText
    setQueue((q) => [{ id: qid, name: 'Pasted resume', state: 'waiting' }, ...q]); setPaste(false); setPasteText('')
    await ingest('Pasted resume', async () => ({ text, kind: 'text' }), qid)
  }

  function rescoreAll() {
    const w = getState().config.weights
    list.forEach((c) => put('candidates', rescore(c, job, w)))
    toast('Scores recalculated with the current weights')
  }
  function shortlistTop() {
    const at = getState().config.shortlistAt
    let n = 0
    list.forEach((c) => { const s = (c.match?.score ?? 0) >= at; if (s !== c.shortlisted) { n++; put('candidates', { ...c, shortlisted: s }) } })
    toast(n ? `Shortlist updated: everyone at ${at}% or above` : `Shortlist already matches the ${at}% line`)
  }

  const all = Object.values(cands).filter((c) => c.jobId === job.id)

  return <section className="section">
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="stack">
        <label className="drop" data-over={over} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files) }}>
          <Upload size={20} aria-hidden />
          <b>Drop resumes here, or choose files</b>
          <span className="small muted">PDF, DOCX, DOC, TXT, or a photo of a resume. Up to 60 at once.</span>
          <input ref={inputRef} type="file" multiple accept={ACCEPT} className="visually-hidden" onChange={(e) => { onFiles(e.target.files!); e.target.value = '' }} />
        </label>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <label className="check"><input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />Read with AI (more accurate, slower)</label>
          <Button size="sm" variant="ghost" onClick={() => setPaste(true)}>Paste resume text</Button>
        </div>
      </div>
      <div className="stack">
        {queue.length ? <>
          <div className="row" style={{ justifyContent: 'space-between' }}><span className="label">This session</span><Button size="sm" variant="ghost" onClick={() => setQueue((q) => q.filter((x) => !['done', 'duplicate', 'error'].includes(x.state)))}>Clear finished</Button></div>
          <ul className="queue" aria-live="polite">{queue.map((q) => (
            <li key={q.id}><span>{q.name}</span>
              <span className={q.state === 'error' ? 'small' : 'small muted'} style={q.state === 'error' ? { color: 'var(--color-error)' } : undefined}>{({ waiting: 'Waiting', reading: 'Reading…', scoring: 'Scoring…', done: q.note, duplicate: q.note, error: q.note } as any)[q.state]}</span>
              {q.candId && <Button size="sm" variant="ghost" onClick={() => openCandidate(q.candId!)}>Open</Button>}
            </li>))}</ul>
        </> : <div className="note">Each resume is read into fields (experience, CTC, notice, location, skills) and scored against this job: skills {Math.round(cfg.weights.skills * 100)}%, experience {Math.round(cfg.weights.experience * 100)}%, CTC {Math.round(cfg.weights.ctc * 100)}%, location {Math.round(cfg.weights.location * 100)}%, notice {Math.round(cfg.weights.notice * 100)}%. Change the weights in Admin.</div>}
      </div>
    </div>

    <div className="section-head" style={{ marginTop: 'var(--space-lg)' }}>
      <h2>{all.length} profile{all.length === 1 ? '' : 's'}, {all.filter((c) => c.shortlisted).length} shortlisted</h2>
      <div className="row">
        <Groove label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'short', label: 'Shortlisted' }, { value: 'active', label: 'Not rejected' }]} />
        <Button size="sm" onClick={shortlistTop}>Shortlist {cfg.shortlistAt}%+</Button>
        <Button size="sm" variant="ghost" onClick={rescoreAll}><RefreshCw size={14} />Re-score</Button>
      </div>
    </div>

    {!all.length ? <Empty title="No profiles on this job yet">Drop resumes above. Each one gets a match percentage and a row in the tracker.</Empty>
      : !list.length ? <p className="muted small">No profiles match this filter.</p> : (
      <div className="table-wrap"><table className="table table--stack">
        <thead><tr>
          {([['Candidate', null], ['Match', 'score'], ['Relevant exp', 'exp'], ['Current CTC', null], ['Expected CTC', 'ctc'], ['Notice', 'notice'], ['Location', 'distance'], ['Stage', 'recent']] as const).map(([l, k]) => (
            <th key={l} className={l !== 'Candidate' && l !== 'Location' && l !== 'Stage' ? 'num' : undefined} aria-sort={k && sort === k ? 'ascending' : undefined}>
              {k ? <button onClick={() => setSort(k)}>{l}{sort === k ? ' ↓' : ''}</button> : l}
            </th>))}
        </tr></thead>
        <tbody>{list.map((c) => (
          <tr key={c.id} data-shortlisted={c.shortlisted} onClick={() => openCandidate(c.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openCandidate(c.id)}>
            <td><div className="who"><b>{c.name}</b><span>{[c.currentRole, c.currentCompany].filter(Boolean).join(', ') || c.fileName}</span></div></td>
            <td className="num" data-label="Match"><ScoreCell m={c.match} /></td>
            <td className="num" data-label="Relevant">{fmtYrs(c.relevantExp)}<span className="muted xs"> / {fmtYrs(c.totalExp)}</span></td>
            <td className="num" data-label="Current">{fmtLpa(c.currentCtcLpa)}</td>
            <td className="num" data-label="Expected">{fmtLpa(c.expectedCtcLpa)}</td>
            <td className="num" data-label="Notice">{fmtDays(c.noticeDays)}</td>
            <td data-label="Location"><div className="who"><span style={{ color: 'var(--color-ink)', fontSize: 'var(--text-sm)' }}>{c.currentLocation.label || '—'}</span><span className="fig">{job.workMode === 'remote' ? 'remote role' : fmtKm(c.distanceKm) + ' away'}</span></div></td>
            <td data-label="Stage"><StageTag stage={c.stage} /></td>
          </tr>))}</tbody>
      </table></div>
    )}

    {paste && <Dialog title="Paste a resume" onClose={() => setPaste(false)} footer={<><Button variant="ghost" onClick={() => setPaste(false)}>Cancel</Button><Button variant="ink" disabled={pasteText.trim().length < 30} onClick={onPaste}>Read and score</Button></>}>
      <Textarea aria-label="Resume text" rows={12} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste the resume text from an email, LinkedIn or a job portal." />
    </Dialog>}
    {queue.some((q) => q.state === 'error') && <ErrorBox>Some files could not be read. Scanned PDFs and photos need AI on; password-protected PDFs need to be opened and re-saved first.</ErrorBox>}
  </section>
}
