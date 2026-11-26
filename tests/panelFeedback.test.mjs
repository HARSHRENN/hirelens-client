import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { ASSIGNMENTS_SQL } from '../api/_lib/assignmentsSchema.js'
import { PANEL_FEEDBACK_SQL } from '../api/_lib/panelFeedbackSchema.js'
const admin='10000000-0000-0000-0000-000000000001', hr='10000000-0000-0000-0000-000000000002', other='10000000-0000-0000-0000-000000000003'
async function setup(){
 const p=new PGlite()
 await p.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table profiles(id uuid primary key,role text,status text);
 create table docs(owner uuid,coll text,id text,data jsonb,updated_at timestamptz default now(),primary key(owner,coll,id));
 alter table docs enable row level security;grant select,insert,update,delete on docs to authenticated;
 create function is_active_user() returns boolean language sql stable security definer as $$ select exists(select 1 from profiles where id=auth.uid() and status='active') $$;
 insert into profiles values('${admin}','admin','active'),('${hr}','hr','active'),('${other}','hr','active');
 insert into docs values('${hr}','jobs','j','{"title":"Job"}',now()),('${hr}','panelists','p1','{"name":"Panelist One"}',now()),('${hr}','panelists','p2','{"name":"Panelist Two"}',now()),('${hr}','candidates','c','{"jobId":"j","name":"Candidate","interviews":[{"id":"iv","panelistIds":["p1","p2"],"at":1,"round":"l1"}]}',now());`)
 await p.exec(ASSIGNMENTS_SQL);await p.exec(PANEL_FEEDBACK_SQL)
 await p.exec(`insert into job_assignments(job_id,recruiter_id,original_owner,assigned_by) values('j','${hr}','${hr}','${admin}')`)
 return p
}
const request=(p,pid,hash,actor=hr)=>p.query('select request_panel_feedback($1,$2,$3,$4,$5)',['c','iv',pid,actor,hash])
const submit=(p,hash,score=4)=>p.query('select submit_panel_feedback($1,$2,$3,$4)',[hash,score,'select','Strong technical examples.'])
test('separate panelist responses, token rotation, validation, expiry and single submission',async()=>{
 const p=await setup();try{
  await assert.rejects(request(p,'p1','bad',other),/accessible/)
  await assert.rejects(request(p,'unknown','bad'),/not assigned/)
  await request(p,'p1','first');await request(p,'p1','second')
  assert.equal((await p.query('select * from panel_feedback')).rows.length,1)
  await assert.rejects(submit(p,'first'),/expired/)
  await assert.rejects(submit(p,'second',6),/rating/)
  await submit(p,'second');await assert.rejects(submit(p,'second'),/already submitted/)
  await assert.rejects(request(p,'p1','third'),/already been submitted/)
  await request(p,'p2','fourth');await p.exec("update panel_feedback set expires_at=now()-interval '1 minute' where panelist_id='p2'")
  await assert.rejects(submit(p,'fourth'),/expired/)
  await request(p,'p2','fifth');await p.query('select revoke_panel_feedback($1,$2,$3,$4)',['c','iv','p2',hr]);await assert.rejects(submit(p,'fifth'),/revoked/)
  await request(p,'p2','sixth');await submit(p,'sixth')
  const rows=(await p.query('select * from panel_feedback')).rows;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.submitted_at))
  const candidate=(await p.query("select data from docs where id='c'")).rows[0].data
  assert.equal(candidate.stage,undefined);assert.equal(candidate.interviews[0].result,undefined)
 }finally{await p.close()}
})
test('authenticated users cannot see hashes or submit directly; RLS tracks assignment',async()=>{
 const p=await setup();try{
  await request(p,'p1','secret-hash')
  await p.exec(`set role authenticated;set request.jwt.claim.sub='${hr}'`)
  assert.equal((await p.query('select panelist_name from panel_feedback')).rows.length,1)
  await assert.rejects(p.query('select token_hash from panel_feedback'),/permission denied/)
  await assert.rejects(submit(p,'secret-hash'),/permission denied/)
  await p.exec(`set request.jwt.claim.sub='${other}'`);assert.equal((await p.query('select panelist_name from panel_feedback')).rows.length,0)
  await p.exec('reset role');await p.query('select assign_job($1,$2,$3,$4)',['j',other,admin,1])
  await p.exec(`set role authenticated;set request.jwt.claim.sub='${hr}'`);assert.equal((await p.query('select panelist_name from panel_feedback')).rows.length,0)
  await p.exec(`set request.jwt.claim.sub='${other}'`);assert.equal((await p.query('select panelist_name from panel_feedback')).rows.length,1)
  await p.exec('reset role');await p.exec("delete from docs where coll='candidates' and id='c'");assert.equal((await p.query('select * from panel_feedback')).rows.length,0)
 }finally{await p.close()}
})
test('admin review, anonymous isolation, removed interviews and invalid comments',async()=>{
 const p=await setup();try{
  await p.exec(PANEL_FEEDBACK_SQL) // migration is safe to run again
  await request(p,'p1','hash',admin)
  await assert.rejects(p.query('select submit_panel_feedback($1,$2,$3,$4)',['hash',4,'select','   ']),/comments/)
  await p.exec(`set role authenticated;set request.jwt.claim.sub='${admin}'`)
  assert.equal((await p.query('select panelist_name from panel_feedback')).rows.length,1)
  await p.exec('reset role;set role anon')
  await assert.rejects(p.query('select panelist_name from panel_feedback'),/permission denied/)
  await p.exec('reset role')
  await p.exec(`update docs set data=jsonb_set(data,'{interviews}','[]') where coll='candidates' and id='c'`)
  await assert.rejects(submit(p,'hash'),/no longer available/)
  assert.equal((await p.query('select submitted_at from panel_feedback')).rows[0].submitted_at,null)
 }finally{await p.close()}
})
