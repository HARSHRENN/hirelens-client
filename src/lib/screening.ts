import type { Candidate } from './types'
export function screeningRemark(c: Candidate, round: string): 'Shortlisted' | 'Rejected' | 'Hold' | 'Pending feedback' {
  const feedback = [...(c.interviews || [])].filter(i => i.round === round).sort((a, b) => b.at - a.at)[0]
  if (feedback?.result === 'reject') return 'Rejected'
  if (feedback?.result === 'select') return 'Shortlisted'
  if (feedback?.result === 'hold') return 'Hold'
  if (feedback) return 'Pending feedback'
  return c.shortlisted ? 'Shortlisted' : 'Pending feedback'
}
export const matchesProfileFilter = (c: Candidate, filter: string) => filter === 'all' || (filter === 'short' ? c.shortlisted && !['hold', 'rejected'].includes(c.stage) : c.stage === filter)
