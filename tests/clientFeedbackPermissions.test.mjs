import test from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import app from '../api/app.js'
import admin from '../api/admin.js'
async function call(handler,action) {
 const req=Readable.from([Buffer.from(JSON.stringify({action}))]);req.method='POST';req.headers={'content-type':'application/json'}
 let status=200,body=''
 const res={setHeader(){},writeHead(code){status=code},end(text){body=text||''},get statusCode(){return status},set statusCode(value){status=value}}
 await handler(req,res);return {status,body:JSON.parse(body)}
}
test('anonymous callers cannot create recruiters or email private feedback links',async()=>{
 const recruiter=await call(admin,'create-recruiter');assert.equal(recruiter.status,401)
 const feedback=await call(app,'panel-feedback-email');assert.equal(feedback.status,401)
})
