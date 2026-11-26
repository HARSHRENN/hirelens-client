import { useEffect, useState } from 'react'
import { Mark } from '../components/Mark'
import { Button, ErrorBox, Field, Select, Textarea } from '../components/ui'
import { demoLinks, submitDemoFeedback } from '../lib/panelFeedback'
import { getState, initStore } from '../lib/store'
import { setMode } from '../lib/runtime'
interface Context { candidate: string; job: string; panelist: string; round: string; at: number; expiresAt: string; submitted: boolean }
async function publicCall(action: string, body: Record<string, unknown>) {
  const r = await fetch('/api/app', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || 'Unable to open feedback.')
  return data
}
export default function PanelFeedbackPage() {
  const [token, setToken] = useState(() => location.hash.slice(1))
  const demo = token.startsWith('demo-')
  const [context, setContext] = useState<Context | null>(null)
  const [error, setError] = useState('')
  const [rating, setRating] = useState('')
  const [recommendation, setRecommendation] = useState('')
  const [comments, setComments] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const changeLink = () => {
      setContext(null); setError(''); setRating(''); setRecommendation(''); setComments('')
      setToken(location.hash.slice(1))
    }
    window.addEventListener('hashchange', changeLink)
    return () => window.removeEventListener('hashchange', changeLink)
  }, [])
  useEffect(() => {
    document.title = 'Panelist feedback · HireLens'
    const meta = document.createElement('meta'); meta.name = 'referrer'; meta.content = 'no-referrer'; document.head.appendChild(meta)
    let active = true
    async function load() {
      if (!demo) return publicCall('panel-feedback-view', { token })
      setMode('demo'); await initStore()
      const link = demoLinks()[token.slice(5)], s = getState(), c = s.candidates[link?.candidateId || ''], iv = c?.interviews?.find(i => i.id === link?.interviewId)
      if (!link || !c || !iv || link.expiresAt <= Date.now()) throw new Error('This demo link is only available in the browser where it was created.')
      return { candidate: c.name, job: s.jobs[c.jobId]?.title || '', panelist: s.panelists[link.panelistId]?.name || 'Demo panelist', round: iv.round, at: iv.at, expiresAt: new Date(link.expiresAt).toISOString(), submitted: !!iv.demoPanelFeedback?.some(f => f.panelist_id === link.panelistId && f.submitted_at) }
    }
    load().then(data => { if (active) setContext(data) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false; meta.remove() }
  }, [token, demo])
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!rating || !recommendation || comments.trim().length < 5) { setError('Choose a rating and recommendation, and add at least 5 characters of comments.'); return }
    setBusy(true)
    try {
      if (demo) await submitDemoFeedback(token.slice(5), +rating, recommendation as 'select' | 'hold' | 'reject', comments.trim())
      else await publicCall('panel-feedback-submit', { token, rating: +rating, recommendation, comments: comments.trim() })
      setContext(c => c ? { ...c, submitted: true } : c)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <main style={{ maxWidth: 660, margin: '40px auto', padding: '0 20px' }} className="stack">
    <div className="row"><Mark /><b>HireLens · Panelist feedback</b></div>
    {demo && <p className="small" role="note">Demo only. This form works in this browser and does not submit feedback to the client database.</p>}
    {error && <ErrorBox>{error}</ErrorBox>}
    {!context ? !error && <p>Opening interview…</p> : context.submitted ? <section className="stock" style={{ padding: 24 }}><h1>Feedback received</h1><p>Thank you, {context.panelist}. Your response for {context.candidate} has been recorded. You can close this page.</p></section> : <>
      <section className="stock" style={{ padding: 24 }}><h1>{context.candidate}</h1><p>{context.job} · {context.round.toUpperCase()} · {new Date(context.at).toLocaleString('en-IN')}</p><p className="small">Feedback from <b>{context.panelist}</b></p></section>
      <form onSubmit={submit} className="stack">
        <Field label="Overall rating"><Select required value={rating} onChange={e => setRating(e.target.value)} options={[{ value: '', label: 'Choose a rating' }, ...[1,2,3,4,5].map(v => ({ value: String(v), label: `${v} / 5` }))]} /></Field>
        <Field label="Recommendation"><Select required value={recommendation} onChange={e => setRecommendation(e.target.value)} options={[{ value: '', label: 'Choose a recommendation' }, { value: 'select', label: 'Shortlist / proceed' }, { value: 'hold', label: 'Hold' }, { value: 'reject', label: 'Reject' }]} /></Field>
        <Field label="Feedback comments" hint="Strengths, gaps, examples and suggested next steps. 5–5000 characters."><Textarea required minLength={5} maxLength={5000} rows={6} value={comments} onChange={e => setComments(e.target.value)} /></Field>
        <p className="small muted">Your response will be visible to the recruiter and admin. This link accepts one submission and expires {new Date(context.expiresAt).toLocaleDateString('en-IN')}. Check your feedback before submitting.</p>
        <Button variant="ink" type="submit" busy={busy}>Submit feedback</Button>
      </form>
    </>}
  </main>
}
