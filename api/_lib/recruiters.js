import { fail, isEmail } from './http.js'
const RESERVED = new Set(['admin','api','app','login','signup','demo','verify','reset','forgot','u','www','support','help','billing','settings'])
export async function createRecruiter(client, body, {trialDays=7,adminEmails=[]}={}) {
  const email=String(body.email||'').trim().toLowerCase(), username=String(body.username||'').trim().toLowerCase()
  const name=String(body.fullName||'').trim().slice(0,80), company=String(body.company||'').trim().slice(0,100), password=String(body.password||'')
  if(!name || !isEmail(email))fail(400,'Add the recruiter’s name and a valid email.')
  if(adminEmails.includes(email))fail(400,'Use a recruiter email, not an address reserved for a platform admin.')
  if(!/^[a-z0-9][a-z0-9-]{2,29}$/.test(username) || RESERVED.has(username))fail(400,'Use a username of 3–30 lowercase letters, numbers or hyphens.')
  if(password.length<8 || password.length>128)fail(400,'Use a password of 8–128 characters.')
  const {data:existing,error:lookupError}=await client.from('profiles').select('id').eq('username',username).maybeSingle()
  if(lookupError)throw lookupError
  if(existing)fail(409,'That username is already in use.')
  const {data,error}=await client.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:name,username}})
  if(error)fail(/registered|exists|already/i.test(error.message)?409:400,error.message)
  const id=data.user.id
  try {
    const {error:profileError}=await client.from('profiles').insert({id,username,email,full_name:name,company,role:'hr',status:'active',trial_start:new Date().toISOString(),trial_days:trialDays})
    if(profileError)throw profileError
    const {error:configError}=await client.from('docs').insert({owner:id,coll:'config',id:'app',data:{id:'app',companyName:company||name,recruiterName:name}})
    if(configError)throw configError
  } catch(error) {
    // A failed setup must not leave an unusable login or partial workspace.
    await client.auth.admin.deleteUser(id)
    fail(error.code==='23505'?409:500,error.code==='23505'?'That username or email is already in use.':error.message)
  }
  return {id,username,email}
}
