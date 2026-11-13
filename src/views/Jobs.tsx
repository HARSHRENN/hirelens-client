import { Plus } from 'lucide-react'
import { useState } from 'react'
import { TopBar } from '../components/TopBar'
import { Button, Empty, Groove, Skeleton } from '../components/ui'
import { href, go } from '../lib/router'
import { useStore } from '../lib/store'
import type { Job } from '../lib/types'
import { JobForm } from './JobForm'

export function Jobs() {
  const ready = useStore((s) => s.ready)
  const jobs = useStore((s) => s.jobs)
  const cands = useStore((s) => s.candidates)
  const [status, setStatus] = useState<Job['status'] | 'all'>('open')
  const [creating, setCreating] = useState(false)
  const list = Object.values(jobs).filter((j) => status === 'all' || j.status === status).sort((a, b) => b.createdAt - a.createdAt)

  return <>
    <TopBar title="Jobs" actions={<>
      <Groove label="Status" value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open' }, { value: 'paused', label: 'Paused' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} />
      <Button variant="ink" onClick={() => setCreating(true)}><Plus size={16} />New job</Button>
    </>} />
    {!ready ? <Skeleton /> : !list.length ? (
      <Empty title={status === 'all' ? 'No jobs yet' : `No ${status} jobs`} action={<Button variant="ink" onClick={() => setCreating(true)}><Plus size={16} />New job</Button>}>
        Each job holds its description, the resumes dropped on it and their match scores.
      </Empty>
    ) : (
      <div className="cardlist">
        {list.map((j) => {
          const cs = Object.values(cands).filter((c) => c.jobId === j.id)
          return (
            <a key={j.id} className="jobcard stock" href={href({ name: 'job', id: j.id })}>
              <div className="row" style={{ justifyContent: 'space-between' }}><span className="small muted">{j.client || 'Internal'}</span>{j.status !== 'open' && <span className="stage-tag" data-stage="hold">{j.status}</span>}</div>
              <h3>{j.title}</h3>
              <p className="meta">{j.location.label}, {j.workMode}. {j.expMin} to {j.expMax} years, up to {j.ctcMaxLpa} LPA.</p>
              <div className="chips">{j.mustSkills.slice(0, 5).map((s) => <span key={s} className="chip">{s}</span>)}</div>
              <div className="foot">
                <span><b>{cs.length}</b> <span className="muted">profiles</span></span>
                <span><b>{cs.filter((c) => c.shortlisted).length}</b> <span className="muted">shortlisted</span></span>
                <span><b>{cs.filter((c) => c.stage === 'selected').length}</b> <span className="muted">selected</span></span>
              </div>
            </a>
          )
        })}
      </div>
    )}
    {creating && <JobForm onClose={() => setCreating(false)} onSaved={(j) => go({ name: 'job', id: j.id })} />}
  </>
}
