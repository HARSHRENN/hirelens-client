// Fictional, read-only cohorts for the demo report. The live calculator is pure:
// it imports no database, credentials, request handlers or network clients.
import { recruiterAnalytics } from '../api/_lib/recruiterAnalytics.js'

export function demoRecruiterAnalytics({ from = 0, to = Date.now(), now = Date.now() } = {}) {
  const day = 864e5
  const today = Math.floor(now / day) * day
  const at = age => today - age * day
  const date = age => new Date(at(age)).toISOString().slice(0, 10)
  const people = [
    { id: 'sample-priya', full_name: 'Priya Shah', email: 'priya.shah@example.com', status: 'active', tech: 'Java' },
    { id: 'sample-rahul', full_name: 'Rahul Sharma', email: 'rahul.sharma@example.com', status: 'active', tech: 'Data' },
    { id: 'sample-aisha', full_name: 'Aisha Khan', email: 'aisha.khan@example.com', status: 'suspended', tech: 'Frontend' },
  ]
  const profiles = people.map((p, index) => ({ ...p, role: 'hr', company: 'Example Recruitment', last_seen: new Date(at(index + 1)).toISOString() }))
  const docs = [], reviews = []
  for (const [index, person] of people.entries()) {
    for (let j = 0; j < 2; j++) {
      const jobId = `${person.id}-job-${j}`
      docs.push({ owner: person.id, coll: 'jobs', id: jobId, data: {
        title: `${person.tech} ${j ? 'Engineer' : 'Developer'}`, tech: person.tech,
        status: j ? 'open' : 'closed', openings: 2, createdAt: at(j ? 9 : 24 + index),
        vacancyCreatedDate: date(j ? 9 : 24 + index), ...(j ? {} : { positionClosedDate: date(4 + index) }),
      } })
      const stages = j ? ['l1', 'l2', 'selected', 'offered', 'hold', 'contacted', 'new', 'rejected'] : ['joined', 'rejected', 'declined', 'rejected']
      for (let i = 0; i < 12 + index * 3; i++) {
        const stage = stages[(i + index) % stages.length]
        const age = j ? 1 + i % 8 : 10 + i % 10
        const interviewed = ['l1', 'l2', 'selected', 'offered', 'joined', 'declined'].includes(stage)
        docs.push({ owner: person.id, coll: 'candidates', id: `${jobId}-candidate-${i}`, data: {
          jobId, stage, createdAt: at(age), updatedAt: at(stage === 'contacted' ? 8 : 1),
          shortlisted: interviewed,
          interviews: interviewed ? Array.from({ length: ['joined', 'offered', 'declined'].includes(stage) ? 3 : 1 }, () => ({})) : [],
        } })
      }
      reviews.push({ recruiter_id: person.id, outcome: j ? 'unsuccessful' : 'successful', created_at: new Date(at(j ? 12 + index : 2 + index)).toISOString() })
    }
  }
  return recruiterAnalytics(profiles, docs, { from, to, reviews })
}
