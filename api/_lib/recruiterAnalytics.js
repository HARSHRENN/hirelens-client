import { positionCounts } from '../../shared/positions.js'
// Cohort analytics: current outcomes for candidates added within the selected dates.
// This intentionally does not guess historical stage dates or time-to-hire.
export function recruiterAnalytics(profiles, docs, { from = 0, to = Date.now(), reviews = [] } = {}) {
  const counts = () => ({ successfulAssignments: 0, unsuccessfulAssignments: 0, jobs: 0, openJobs: 0, closedJobs: 0, tatTotal: 0, tatSamples: 0, candidates: 0, shortlisted: 0, interviewed: 0, interviews: 0, selected: 0, offered: 0, joined: 0, declined: 0, rejected: 0, hold: 0, pending: 0, stale: 0 });
  const rows = new Map(profiles.filter(p => p.role !== 'admin').map(p => [p.id, {
    id: p.id, name: p.full_name || p.username, email: p.email, company: p.company,
    status: p.status, lastSeen: p.last_seen, ...counts(), trend: {}, technologies: {},
  }]));
  const now = Date.now();
  const inside = t => Number.isFinite(Number(t)) && Number(t) >= from && Number(t) <= to;
  for (const doc of docs) {
    const row = rows.get(doc.owner), d = doc.data || {};
    if (!row || !inside(d.createdAt)) continue;
    if (doc.coll === 'jobs') {
      row.jobs++;
      if (d.status === 'open') row.openJobs++;
      if (d.status === 'closed') {
        row.closedJobs++;
        const created = d.vacancyCreatedDate || (Number.isFinite(Number(d.createdAt)) ? new Date(Number(d.createdAt) + 19800000).toISOString().slice(0,10) : '');
        const days = (Date.parse(d.positionClosedDate) - Date.parse(created)) / 864e5;
        if (Number.isFinite(days) && days >= 0) { row.tatTotal += Math.round(days); row.tatSamples++; }
      }
      continue;
    }
    if (doc.coll !== 'candidates') continue;
    row.candidates++;
    const day = new Date(Number(d.createdAt)).toISOString().slice(0, 10);
    row.trend[day] = (row.trend[day] || 0) + 1;
    if (d.shortlisted && !['hold','rejected'].includes(d.stage)) row.shortlisted++;
    const interviews = Array.isArray(d.interviews) ? d.interviews : [];
    row.interviews += interviews.length;
    if (interviews.length || d.interviewAt) row.interviewed++;
    if (['selected', 'offered', 'joined', 'declined'].includes(d.stage)) row.selected++;
    if (['offered', 'joined', 'declined'].includes(d.stage)) row.offered++;
    if (['joined', 'declined', 'rejected', 'hold'].includes(d.stage)) row[d.stage]++;
    if (!['joined', 'declined', 'rejected'].includes(d.stage)) {
      row.pending++;
      if (now - Number(d.updatedAt || d.createdAt) > 7 * 864e5) row.stale++;
    }
  }
  // Job technologies use the candidate cohort, including jobs created before the period.
  const jobs = new Map(docs.filter(d => d.coll === 'jobs').map(d => [`${d.owner}/${d.id}`, d.data]));
  for (const doc of docs) {
    const row = rows.get(doc.owner);
    if (!row || doc.coll !== 'candidates' || !inside(doc.data?.createdAt)) continue;
    const tech = jobs.get(`${doc.owner}/${doc.data.jobId}`)?.tech || 'Unassigned';
    row.technologies[tech] = (row.technologies[tech] || 0) + 1;
  }
  const positionJobs=new Map(),positionCandidates=new Map();
  for(const doc of docs){
    if(!rows.has(doc.owner))continue;
    if(doc.coll==='jobs'&&inside(doc.data?.createdAt)){if(!positionJobs.has(doc.owner))positionJobs.set(doc.owner,[]);positionJobs.get(doc.owner).push({...doc.data,id:doc.id});}
    if(doc.coll==='candidates'){if(!positionCandidates.has(doc.owner))positionCandidates.set(doc.owner,[]);positionCandidates.get(doc.owner).push(doc.data);}
  }
  for(const row of rows.values())Object.assign(row,positionCounts(positionJobs.get(row.id)||[],positionCandidates.get(row.id)||[]));
  for(const review of reviews){const row=rows.get(review.recruiter_id);if(row&&inside(Date.parse(review.created_at))){if(review.outcome==='successful')row.successfulAssignments++;else if(review.outcome==='unsuccessful')row.unsuccessfulAssignments++;}}
  return { rows: [...rows.values()], from, to, generatedAt: now };
}
