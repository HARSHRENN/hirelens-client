import test from 'node:test'
import assert from 'node:assert/strict'
// No messages leave this test: mock the provider and database at their HTTP boundary.
test('server sends the escaped tracker table in HTML and a matching plain-text alternative',async()=>{
 const before=globalThis.fetch,env={...process.env},sent=[]
 process.env.SUPABASE_URL='https://mock-feedback.example.com';process.env.SUPABASE_ANON_KEY='mock-anon';process.env.SUPABASE_SERVICE_ROLE_KEY='mock-service'
 process.env.RESEND_API_KEY='mock-resend';process.env.EMAIL_FROM='HireLens <test@example.com>'
 globalThis.fetch=async(input,init)=>{
  const url=String(input?.url||input)
  if(url==='https://api.resend.com/emails'){sent.push(JSON.parse(init.body));return new Response(JSON.stringify({id:'mock-message'}),{status:200})}
  if(url.includes('/platform_settings'))return new Response(JSON.stringify({data:{emailDailyLimit:0,emailMonthlyLimit:0,userEmailDailyLimit:0}}),{status:200,headers:{'content-type':'application/json'}})
  if(url.includes('/usage_log'))return new Response(null,{status:200,headers:{'content-range':'0-0/0'}})
  throw new Error('Unexpected test request '+url)
 }
 try{
  const {sendMail}=await import('../api/_lib/mail.js')
  await sendMail({kind:'email:manual',to:'client@example.com',subject:'Selected profiles',text:'Please review these candidates.',table:[['Candidate','Match %'],['<script>unsafe</script>','91']]})
  assert.equal(sent.length,1);assert.ok(sent[0].html.includes('<th'));assert.ok(sent[0].html.includes('&lt;script&gt;'));assert.ok(!sent[0].html.includes('<script>'));assert.ok(sent[0].text.includes('Candidate\tMatch %'));assert.ok(sent[0].text.includes('91'))
 }finally{globalThis.fetch=before;process.env=env}
})
