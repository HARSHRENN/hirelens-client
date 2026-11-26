import { api } from './cloud'
import { getState, put } from './store'
import type { PanelFeedback } from './types'
export const DEMO_FEEDBACK_KEY = 'hl-demo-panel-feedback-links'
interface DemoLink { candidateId: string; interviewId: string; panelistId: string; expiresAt: number }
export function demoLinks(): Record<string, DemoLink> { try { return JSON.parse(localStorage.getItem(DEMO_FEEDBACK_KEY) || '{}') } catch { return {} } }
export async function createDemoFeedbackLink(candidateId: string, interviewId: string, panelistId: string) {
  const s = getState(), c = s.candidates[candidateId], iv = c?.interviews?.find(i => i.id === interviewId)
  if (!iv?.panelistIds.includes(panelistId)) throw new Error('Panelist is not assigned to this interview.')
  if (iv.demoPanelFeedback?.some(f => f.panelist_id === panelistId && f.submitted_at)) throw new Error('Feedback has already been submitted.')
  const links = demoLinks()
  for (const [token, link] of Object.entries(links)) if (link.candidateId === candidateId && link.interviewId === interviewId && link.panelistId === panelistId) delete links[token]
  const token = crypto.randomUUID().replaceAll('-', '')
  links[token] = { candidateId, interviewId, panelistId, expiresAt: Date.now() + 7 * 864e5 }
  localStorage.setItem(DEMO_FEEDBACK_KEY, JSON.stringify(links))
  const f: PanelFeedback = { candidate_id: candidateId, interview_id: interviewId, panelist_id: panelistId, panelist_name: s.panelists[panelistId]?.name || 'Demo panelist', requested_at: new Date().toISOString(), expires_at: new Date(links[token]!.expiresAt).toISOString(), revoked_at: null, submitted_at: null, rating: null, recommendation: null, comments: null }
  await put('candidates', { ...c!, interviews: c!.interviews!.map(i => i.id === interviewId ? { ...i, demoPanelFeedback: [...(i.demoPanelFeedback || []).filter(f => f.panelist_id !== panelistId), f] } : i) })
  return `${location.origin}/feedback#demo-${token}`
}
export async function submitDemoFeedback(token: string, rating: number, recommendation: 'select' | 'hold' | 'reject', comments: string) {
  const link = demoLinks()[token], s = getState(), c = s.candidates[link?.candidateId || '']
  if (!link || !c || link.expiresAt <= Date.now()) throw new Error('This demo link is no longer available.')
  const iv = c.interviews?.find(i => i.id === link.interviewId)
  if (!iv || !iv.panelistIds.includes(link.panelistId)) throw new Error('Interview no longer available.')
  if (iv.demoPanelFeedback?.some(f => f.panelist_id === link.panelistId && f.submitted_at)) throw new Error('Feedback has already been submitted.')
  const f: PanelFeedback = { candidate_id: c.id, interview_id: iv.id, panelist_id: link.panelistId, panelist_name: s.panelists[link.panelistId]?.name || 'Demo panelist', requested_at: new Date().toISOString(), expires_at: new Date(link.expiresAt).toISOString(), revoked_at: null, submitted_at: new Date().toISOString(), rating, recommendation, comments }
  await put('candidates', { ...c, interviews: c.interviews!.map(i => i.id === iv.id ? { ...i, demoPanelFeedback: [...(i.demoPanelFeedback || []).filter(f => f.panelist_id !== link.panelistId), f] } : i) })
}
export const refreshFeedback = (candidateId: string) => api<{ enabled: boolean; feedback: PanelFeedback[] }>('app', 'panel-feedback-list', { candidateId })
