import { useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { Empty, ScoreCell, Select, Skeleton } from '../components/ui'
import { put, useStore } from '../lib/store'
import { STAGES, stageLabel, type Candidate, type Stage } from '../lib/types'
import { useUi } from '../lib/uictx'
import { fmtDays, fmtLpa, uid } from '../lib/util'

export function Pipeline() {
  const ready = useStore((s) => s.ready)
  const cands = useStore((s) => s.candidates)
  const jobs = useStore((s) => s.jobs)
  const [job, setJob] = useState('all')
  const [over, setOver] = useState<Stage | null>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const { openCandidate } = useUi()

  const cols = useMemo(() => {
    const l = Object.values(cands).filter((c) => job === 'all' || c.jobId === job)
    return STAGES.map((s) => ({ ...s, items: l.filter((c) => c.stage === s.id).sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0)) }))
  }, [cands, job])

  function move(c: Candidate, s: Stage) {
    if (c.stage === s) return
    put('candidates', { ...c, stage: s, remarks: [...c.remarks, { id: uid('r'), at: Date.now(), kind: 'stage', text: `Moved to ${stageLabel(s)}` }] })
  }

  return <>
    <TopBar title="Pipeline" actions={<div style={{ width: 240 }}><Select aria-label="Job" value={job} onChange={(e) => setJob(e.target.value)} options={[{ value: 'all', label: 'All jobs' }, ...Object.values(jobs).map((j) => ({ value: j.id, label: j.title }))]} /></div>} />
    {!ready ? <Skeleton rows={6} /> : !Object.keys(cands).length ? <Empty title="The pipeline is empty">Profiles appear here once resumes are dropped on a job. Drag cards between columns to move them through L1, L2 and selection.</Empty> : (
      <div className="board" role="list" aria-label="Stages">
        {cols.map((col) => (
          <section key={col.id} className="col" role="listitem" aria-label={`${col.label}, ${col.items.length}`} data-over={over === col.id}
            onDragOver={(e) => { e.preventDefault(); setOver(col.id) }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const c = drag && cands[drag]; if (c) move(c, col.id); setDrag(null) }}>
            <h3>{col.label}<span className="fig">{col.items.length}</span></h3>
            {col.items.map((c) => (
              <article key={c.id} className="kcard stock" draggable data-shortlisted={c.shortlisted}
                onDragStart={(e) => { setDrag(c.id); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => setDrag(null)}
                onClick={() => openCandidate(c.id)} tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openCandidate(c.id)
                  const i = STAGES.findIndex((s) => s.id === c.stage)
                  if (e.key === 'ArrowRight' && i < STAGES.length - 1) move(c, STAGES[i + 1]!.id)
                  if (e.key === 'ArrowLeft' && i > 0) move(c, STAGES[i - 1]!.id)
                }}
                aria-label={`${c.name}, ${c.match?.score ?? 'unscored'} percent. Arrow keys move stage.`}>
                <div className="row" style={{ justifyContent: 'space-between' }}><b>{c.name}</b><ScoreCell m={c.match} /></div>
                <span className="xs muted">{jobs[c.jobId]?.title}</span>
                <span className="xs muted fig">{fmtLpa(c.expectedCtcLpa)}, {fmtDays(c.noticeDays)}</span>
              </article>
            ))}
            {!col.items.length && <p className="xs muted" style={{ padding: 'var(--space-xs)' }}>Drop a card here</p>}
          </section>
        ))}
      </div>
    )}
    <p className="xs muted">Drag cards between columns, or focus a card and use the left and right arrow keys. Every move is logged on the profile.</p>
  </>
}
