import test from 'node:test'
import assert from 'node:assert/strict'
import { recruiterAnalytics } from '../api/_lib/recruiterAnalytics.js'
const profiles = [{ id: 'a', role: 'hr', full_name: 'A' }, { id: 'b', role: 'hr', full_name: 'B' }, { id: 'admin', role: 'admin' }]
const doc = (owner, coll, id, data) => ({ owner, coll, id, data })
test('isolates recruiter workspaces and excludes administrators and other cohorts', () => {
  const docs = [doc('a', 'jobs', 'j', { createdAt: 1, tech: 'Java', status: 'open' }), doc('b', 'jobs', 'j', { createdAt: 1, tech: 'Python' }), doc('a', 'candidates', 'c', { jobId: 'j', createdAt: 10, stage: 'joined', shortlisted: true, interviews: [{}, {}] }), doc('b', 'candidates', 'd', { jobId: 'j', createdAt: 20, stage: 'hold' }), doc('a', 'candidates', 'old', { createdAt: 9 }), doc('admin', 'candidates', 'admin', { createdAt: 10 })]
  const { rows } = recruiterAnalytics(profiles, docs, { from: 10, to: 20 })
  assert.equal(rows.length, 2)
  const [a, b] = rows
  assert.equal(a.candidates, 1); assert.equal(a.jobs, 0)
  assert.equal(a.selected, 1); assert.equal(a.offered, 1); assert.equal(a.joined, 1)
  assert.equal(a.interviewed, 1); assert.equal(a.interviews, 2)
  assert.deepEqual(a.technologies, { Java: 1 }); assert.deepEqual(b.technologies, { Python: 1 })
  assert.equal(b.hold, 1); assert.equal(b.joined, 0)
})
test('counts offer declines, follow-up age, legacy interview date and empty recruiters', () => {
  const now = Date.now()
  const { rows } = recruiterAnalytics(profiles, [doc('a', 'candidates', '1', { createdAt: now - 10 * 864e5, stage: 'declined' }), doc('a', 'candidates', '2', { createdAt: now - 9 * 864e5, stage: 'contacted', interviewAt: now }), doc('a', 'candidates', '3', { createdAt: now - 9 * 864e5, updatedAt: now, stage: 'new' })])
  assert.equal(rows[0].offered, 1); assert.equal(rows[0].declined, 1)
  assert.equal(rows[0].pending, 2); assert.equal(rows[0].stale, 1); assert.equal(rows[0].interviewed, 1)
  assert.equal(rows[1].candidates, 0); assert.deepEqual(rows[1].trend, {})
})
