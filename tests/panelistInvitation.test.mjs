import test from 'node:test'
import assert from 'node:assert/strict'
import {panelistInvitation} from '../api/_lib/panelistInvitation.js'
test('a private panelist invite carries feedback in email and calendar, without candidate or other panelist recipients',()=>{
 const invite=panelistInvitation({candidate:{name:'Test Candidate',email:'candidate@example.com'},job:{title:'Product Owner'},interview:{id:'iv-1',round:'l1',at:Date.UTC(2026,11,1,10),meetLink:'https://meet.google.com/test'},panelist:{id:'p1',name:'Test Panelist',email:'panel@example.com'},url:'https://hirelens.example/feedback#private',organizer:'recruiter@example.com',owner:'owner'})
 assert.equal(invite.to,'panel@example.com');assert.equal(invite.cc,undefined)
 assert.match(invite.text,/feedback#private/);assert.match(invite.text,/No HireLens login/)
 const calendar=Buffer.from(invite.attachments[0].content,'base64').toString().replace(/\r\n /g,'')
 assert.match(calendar,/DESCRIPTION:.*feedback#private/s)
 assert.match(calendar,/ATTENDEE.*panel@example.com/)
 assert.doesNotMatch(calendar,/candidate@example.com/)
 assert.match(calendar,/LOCATION:https:\/\/meet.google.com\/test/)
})
