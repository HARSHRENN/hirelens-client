import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
import { db, requireUser, supaUrl, supaAnon } from './supa.js'
import { fail, isEmail, originOf } from './http.js'
import { sendMail } from './mail.js'
import { panelistInvitation } from './panelistInvitation.js'
const digest = token => createHash('sha256').update(token).digest('hex')
const tokenOf = b => { if (typeof b.token !== 'string' || !/^[a-f0-9]{64}$/.test(b.token)) fail(404,'Feedback link not found.'); return digest(b.token) }
export const feedbackColumns = 'candidate_id,interview_id,panelist_id,panelist_name,expires_at,requested_at,revoked_at,submitted_at,rating,recommendation,comments'
async function candidateAccess(req, id) {
 const actor = await requireUser(req)
 const { data: c, error } = await db().from('docs').select('owner,data').eq('coll','candidates').eq('id',id).maybeSingle()
 if (error) throw error
 if (!c) fail(404,'Candidate not found.')
 if (!actor.isAdmin) {
  const { data: a } = await db().from('job_assignments').select('recruiter_id').eq('job_id',c.data.jobId).maybeSingle()
  if (c.owner!==actor.profile.id || a?.recruiter_id!==actor.profile.id) fail(403,'This job is not assigned to you.')
 }
 return { ...actor, candidate:c }
}
export const panelFeedbackHandlers = {
 async 'panel-feedback-email'(req,b) {
  const { profile, candidate:c } = await candidateAccess(req,b.candidateId)
  const iv=c.data.interviews?.find(i=>i.id===b.interviewId && i.panelistIds?.includes(b.panelistId))
  if(!iv)fail(400,'Choose a panelist assigned to this interview.')
  const {data:a,error:ae}=await db().from('job_assignments').select('original_owner').eq('job_id',c.data.jobId).maybeSingle()
  if(ae)throw ae
  const {data:panels,error:pe}=await db().from('docs').select('owner,data').eq('coll','panelists').eq('id',b.panelistId).in('owner',[...new Set([c.owner,a?.original_owner].filter(Boolean))])
  if(pe)throw pe
  const panel=panels.find(p=>p.owner===c.owner)?.data || panels[0]?.data
  if(!panel || !isEmail(panel.email))fail(400,'Add a valid email address for this panelist on the Panelists page.')
  const {data:j,error:je}=await db().from('docs').select('data').eq('coll','jobs').eq('id',c.data.jobId).maybeSingle()
  if(je)throw je
  const token=randomBytes(32).toString('hex')
  const {error}=await db().rpc('request_panel_feedback',{cid:b.candidateId,iid:b.interviewId,pid:b.panelistId,actor:profile.id,digest:digest(token)})
  if(error)fail(409,error.message)
  const url=`${originOf(req)}/feedback#${token}`
  await sendMail(panelistInvitation({candidate:c.data,job:j?.data||{},interview:iv,panelist:{...panel,id:b.panelistId},url,organizer:profile.email,owner:profile.id}))
  return {ok:true}
 },
 async 'panel-feedback-request'(req,b) {
  const { profile } = await candidateAccess(req,b.candidateId)
  const token = randomBytes(32).toString('hex')
  const { error } = await db().rpc('request_panel_feedback',{cid:b.candidateId,iid:b.interviewId,pid:b.panelistId,actor:profile.id,digest:digest(token)})
  if (error) fail(409,error.message)
  return { url:`${originOf(req)}/feedback#${token}` }
 },
 async 'panel-feedback-list'(req,b) {
  await candidateAccess(req,b.candidateId)
  // Re-evaluate RLS at read time in case the job was reassigned after access checking.
  const scoped = createClient(supaUrl(),supaAnon(),{global:{headers:{Authorization:req.headers.authorization}},auth:{persistSession:false,autoRefreshToken:false}})
  const feedback=[]
  for(let from=0;;from+=1000){
   const {data,error}=await scoped.from('panel_feedback').select(feedbackColumns).eq('candidate_id',b.candidateId).order('interview_id').order('panelist_id').range(from,from+999)
   if(error){if(['PGRST205','42P01'].includes(error.code))return {enabled:false,feedback:[]};throw error}
   feedback.push(...data)
   if(data.length<1000)break
  }
  return {enabled:true,feedback}
 },
 async 'panel-feedback-revoke'(req,b) {
  const { profile } = await candidateAccess(req,b.candidateId)
  const { error } = await db().rpc('revoke_panel_feedback',{cid:b.candidateId,iid:b.interviewId,pid:b.panelistId,actor:profile.id})
  if(error)throw error
  return {ok:true}
 },
 async 'panel-feedback-view'(_req,b) {
  const { data:f,error } = await db().from('panel_feedback').select('*').eq('token_hash',tokenOf(b)).maybeSingle()
  if(error)throw error
  if(!f || f.revoked_at || Date.parse(f.expires_at)<=Date.now()) fail(410,'This feedback link has expired or been revoked. Ask the recruiter for a new link.')
  const {data:c} = await db().from('docs').select('data').eq('coll','candidates').eq('id',f.candidate_id).maybeSingle()
  const iv=c?.data.interviews?.find(i=>i.id===f.interview_id && i.panelistIds?.includes(f.panelist_id))
  if(!iv)fail(410,'This interview is no longer available.')
  const {data:j} = await db().from('docs').select('data').eq('coll','jobs').eq('id',c.data.jobId).maybeSingle()
  return {candidate:c.data.name,job:j?.data.title||'Interview',panelist:f.panelist_name,round:iv.round,at:iv.at,expiresAt:f.expires_at,submitted:!!f.submitted_at}
 },
 async 'panel-feedback-submit'(_req,b) {
  const hash=tokenOf(b)
  if(!Number.isInteger(b.rating) || b.rating<1 || b.rating>5 || !['select','hold','reject'].includes(b.recommendation) || typeof b.comments!=='string' || b.comments.trim().length<5 || b.comments.length>5000)fail(400,'Choose a rating and recommendation, and add comments (5–5000 characters).')
  const {error} = await db().rpc('submit_panel_feedback',{digest:hash,score:b.rating,decision:b.recommendation,notes:b.comments})
  if(error)fail(409,error.message)
  return {ok:true}
 },
}
