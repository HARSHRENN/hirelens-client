import { requireAdmin } from './adminAuth.js'
import { fail } from './http.js'
import { db } from './supa.js'
export const reviewColumns='id,job_id,assignment_version,recruiter_id,recruiter_name,recruiter_email,job_title,assigned_at,outcome,rating,feedback,revision,created_at,updated_at,updated_by,history'
const missing=error=>['PGRST205','42P01'].includes(error?.code)
export const recruiterFeedbackHandlers={
 async 'assignment-review'(req,b){
  await requireAdmin(req)
  if(typeof b.jobId!=='string'||!Number.isInteger(b.assignmentVersion)||b.assignmentVersion<1)fail(400,'Choose an assignment.')
  const {data,error}=await db().from('recruiter_assignment_reviews').select(reviewColumns).eq('job_id',b.jobId).eq('assignment_version',b.assignmentVersion).maybeSingle()
  if(error)throw error
  return {review:data}
 },
 async 'assignment-feedback'(req,b){
  await requireAdmin(req)
  const offset=b.offset??0
  if(!Number.isInteger(offset)||offset<0||offset>100000)fail(400,'Invalid page.')
  let reviews=db().from('recruiter_assignment_reviews').select(reviewColumns).order('updated_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+49)
  if(b.jobId)reviews=reviews.eq('job_id',b.jobId)
  const {data,error}=await reviews
  if(error){if(missing(error))return {enabled:false,reviews:[],assignments:[],more:false};throw error}
  const all=[]
  for(let from=0;;from+=1000){
   let query=db().from('job_assignments').select('job_id,recruiter_id,assigned_at,version').order('job_id').range(from,from+999)
   if(b.jobId)query=query.eq('job_id',b.jobId)
   const page=await query;if(page.error)throw page.error;all.push(...page.data);if(page.data.length<1000)break
  }
  const people=new Map(),jobs=new Map()
  for(let from=0;from<all.length;from+=200){
   const chunk=all.slice(from,from+200)
   const results=await Promise.all([db().from('profiles').select('id,full_name,username,email,status').in('id',[...new Set(chunk.map(a=>a.recruiter_id))]),db().from('docs').select('id,data').eq('coll','jobs').in('id',chunk.map(a=>a.job_id))])
   for(const r of results)if(r.error)throw r.error
   results[0].data.forEach(p=>people.set(p.id,p));results[1].data.forEach(j=>jobs.set(j.id,j.data))
  }
  return {enabled:true,reviews:data,more:data.length===50,assignments:all.map(a=>({...a,jobTitle:jobs.get(a.job_id)?.title||'Unavailable job',jobStatus:jobs.get(a.job_id)?.status||'',recruiterName:people.get(a.recruiter_id)?.full_name||people.get(a.recruiter_id)?.username||'Unavailable recruiter',recruiterEmail:people.get(a.recruiter_id)?.email||''}))}
 },
 async 'save-assignment-feedback'(req,b){
  const actor=await requireAdmin(req)
  if(typeof b.jobId!=='string'||!b.jobId||b.jobId.length>200||typeof b.recruiterId!=='string'||!Number.isInteger(b.assignmentVersion)||b.assignmentVersion<1||!Number.isInteger(b.revision)||b.revision<0||!['successful','unsuccessful'].includes(b.outcome)||typeof b.feedback!=='string'||b.feedback.trim().length<5||b.feedback.length>5000||(b.rating!=null&&(!Number.isInteger(b.rating)||b.rating<1||b.rating>5)))fail(400,'Choose an assignment, outcome, optional rating and feedback (5–5000 characters).')
  const {data,error}=await db().rpc('save_recruiter_assignment_review',{p_job:b.jobId,p_version:b.assignmentVersion,p_recruiter:b.recruiterId,p_revision:b.revision,p_outcome:b.outcome,p_rating:b.rating??null,p_feedback:b.feedback,p_actor:actor.id||'platform-admin'})
  if(error)fail(409,error.message)
  return {review:data}
 }
}
