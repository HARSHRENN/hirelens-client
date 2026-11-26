import { useEffect, useState } from 'react'
import { Button, ErrorBox, Field, Select, Textarea, useToast } from '../components/ui'
import { api } from '../lib/cloud'
import { MODE } from '../lib/runtime'
import { getState, put, useStore } from '../lib/store'
import type { AssignmentReview, Job } from '../lib/types'
interface Choice {job_id:string;recruiter_id:string;assigned_at:string;version:number;jobTitle:string;jobStatus:string;recruiterName:string;recruiterEmail:string}
interface Result {enabled:boolean;assignments:Choice[];reviews:AssignmentReview[];more:boolean}
const label=(outcome:string)=>outcome==='successful'?'Successfully closed':'Unsuccessful assignment'
const key=(a:Choice)=>`${a.job_id}/${a.version}`
export default function AssignmentFeedback({job}:{job?:Job}){
 const demo=MODE()!=='cloud',jobs=useStore(s=>s.jobs)
 const [data,setData]=useState<Result|null>(null),[error,setError]=useState(''),[selected,setSelected]=useState(''),[editing,setEditing]=useState<AssignmentReview|null>(null),[found,setFound]=useState<AssignmentReview|null>(null),[resolved,setResolved]=useState(''),[retry,setRetry]=useState(0),[loadingMore,setLoadingMore]=useState(false)
 const toast=useToast()
 const localJob=job?jobs[job.id]||job:undefined
 const choices:Choice[]=demo&&localJob?.demoAssignment?[{...localJob.demoAssignment,job_id:localJob.id,jobTitle:localJob.title,jobStatus:localJob.status,recruiterName:localJob.demoAssignment.recruiter_id==='demo_rahul'?'Rahul Sharma':'Priya Shah',recruiterEmail:localJob.demoAssignment.recruiter_id==='demo_rahul'?'rahul@example.com':'priya@example.com'}]:data?.assignments||[]
 const reviews=demo?localJob?.demoAssignmentReviews||[]:data?.reviews||[]
 const chosen=choices.find(a=>key(a)===(selected || (job?key(choices[0]||{job_id:'',version:0} as Choice):'')))
 const current=demo?reviews.find(r=>r.job_id===chosen?.job_id&&r.assignment_version===chosen?.version)||null:found?.job_id===chosen?.job_id && found?.assignment_version===chosen?.version?found:null
 const review=editing||current
 const assignment=editing?{job_id:editing.job_id,recruiter_id:editing.recruiter_id,assigned_at:editing.assigned_at,version:editing.assignment_version,jobTitle:editing.job_title,jobStatus:'',recruiterName:editing.recruiter_name,recruiterEmail:editing.recruiter_email}:chosen
 useEffect(()=>{
  if(demo)return
  let active=true
  api<Result>('admin','assignment-feedback',{jobId:job?.id}).then(r=>{if(active){setData(r);setError('')}}).catch(e=>{if(active)setError(e.message)})
  return()=>{active=false}
 },[demo,job?.id,retry])
 useEffect(()=>{
  if(demo||editing||!chosen||!data?.enabled)return
  let active=true
  api<{review:AssignmentReview|null}>('admin','assignment-review',{jobId:chosen.job_id,assignmentVersion:chosen.version}).then(r=>{if(active){setFound(r.review);setResolved(key(chosen))}}).catch(e=>{if(active){setError(e.message)}})
  return()=>{active=false}
 },[demo,editing,chosen,data?.enabled,retry])
 async function save(values:{outcome:string;rating:number|null;feedback:string}){
  if(!assignment)throw new Error('Choose a job assignment.')
  if(demo){
   const latest=getState().jobs[assignment.job_id]!,existing=(latest.demoAssignmentReviews||[]).find(r=>r.assignment_version===assignment.version)
   if((existing?.revision||0)!==(review?.revision||0)||(!existing&&(latest.demoAssignment?.version!==assignment.version||latest.demoAssignment?.recruiter_id!==assignment.recruiter_id)))throw new Error('Assignment or review changed. Refresh before saving.')
   const now=new Date().toISOString(),next:AssignmentReview={id:existing?.id||`review-${assignment.job_id}-${assignment.version}`,job_id:assignment.job_id,assignment_version:assignment.version,recruiter_id:assignment.recruiter_id,recruiter_name:assignment.recruiterName,recruiter_email:assignment.recruiterEmail,job_title:assignment.jobTitle,assigned_at:assignment.assigned_at,outcome:values.outcome as AssignmentReview['outcome'],rating:values.rating,feedback:values.feedback.trim(),revision:(existing?.revision||0)+1,created_at:existing?.created_at||now,updated_at:now,updated_by:'Demo admin',history:existing?[...existing.history,{revision:existing.revision,outcome:existing.outcome,rating:existing.rating,feedback:existing.feedback,updated_at:existing.updated_at,updated_by:existing.updated_by}]:[]}
   await put('jobs',{...latest,demoAssignmentReviews:[...(latest.demoAssignmentReviews||[]).filter(r=>r.assignment_version!==assignment.version),next]})
  }else{
   await api('admin','save-assignment-feedback',{jobId:assignment.job_id,assignmentVersion:assignment.version,recruiterId:assignment.recruiter_id,revision:review?.revision||0,...values})
   setResolved('');setRetry(n=>n+1)
  }
  setEditing(null);toast('Recruiter outcome feedback saved')
 }
 async function more(){setLoadingMore(true);try{const page=await api<Result>('admin','assignment-feedback',{jobId:job?.id,offset:reviews.length});setData(d=>d?{...d,reviews:[...d.reviews,...page.reviews],more:page.more}:page)}catch(e){setError((e as Error).message)}finally{setLoadingMore(false)}}
 return <section className="section" aria-label="Recruiter assignment outcome feedback">
  <div className="section-head"><h2>Recruiter outcome feedback</h2><p>Admin assessment for a specific recruiter and job assignment.</p></div>
  {demo&&<p className="small muted">Demo feedback is saved in this browser only.</p>}
  {error&&<ErrorBox onRetry={()=>setRetry(n=>n+1)}>{error}</ErrorBox>}
  {!demo&&!data?<p className="small muted">Loading assignment feedback…</p>:!demo&&!data?.enabled?<p className="small muted">Recruiter feedback database setup is pending.</p>:<>
   {!editing&&<Field label="Job assignment"><Select value={chosen?key(chosen):''} onChange={e=>{setSelected(e.target.value);setFound(null)}} options={[{value:'',label:'Choose an assigned job'},...choices.map(a=>({value:key(a),label:`${a.jobTitle} — ${a.recruiterName} (assignment ${a.version})`}))]}/></Field>}
   {!choices.length&&!editing&&<p className="small muted">Assign a job to a recruiter before recording its outcome.</p>}
   {assignment&&<><p className="small"><b>{assignment.recruiterName}</b> · {assignment.jobTitle} · Assignment {assignment.version}{editing?' · Editing saved review':''}</p>
    {(resolved!==key(assignment))&&!demo&&!editing?<p>Loading the saved review…</p>:<ReviewEditor key={`${assignment.job_id}/${assignment.version}/${review?.revision||0}`} review={review} onSave={save}/>}
    {editing&&<Button size="sm" variant="ghost" onClick={()=>setEditing(null)}>Back to current assignments</Button>}
   </>}
   <p className="xs muted">This records the admin’s outcome assessment. Job status and candidate stages are managed separately. Saved feedback stays attributed to this assignment after reassignment.</p>
   <h3>Saved assignment feedback</h3>
   {!reviews.length?<p className="small muted">No assignment outcomes recorded yet.</p>:<div className="stack">{reviews.map(r=><article className="stock" style={{padding:16}} key={r.id}><div className="row" style={{justifyContent:'space-between'}}><b>{r.recruiter_name} · {r.job_title}</b><Button size="sm" variant="ghost" onClick={()=>setEditing(r)}>Edit feedback</Button></div><p className="small"><b>{label(r.outcome)}</b>{r.rating?` · ${r.rating}/5`:''} · Assignment {r.assignment_version} · {new Date(r.updated_at).toLocaleString('en-IN')}</p><p className="small" style={{whiteSpace:'pre-wrap'}}>{r.feedback}</p>{r.history.length>0&&<details><summary className="small">Previous revisions ({r.history.length})</summary>{r.history.map(h=><p className="small" key={h.revision}>Revision {h.revision} · {label(h.outcome)}{h.rating?` · ${h.rating}/5`:''} · {new Date(h.updated_at).toLocaleString('en-IN')}<br/>{h.feedback}</p>)}</details>}</article>)}</div>}
   {!demo&&data?.more&&<Button busy={loadingMore} onClick={more}>Load older feedback</Button>}
  </>}
 </section>
}
function ReviewEditor({review,onSave}:{review:AssignmentReview|null;onSave:(v:{outcome:string;rating:number|null;feedback:string})=>Promise<void>}){
 const [outcome,setOutcome]=useState(review?.outcome||''),[rating,setRating]=useState(review?.rating?String(review.rating):''),[feedback,setFeedback]=useState(review?.feedback||''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <form className="stack" onSubmit={async e=>{e.preventDefault();if(!outcome||feedback.trim().length<5){setError('Choose an outcome and add at least five characters of feedback.');return}setBusy(true);setError('');try{await onSave({outcome,rating:rating?+rating:null,feedback})}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>
  <div className="grid-2"><Field label="Assignment outcome"><Select required value={outcome} onChange={e=>setOutcome(e.target.value as typeof outcome)} options={[{value:'',label:'Choose outcome'},{value:'successful',label:'Successfully closed'},{value:'unsuccessful',label:'Unsuccessful assignment'}]}/></Field><Field label="Performance rating (optional)"><Select value={rating} onChange={e=>setRating(e.target.value)} options={[{value:'',label:'No rating'},...[1,2,3,4,5].map(n=>({value:String(n),label:`${n}/5`}))]}/></Field></div>
  <Field label="Admin performance feedback" hint="Record achievements, reasons for the outcome and follow-up actions."><Textarea required minLength={5} maxLength={5000} rows={4} value={feedback} onChange={e=>setFeedback(e.target.value)}/></Field>
  {error&&<ErrorBox>{error}</ErrorBox>}<div><Button type="submit" variant="ink" busy={busy}>{review?'Update outcome feedback':'Save outcome feedback'}</Button></div>
 </form>
}
