import type { Candidate, Interview, Panelist } from './types'

export interface PanelStat {
  total: number; done: number; upcoming: number; select: number; reject: number; hold: number; pending: number
  avgRating: number | null
  feedback: { at: number; candidate: string; candidateId: string; round: string; result: Interview['result']; text: string; rating?: number }[]
}

/* An interview counts toward every panelist on it; feedback is credited to whoever gave it, or the first panelist. */
export function panelStats(cands: Candidate[], from = 0, to = Infinity): Record<string, PanelStat> {
  const out: Record<string, PanelStat> = {}
  const get = (id: string) => (out[id] ||= { total: 0, done: 0, upcoming: 0, select: 0, reject: 0, hold: 0, pending: 0, avgRating: null, feedback: [] })
  const ratings: Record<string, number[]> = {}
  const now = Date.now()
  for (const c of cands) for (const iv of c.interviews || []) {
    if (iv.at < from || iv.at > to) continue
    for (const pid of iv.panelistIds) {
      const s = get(pid)
      s.total++
      if (iv.at > now && iv.result === 'pending') s.upcoming++
      else if (iv.result === 'pending') s.pending++
      else { s.done++; s[iv.result]++ }
      const by = iv.feedbackBy || iv.panelistIds[0]
      if (by === pid && (iv.feedback || iv.result !== 'pending')) {
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
