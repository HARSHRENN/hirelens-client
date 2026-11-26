import test from 'node:test'
import assert from 'node:assert/strict'
import {createRecruiter} from '../api/_lib/recruiters.js'
const body={fullName:'Demo Recruiter',email:'RECRUITER@example.com',username:'demo-recruiter',password:'test-password-only',role:'admin'}
function fake({existing=false,profileError=null,configError=null,authError=null}={}) {
 const writes=[],created=[],deleted=[]
 return {writes,created,deleted,auth:{admin:{createUser:async data=>{created.push(data);return {data:{user:{id:'new-id'}},error:authError}},deleteUser:async id=>{deleted.push(id);return {error:null}}}},from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:existing?{id:'existing'}:null,error:null})})}),insert:async row=>{writes.push({table,row});return {error:table==='profiles'?profileError:configError}}})}
}
test('admin-provisioned recruiter receives a login and a restricted hr workspace, with configured trial',async()=>{
 const db=fake();const result=await createRecruiter(db,body,{trialDays:14})
 assert.equal(result.email,'recruiter@example.com');assert.equal(result.password,undefined)
 assert.equal(db.created[0].email_confirm,true)
 assert.equal(db.writes[0].row.role,'hr');assert.equal(db.writes[0].row.status,'active');assert.equal(db.writes[0].row.trial_days,14)
 assert.equal(db.writes[1].row.owner,'new-id');assert.equal(db.writes[1].row.coll,'config')
})
test('duplicates, bad input and reserved admin emails do not create an account',async()=>{
 for(const b of [{...body,username:'admin'},{...body,password:'short'},{...body,email:'invalid'}]) {
  const db=fake();await assert.rejects(createRecruiter(db,b));assert.equal(db.created.length,0)
 }
 const db=fake({existing:true});await assert.rejects(createRecruiter(db,body),/already in use/);assert.equal(db.created.length,0)
 const reserved=fake();await assert.rejects(createRecruiter(reserved,body,{adminEmails:['recruiter@example.com']}),/reserved/);assert.equal(reserved.created.length,0)
 const duplicate=fake({authError:{message:'User already registered'}});await assert.rejects(createRecruiter(duplicate,body),/already registered/);assert.equal(duplicate.writes.length,0)
})
test('failed workspace setup rolls back its auth account',async()=>{
 for(const errors of [{profileError:{code:'23505',message:'duplicate'}},{configError:{message:'write failed'}}]){
  const db=fake(errors);await assert.rejects(createRecruiter(db,body));assert.deepEqual(db.deleted,['new-id'])
 }
})
