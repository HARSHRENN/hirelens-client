import test from 'node:test'
import assert from 'node:assert/strict'
import { demoRecruiterAnalytics } from '../shared/recruiterDemo.js'
const now = Date.UTC(2026, 10, 23, 12)
const day = 864e5

test('sample report shows distinct fictional recruiters and consistent position and outcome counts', () => {
  const report = demoRecruiterAnalytics({ now, to: now })
  assert.equal(report.rows.length, 3)
  assert.deepEqual(report.rows.map(r => r.candidates), [24, 30, 36])
  assert.equal(new Set(report.rows.map(r => r.name)).size, 3)
  for (const r of report.rows) {
    assert.match(r.email, /@example\.com$/)
    assert.equal(r.jobs, 2)
    assert.equal(r.positionsFulfilled, 2)
    assert.equal(r.positionsNotFulfilled, 2)
    assert.equal(r.tatSamples, 1)
    assert.equal(r.tatTotal, 20)
    assert.equal(r.successfulAssignments, 1)
    assert.equal(r.unsuccessfulAssignments, 1)
    assert.equal(Object.values(r.technologies).reduce((n, x) => n + x, 0), r.candidates)
    assert.equal(Object.values(r.trend).reduce((n, x) => n + x, 0), r.candidates)
  }
})

test('demo date filters recompute cohort, outcomes and details without changing the sample fixtures', () => {
  const all = demoRecruiterAnalytics({ now, to: now })
  const recent = demoRecruiterAnalytics({ now, from: now - 7 * day, to: now })
  for (const [i, r] of recent.rows.entries()) {
    assert.ok(r.candidates > 0 && r.candidates < all.rows[i].candidates)
    assert.equal(r.successfulAssignments, 1)
    assert.equal(r.unsuccessfulAssignments, 0)
    assert.equal(r.jobs, 0)
    assert.equal(r.tatSamples, 0)
  }
  assert.ok(demoRecruiterAnalytics({ now, from: now + day, to: now + 2 * day }).rows.every(r => r.candidates === 0 && r.successfulAssignments === 0))
  assert.deepEqual(demoRecruiterAnalytics({ now, to: now }).rows, all.rows)
})
