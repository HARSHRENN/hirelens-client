// Filled means joined, capped at a job's number of openings. Open vacancies remain unfulfilled.
export function positionCounts(jobs, candidates) {
 const joined=new Map()
 for(const c of candidates) if(c.stage==='joined') joined.set(c.jobId,(joined.get(c.jobId)||0)+1)
 let fulfilled=0,notFulfilled=0
 for(const job of jobs){const openings=Number.isFinite(Number(job.openings))?Math.max(0,Math.trunc(Number(job.openings))):1;const filled=Math.min(openings,joined.get(job.id)||0);fulfilled+=filled;notFulfilled+=openings-filled}
 return {positionsFulfilled:fulfilled,positionsNotFulfilled:notFulfilled}
}
