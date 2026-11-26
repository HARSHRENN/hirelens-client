import test from 'node:test'
import assert from 'node:assert/strict'
import { panelStats } from '../src/lib/analytics.ts'
const c={id:'c',name:'Candidate',interviews:[{id:'iv',at:1,round:'l1',panelistIds:['p1','p2'],result:'select',feedbackBy:'p1',feedback:'Legacy overall feedback',rating:2}]}
const response=(pid,rating,recommendation)=>({candidate_id:'c',interview_id:'iv',panelist_id:pid,panelist_name:pid,submitted_at:'2026-11-20T00:00:00Z',rating,recommendation,comments:'Individual response'})
test('panelist analytics attributes independent decisions and ratings without duplicating legacy feedback',()=>{
 const stats=panelStats([c],0,Infinity,[response('p1',5,'select'),response('p2',3,'hold')])
 assert.equal(stats.p1.total,1);assert.equal(stats.p1.select,1);assert.equal(stats.p1.avgRating,5);assert.equal(stats.p1.feedback.length,1)
 assert.equal(stats.p2.hold,1);assert.equal(stats.p2.select,0);assert.equal(stats.p2.avgRating,3)
 assert.equal(c.interviews[0].result,'select')
 assert.equal(panelStats([c]).p1.avgRating,2)
 assert.deepEqual(panelStats([c],2),{})
 const demo=structuredClone(c);demo.interviews[0].demoPanelFeedback=[response('p2',4,'reject')]
 assert.equal(panelStats([demo]).p2.reject,1)
})
