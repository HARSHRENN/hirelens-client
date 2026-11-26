import AssignmentFeedback from '../admin/AssignmentFeedback'
import { AddRecruiter } from '../admin/AddRecruiter'
import { JobEmail } from './JobEmail'
import { useState } from 'react'
import { Button, ErrorBox, Field, Select, useToast } from '../components/ui'
import { api } from '../lib/cloud'
import { useMe } from '../lib/me'
import { MODE } from '../lib/runtime'
import { getState, initStore, put, useStore } from '../lib/store'
import type { Job } from '../lib/types'
const DEMO_RECRUITERS = [
  { id: 'demo_rahul', full_name: 'Rahul Sharma', email: 'rahul@example.com', status: 'active' },
  { id: 'demo_priya', full_name: 'Priya Shah', email: 'priya@example.com', status: 'active' },
]
export function AssignRecruiter({ job }: { job: Job }) {
  const { me } = useMe()
  const enabled = useStore(s => s.assignmentsEnabled)
  const assignments = useStore(s => s.assignments)
  const recruiters = useStore(s => s.recruiters)
  const demo = MODE() !== 'cloud'
  const current = demo ? job.demoAssignment : assignments[job.id]
  const options = demo ? DEMO_RECRUITERS : recruiters
  const responsible = options.find(r => r.id === current?.recruiter_id)
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()
  async function assign() {
    if (!chosen || chosen === current?.recruiter_id || busy) return
    setBusy(true); setError('')
    try {
      if (demo) await put('jobs', { ...getState().jobs[job.id]!, demoAssignment: { recruiter_id: chosen, assigned_at: new Date().toISOString(), version: (current?.version || 0) + 1 } })
      else {
        await api('app', 'assign-job', { jobId: job.id, recruiterId: chosen, version: current?.version || 0 })
        await initStore({ userId: me!.profile.id })
      }
      setChosen(''); toast(current ? 'Job reassigned' : 'Job assigned')
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  if (!demo && !enabled) return <section className="section"><h2>Assign recruiter</h2><p className="small">The assignment database migration has not been applied. The local demo is available for preview; live assignment controls will appear after database setup.</p></section>
  return <section className="section" aria-labelledby="assignment-heading">
    <div className="section-head"><h2 id="assignment-heading">Assign recruiter</h2><p>Choose one recruiter responsible for this job and its candidate pipeline.</p></div>
    {demo && <p className="small" role="note">Demo preview: these sample recruiters and assignments are saved in this browser only. Real assignments are managed by an admin in the signed-in workspace.</p>}
    <div className="stock" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-lg)' }}>
      <span className="label">Currently responsible</span><h3>{responsible?.full_name || responsible?.email || (current ? 'Recruiter unavailable' : 'Unassigned')}</h3>
      {responsible && <p className="small muted">{responsible.email}{responsible.status !== 'active' ? ' · suspended' : ''}</p>}
      {current && <p className="xs muted">Assigned {new Date(current.assigned_at).toLocaleString('en-IN')}</p>}
    </div>
    {error && <ErrorBox>{error}</ErrorBox>}
    <div style={{ maxWidth: 520 }} className="stack">
      <Field label={current ? 'Reassign to' : 'Select recruiter'}><Select value={chosen} onChange={e => setChosen(e.target.value)} options={[{ value: '', label: 'Choose an active recruiter' }, ...options.filter(r => r.status === 'active').map(r => ({ value: r.id, label: `${r.full_name || r.email}${r.id === current?.recruiter_id ? ' (current)' : ''}` }))]} /></Field>
      <div><Button variant="ink" busy={busy} disabled={!chosen || chosen === current?.recruiter_id} onClick={assign}>{current ? 'Reassign job' : 'Assign job'}</Button></div>
      {!options.some(r => r.status === 'active') && <p className="small muted">No active recruiter accounts yet. Add a recruiter to assign this job.</p>}
      {!demo && me?.isAdmin && <div><AddRecruiter onCreated={()=>initStore({userId:me.profile.id})}/></div>}
      <p className="small muted">Reassignment moves the job and its existing candidate records together. The previous recruiter loses access; the admin retains access. Dashboard changes appear within 10 seconds or when the window regains focus.</p>
    </div>
    <AssignmentFeedback key={job.id} job={job}/>
    {responsible && <div style={{marginTop:24}}><JobEmail key={`${job.id}/${job.updatedAt}/${responsible.id}`} job={job} to={responsible.email} recipient="assigned recruiter"/></div>}
  </section>
}
