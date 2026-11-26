import type { Candidate, Interview, Panelist, PanelFeedback } from './types'

export interface PanelStat {
  total: number; done: number; upcoming: number; select: number; reject: number; hold: number; pending: number
  avgRating: number | null
  feedback: { at: number; candidate: string; candidateId: string; round: string; result: Interview['result']; text: string; rating?: number }[]
}

/* Individual responses take priority for their author; existing recruiter-entered feedback stays available for older interviews. */
export function panelStats(cands: Candidate[], from = 0, to = Infinity, responses: PanelFeedback[] = []): Record<string, PanelStat> {
  const out: Record<string, PanelStat> = {}
  const get = (id: string) => (out[id] ||= { total: 0, done: 0, upcoming: 0, select: 0, reject: 0, hold: 0, pending: 0, avgRating: null, feedback: [] })
  const ratings: Record<string, number[]> = {}
  const now = Date.now()
  const submitted = new Map(responses.filter(f => f.submitted_at).map(f => [JSON.stringify([f.candidate_id, f.interview_id, f.panelist_id]), f]))
  for (const c of cands) for (const iv of c.interviews || []) {
    if (iv.at < from || iv.at > to) continue
    for (const pid of iv.panelistIds) {
      const s = get(pid)
      s.total++
      const response = submitted.get(JSON.stringify([c.id, iv.id, pid])) || iv.demoPanelFeedback?.find(f => f.panelist_id === pid && f.submitted_at)
      const result = response?.recommendation || iv.result
      if (iv.at > now && result === 'pending') s.upcoming++
      else if (result === 'pending') s.pending++
      else { s.done++; s[result]++ }
      const by = iv.feedbackBy || iv.panelistIds[0]
      if (response) {
        s.feedback.push({ at: Date.parse(response.submitted_at!), candidate: c.name, candidateId: c.id, round: iv.round, result: response.recommendation!, text: response.comments || '', rating: response.rating || undefined })
        if (response.rating) (ratings[pid] ||= []).push(response.rating)
      } else if (by === pid && (iv.feedback || iv.result !== 'pending')) {
        s.feedback.push({ at: iv.at, candidate: c.name, candidateId: c.id, round: iv.round, result: iv.result, text: iv.feedback || '', rating: iv.rating })
        if (iv.rating) (ratings[pid] ||= []).push(iv.rating)
      }
    }
  }
  for (const [id, r] of Object.entries(ratings)) out[id]!.avgRating = r.reduce((a, b) => a + b, 0) / r.length
  for (const s of Object.values(out)) s.feedback.sort((a, b) => b.at - a.at)
  return out
}

export const panelistName = (p: Record<string, Panelist>, id: string) => p[id]?.name || 'Removed panelist'
