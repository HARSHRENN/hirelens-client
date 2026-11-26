import test from 'node:test'
import assert from 'node:assert/strict'
import { editableTemplate,renderTemplate,validMessageLink,trackerHtml,trackerText } from '../shared/communication.js'
import {positionCounts} from '../shared/positions.js'
import {recruiterAnalytics} from '../api/_lib/recruiterAnalytics.js'
test('legacy interview templates become editable messages with an optional separate link',()=>{
 const t={subject:'Interview: {{role}}',body:'Hi {{name}},\n\nJoin the interview.\nGoogle Meet: {{meetLink}}\n\nRegards, {{recruiter}}'}
 const edit=editableTemplate(t)
 assert.ok(!edit.body.includes('meetLink'));assert.equal(edit.link,'{{meetLink}}')
 const vars={name:'Asha',role:'Engineer',recruiter:'Riya',meetLink:'https://meet.example.com/interview'}
 assert.equal(renderTemplate(t,vars).body,renderTemplate(edit,vars).body)
 const edited={...edit,body:'Hello {{fullName}}, the edited message is ready.',link:''}
 assert.deepEqual(renderTemplate(edited,{fullName:'Asha Example'}),{subject:'Interview:',body:'Hello Asha Example, the edited message is ready.',link:''})
 assert.equal(renderTemplate({...edited,link:'https://example.com/apply'},vars).body.endsWith('https://example.com/apply'),true)
 assert.equal(renderTemplate(t,{...vars,meetLink:''}).body.includes('Google Meet:'),false)
 assert.equal(t.body.includes('Google Meet:'),true)
})
test('optional links exclude unsafe protocols and tracker HTML escapes candidate-controlled markup',()=>{
 for(const url of ['','https://example.com/a?x=1&y=2','{{meetLink}}'])assert.equal(validMessageLink(url),true)
 for(const url of ['javascript:alert(1)','data:text/html,bad','not-a-url'])assert.equal(validMessageLink(url),false)
 const rows=[['Candidate','Match %','Current CTC'],['<img src=x onerror=alert(1)>','83','18 & 20']]
 assert.ok(trackerHtml(rows).includes('&lt;img'));assert.ok(!trackerHtml(rows).includes('<img'));assert.ok(trackerHtml(rows).includes('18 &amp; 20'))
 assert.ok(trackerText(rows).includes('83\t18 & 20'))
 assert.ok(!renderTemplate({body:'Hello',link:'javascript:alert(1)'}).body.includes('javascript'))
})
test('position fulfilment respects openings, joins, cohort jobs and manual outcome reversals',()=>{
 const jobs=[{id:'j',openings:2},{id:'j2',openings:1}],candidates=[{jobId:'j',stage:'joined'},{jobId:'j',stage:'offered'},{jobId:'missing',stage:'joined'}]
 assert.deepEqual(positionCounts(jobs,candidates),{positionsFulfilled:1,positionsNotFulfilled:2})
 candidates[0].stage='rejected';assert.equal(positionCounts(jobs,candidates).positionsFulfilled,0)
 assert.deepEqual(positionCounts([{id:'j',openings:1}],[{jobId:'j',stage:'joined'},{jobId:'j',stage:'joined'}]),{positionsFulfilled:1,positionsNotFulfilled:0})
 const docs=[{owner:'a',coll:'jobs',id:'j',data:{createdAt:20,openings:2}},{owner:'a',coll:'candidates',id:'c',data:{createdAt:1,jobId:'j',stage:'joined'}},{owner:'b',coll:'candidates',id:'other',data:{createdAt:20,jobId:'j',stage:'joined'}}]
 const rows=recruiterAnalytics([{id:'a',role:'hr'},{id:'b',role:'hr'}],docs,{from:10,to:30}).rows
 assert.equal(rows[0].positionsFulfilled,1);assert.equal(rows[0].positionsNotFulfilled,1);assert.equal(rows[1].positionsFulfilled,0)
})

test('inline interview links preserve the rest of a WhatsApp reminder',()=>{const r=renderTemplate({body:'Hi {{name}}, your {{role}} interview is today. Meet link: {{meetLink}}. All the best!'},{name:'Asha',role:'Java',meetLink:'https://example.com/meet'});assert.ok(r.body.startsWith('Hi Asha, your Java interview is today.'));assert.ok(r.body.includes('All the best!'));assert.ok(r.body.endsWith('https://example.com/meet'))})
