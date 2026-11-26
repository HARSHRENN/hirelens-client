import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { JOB_DATES_SQL } from '../api/_lib/jobDatesSchema.js'
import { ASSIGNMENTS_SQL } from '../api/_lib/assignmentsSchema.js'
const admin='10000000-0000-0000-0000-000000000001', a='10000000-0000-0000-0000-000000000002', b='10000000-0000-0000-0000-000000000003', suspended='10000000-0000-0000-0000-000000000004'
async function setup() {
 const pg=new PGlite()
 await pg.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create table profiles(id uuid primary key,role text,status text);
 create table docs(owner uuid,coll text,id text,data jsonb,updated_at timestamptz default now(),primary key(owner,coll,id));
 alter table docs enable row level security; grant select,insert,update,delete on docs to authenticated;
 create function is_active_user() returns boolean language sql stable security definer as $$ select exists(select 1 from profiles where id=auth.uid() and status='active') $$;
 insert into profiles values ('${admin}','admin','active'),('${a}','hr','active'),('${b}','hr','active'),('${suspended}','hr','suspended');
 insert into docs(owner,coll,id,data) values('${admin}','jobs','j1','{"title":"Product Owner"}'),('${admin}','candidates','c1','{"jobId":"j1"}'),('${admin}','jobs','j2','{}'),('${admin}','candidates','c2','{"jobId":"j2"}');`)
 await pg.exec(ASSIGNMENTS_SQL)
 return pg
}
const assign=(pg,who,version=0,by=admin)=>pg.query('select * from assign_job($1,$2,$3,$4)',['j1',who,by,version])
async function as(pg,id,fn){await pg.exec(`set role authenticated; set request.jwt.claim.sub='${id}'`);try{return await fn()}finally{await pg.exec('reset role')}}
test('assign, duplicate prevention, atomic reassignment and immediate RLS revocation',async()=>{
 const pg=await setup()
 try {
  await assign(pg,a)
  assert.equal((await pg.query('select * from job_assignments')).rows.length,1)
  assert.equal((await pg.query("select owner from docs where id='c1'")).rows[0].owner,a)
  await assert.rejects(assign(pg,a,1),/already assigned/)
  await assert.rejects(assign(pg,b,0),/changed/)
  await assert.rejects(assign(pg,suspended,1),/active recruiter/)
  await assert.rejects(assign(pg,b,1,a),/Admin/)
  await as(pg,a,async()=>{
    assert.deepEqual((await pg.query('select id from docs order by id')).rows.map(r=>r.id),['c1','j1'])
    await pg.exec("update docs set data=data || '{\"status\":\"open\"}' where id='j1'")
    await assert.rejects(pg.exec(`insert into docs values('${a}','jobs','fake','{}',now())`),/row-level/)
    await assert.rejects(pg.exec(`update job_assignments set recruiter_id='${b}'`),/permission denied/)
    await assert.rejects(assign(pg,b,1),/permission denied/)
  })
  await assign(pg,b,1)
  await as(pg,a,async()=>{
    assert.equal((await pg.query('select * from docs')).rows.length,0)
    assert.equal((await pg.query("update docs set data='{}' where id='j1' returning *")).rows.length,0)
    await assert.rejects(pg.exec(`insert into docs values('${a}','candidates','escape','{"jobId":"j1"}',now())`),/row-level/)
  })
  await as(pg,b,async()=>assert.equal((await pg.query('select * from docs')).rows.length,2))
  await as(pg,admin,async()=>assert.equal((await pg.query('select * from docs')).rows.length,4))
  await as(pg,suspended,async()=>assert.equal((await pg.query('select * from docs')).rows.length,0))
  assert.equal((await pg.query('select * from job_assignments')).rows[0].version,2)
 } finally { await pg.close() }
})
test('job deletion cleans assignment and migration is repeatable',async()=>{
 const pg=await setup()
 try { await assign(pg,a); await pg.exec(ASSIGNMENTS_SQL); await pg.exec("delete from docs where coll='jobs' and id='j1'"); assert.equal((await pg.query('select * from job_assignments')).rows.length,0) } finally{await pg.close()}
})

test('database enforces automatic vacancy dates and admin-only close-date corrections',async()=>{
 const pg=await setup()
 try {
  await pg.exec(JOB_DATES_SQL)
  await as(pg,admin,async()=>{await pg.query('insert into docs(owner,coll,id,data) values($1,$2,$3,$4)',[admin,'jobs','dated', {createdAt:1,status:'open',vacancyCreatedDate:'2000-01-01'}])})
  const read=async()=> (await pg.query("select data from docs where coll='jobs' and id='dated'")).rows[0].data
  let data=await read()
  assert.notEqual(data.vacancyCreatedDate,'2000-01-01')
  await pg.query('select * from assign_job($1,$2,$3,$4)',['dated',a,admin,0])
  await as(pg,a,async()=>{
   await pg.exec(`update docs set data=data || '{"status":"closed","positionClosedDate":"2099-01-01"}' where id='dated'`)
   const first=(await pg.query("select data from docs where id='dated'")).rows[0].data
   assert.notEqual(first.positionClosedDate,'2099-01-01')
   await assert.rejects(pg.exec(`update docs set data=data || '{"positionClosedDate":"2099-01-01"}' where id='dated'`),/Only the admin/)
  })
  await as(pg,admin,async()=>await pg.exec(`update docs set data=data || '{"positionClosedDate":"2099-01-01"}' where id='dated'`))
  assert.equal((await read()).positionClosedDate,'2099-01-01')
  await as(pg,admin,async()=>await pg.exec(`update docs set data=data || '{"status":"open"}' where id='dated'`))
  assert.equal((await read()).positionClosedDate,undefined)
  assert.equal((await read()).createdAt,data.createdAt)
 } finally{await pg.close()}
})
