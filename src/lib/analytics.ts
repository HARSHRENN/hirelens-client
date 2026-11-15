import { getStages, type Candidate, type Interview, type Panelist, type Recruiter } from './types'

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

export interface RecStat { id: string; name: string; screened: number; shortlisted: number; interviewing: number; selected: number; rejected: number; hold: number; offered: number; joined: number; declined: number; avgMatch: number | null }

export function recruiterStats(cands: Candidate[], recruiters: Recruiter[], from = 0, to = Infinity): RecStat[] {
  const rows: RecStat[] = [{ id: 'admin', name: 'Super admin' }, ...recruiters].map((r) => ({ id: r.id, name: r.name, screened: 0, shortlisted: 0, interviewing: 0, selected: 0, rejected: 0, hold: 0, offered: 0, joined: 0, declined: 0, avgMatch: null }))
  const by = Object.fromEntries(rows.map((r) => [r.id, r]))
  const sums: Record<string, number[]> = {}
  const levelIds = new Set(getStages().filter((s) => s.kind === 'level').map((s) => s.id))
  for (const c of cands) {
    if (c.createdAt < from || c.createdAt > to) continue
    const r = by[c.ownerId || 'admin'] || by.admin!
    r.screened++
    if (c.shortlisted) r.shortlisted++
    if (levelIds.has(c.stage)) r.interviewing++
    // later outcomes imply the earlier ones: an offered or joined candidate was selected first
    if (['selected', 'offered', 'joined', 'declined'].includes(c.stage)) r.selected++
    if (['offered', 'joined', 'declined'].includes(c.stage)) r.offered++
    if (c.stage === 'joined') r.joined++
    if (c.stage === 'declined') r.declined++
    if (c.stage === 'rejected') r.rejected++
    if (c.stage === 'hold') r.hold++
    if (c.match) (sums[r.id] ||= []).push(c.match.score)
  }
  for (const r of rows) { const s = sums[r.id]; r.avgMatch = s?.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null }
  return rows.filter((r) => r.id !== 'admin' || r.screened > 0)
}

export const panelistName = (p: Record<string, Panelist>, id: string) => p[id]?.name || 'Removed panelist'
