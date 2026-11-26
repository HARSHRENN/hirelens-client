import test from 'node:test'
import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {ASSIGNMENTS_SQL} from '../api/_lib/assignmentsSchema.js'
import {RECRUITER_FEEDBACK_SQL} from '../api/_lib/recruiterFeedbackSchema.js'
import {recruiterAnalytics} from '../api/_lib/recruiterAnalytics.js'
const admin='10000000-0000-0000-0000-000000000001',a='10000000-0000-0000-0000-000000000002',b='10000000-0000-0000-0000-000000000003'
async function setup(){
 const p=new PGlite()
 await p.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table profiles(id uuid primary key,role text,status text,full_name text,email text);
 create table docs(owner uuid,coll text,id text,data jsonb,updated_at timestamptz default now(),primary key(owner,coll,id));
 alter table docs enable row level security;grant select,insert,update,delete on docs to authenticated;
 create function is_active_user() returns boolean language sql stable security definer as $$ select exists(select 1 from profiles where id=auth.uid() and status='active') $$;
 insert into profiles values('${admin}','admin','active','Admin','admin@example.com'),('${a}','hr','active','A','a@example.com'),('${b}','hr','active','B','b@example.com');
 insert into docs values('${admin}','jobs','j','{"title":"Product Owner","status":"open"}',now());`)
 await p.exec(ASSIGNMENTS_SQL);await p.exec(RECRUITER_FEEDBACK_SQL)
 await p.query('select assign_job($1,$2,$3,$4)',['j',a,admin,0]);return p
}
const save=(p,{version=1,recruiter=a,revision=0,outcome='successful',rating=4,feedback='Good delivery and candidate coordination.',actor=admin}={})=>p.query('select * from save_recruiter_assignment_review($1,$2,$3,$4,$5,$6,$7,$8)',['j',version,recruiter,revision,outcome,rating,feedback,actor])
test('assignment reviews persist, prevent duplicates/stale writes and preserve edit history',async()=>{
 const p=await setup();try{
  await p.exec(RECRUITER_FEEDBACK_SQL)
  await save(p);await assert.rejects(save(p),/Review changed/)
  await save(p,{revision:1,outcome:'unsuccessful',rating:2,feedback:'Outcome corrected after the client cancelled the assignment.'})
  let row=(await p.query('select * from recruiter_assignment_reviews')).rows[0]
  assert.equal(row.revision,2);assert.equal(row.outcome,'unsuccessful');assert.equal(row.history.length,1);assert.equal(row.history[0].outcome,'successful')
  assert.equal(row.recruiter_name,'A');assert.equal(row.job_title,'Product Owner')
  await assert.rejects(save(p,{revision:1}),/Review changed/)
  assert.equal((await p.query("select data->>'status' as status from docs where id='j'")).rows[0].status,'open')
  await p.query('select assign_job($1,$2,$3,$4)',['j',b,admin,1])
  await save(p,{version:2,recruiter:b,feedback:'Successfully completed the replacement assignment.'})
  const reviews=(await p.query('select * from recruiter_assignment_reviews')).rows
  assert.equal(reviews.length,2);assert.equal(reviews.find(r=>r.assignment_version===1).recruiter_id,a)
  const rows=recruiterAnalytics([{id:a,role:'hr'},{id:b,role:'hr'}],[],{reviews}).rows
  assert.equal(rows[0].unsuccessfulAssignments,1);assert.equal(rows[0].successfulAssignments,0);assert.equal(rows[1].successfulAssignments,1)
  const filtered=recruiterAnalytics([{id:a,role:'hr'}],[],{from:1,to:2,reviews}).rows
  assert.equal(filtered[0].unsuccessfulAssignments,0)
 }finally{await p.close()}
})
test('private feedback cannot be read or forged by recruiters or anonymous clients',async()=>{
 const p=await setup();try{
  await assert.rejects(save(p,{actor:a}),/Admin access/)
  await assert.rejects(save(p,{rating:6}),/optional rating/)
  await assert.rejects(save(p,{feedback:' '}),/feedback/)
  await save(p,{actor:'platform-admin'})
  await p.exec(`set role authenticated;set request.jwt.claim.sub='${a}'`)
  await assert.rejects(p.query('select * from recruiter_assignment_reviews'),/permission denied/)
  await assert.rejects(save(p,{revision:1,actor:'platform-admin'}),/permission denied/)
  await p.exec(`set request.jwt.claim.sub='${admin}'`)
  await assert.rejects(p.query('select * from recruiter_assignment_reviews'),/permission denied/)
  await p.exec('reset role;set role anon');await assert.rejects(p.query('select * from recruiter_assignment_reviews'),/permission denied/)
 }finally{await p.close()}
})
test('stale assignments cannot receive new reviews; historical reviews survive reassignment and job removal',async()=>{
 const p=await setup();try{
  await p.query('select assign_job($1,$2,$3,$4)',['j',b,admin,1])
  await assert.rejects(save(p),/Assignment changed/)
  await save(p,{version:2,recruiter:b})
  await p.exec("delete from docs where coll='jobs' and id='j'")
  await save(p,{version:2,recruiter:b,revision:1,outcome:'unsuccessful',feedback:'Historical assessment corrected with context.'})
  const row=(await p.query('select * from recruiter_assignment_reviews')).rows[0]
  assert.equal(row.job_title,'Product Owner');assert.equal(row.revision,2)
 }finally{await p.close()}
})
