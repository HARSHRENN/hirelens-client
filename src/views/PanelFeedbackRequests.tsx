import { useEffect, useState } from 'react'
import { Button, ErrorBox, Input, useToast } from '../components/ui'
import { api } from '../lib/cloud'
import { copy, mailtoLink } from '../lib/integrations'
import { useMe } from '../lib/me'
import { createDemoFeedbackLink, refreshFeedback } from '../lib/panelFeedback'
import { MODE } from '../lib/runtime'
import { initStore, useStore } from '../lib/store'
import type { Candidate, Interview, PanelFeedback } from '../lib/types'
export function PanelFeedbackRequests({ c, iv }: { c: Candidate; iv: Interview }) {
  const { me } = useMe()
  const demo = MODE() !== 'cloud'
  const panelists = useStore(s => s.panelists)
  const [cloudRows, setRows] = useState<PanelFeedback[]>([])
  const rows = demo ? iv.demoPanelFeedback || [] : cloudRows
  const [now, setNow] = useState(Date.now)
  const [enabled, setEnabled] = useState(demo)
  const [link, setLink] = useState('')
  const [linkFor, setLinkFor] = useState('')
  const [linkEmail,setLinkEmail]=useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const toast = useToast()
  useEffect(() => {
    let active = true
    const load = () => refreshFeedback(c.id).then(data => { if (active) { setRows(data.feedback.filter(f => f.interview_id === iv.id)); setEnabled(data.enabled); setError('') } }).catch(e => { if (active) setError(e.message) })
    if (!demo) load()
    const timer = window.setInterval(() => { setNow(Date.now()); if (!demo) load() }, 10_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [c.id, iv.id, iv.demoPanelFeedback, demo])
  async function request(pid: string) {
    setBusy(pid); setError(''); setLink('')
    try {
      const url = demo ? await createDemoFeedbackLink(c.id, iv.id, pid) : (await api<{ url: string }>('app','panel-feedback-request',{candidateId:c.id,interviewId:iv.id,panelistId:pid})).url
      setLinkFor(rows.find(f => f.panelist_id === pid)?.panelist_name || panelists[pid]?.name || 'this panelist'); setLink(url); toast(await copy(url) ? 'Feedback link copied' : 'Feedback link ready. Copy it below.')
      setLinkEmail(panelists[pid]?.email || '')
      if (!demo) { const data = await refreshFeedback(c.id); setRows(data.feedback.filter(f => f.interview_id === iv.id)) }
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }
  async function revoke(pid: string) {
    setBusy(pid); setError('')
    try {
      await api('app','panel-feedback-revoke',{candidateId:c.id,interviewId:iv.id,panelistId:pid})
      const data = await refreshFeedback(c.id); setRows(data.feedback.filter(f => f.interview_id === iv.id)); setLink(''); toast('Feedback link revoked')
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }
  async function email(pid: string) {
    setBusy(pid);setError('');setLink('')
    try {
      await api('app','panel-feedback-email',{candidateId:c.id,interviewId:iv.id,panelistId:pid})
      toast('Interview and private feedback link emailed to the panelist')
      const data=await refreshFeedback(c.id);setRows(data.feedback.filter(f=>f.interview_id===iv.id))
    } catch(e) {setError((e as Error).message)} finally {setBusy('')}
  }
  const responses = rows.filter(f => f.submitted_at && iv.panelistIds.includes(f.panelist_id))
  return <section className="stack" aria-label="Individual panelist feedback" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
    <div className="row" style={{justifyContent:'space-between'}}><h4>Individual panelist feedback</h4><Button size="sm" variant="ghost" onClick={async()=>{try {if(!demo){const data=await refreshFeedback(c.id);setRows(data.feedback.filter(f=>f.interview_id===iv.id));setEnabled(data.enabled)}await initStore({userId:me?.profile.id});setError('')}catch(e){setError((e as Error).message)}}}>Refresh feedback</Button></div>
    <p className="xs muted">{demo ? 'Preview links work in this browser only.' : 'Private links expire after 7 days. Share each link only with its named panelist; anyone holding it can submit. Emailing again or replacing a link invalidates the previous link.'} Submitted responses do not change the candidate’s stage.</p>
    {error && <ErrorBox>{error}</ErrorBox>}
    {!enabled && !demo ? <p className="small muted">Panelist feedback database setup is pending.</p> : !iv.panelistIds.length ? <p className="small muted">Assign panelists when scheduling an interview to request their feedback.</p> : iv.panelistIds.map(pid => {
      const row = rows.find(f => f.panelist_id === pid)
      const status = row?.submitted_at ? 'Submitted' : row?.revoked_at ? 'Revoked' : row && Date.parse(row.expires_at) <= now ? 'Expired' : row ? 'Awaiting feedback' : 'Not requested'
      return <div className="stack" key={pid} style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="small"><b>{row?.panelist_name || panelists[pid]?.name || 'Removed panelist'}</b> · {status}</span>
          {!row?.submitted_at && <div className="row">{!demo && <Button size="sm" variant="ink" disabled={!!busy} busy={busy===pid} onClick={()=>email(pid)}>Email interview & feedback link</Button>}<Button size="sm" disabled={!!busy} busy={busy === pid} onClick={() => request(pid)}>{demo ? 'Create preview link' : row ? 'Replace link' : 'Create feedback link'}</Button>{!demo && row && !row.revoked_at && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => revoke(pid)}>Revoke link</Button>}</div>}
        </div>
        {row?.submitted_at && <div className="stock" style={{ padding: 12 }}><p className="small"><b>{row.rating}/5 · {row.recommendation === 'select' ? 'Shortlist / proceed' : row.recommendation === 'hold' ? 'Hold' : 'Reject'}</b> · {new Date(row.submitted_at).toLocaleString('en-IN')}</p><p className="small" style={{ whiteSpace: 'pre-wrap' }}>{row.comments}</p></div>}
      </div>
    })}
    {link && <div className="stack"><p className="small">Share this link with <b>{linkFor}</b>.</p><Input aria-label="Private panelist feedback link" readOnly value={link} onFocus={e => e.target.select()} /><div className="row"><a className="small" href={link} target="_blank" rel="noreferrer">Open {demo ? 'preview' : 'feedback'} form</a>{!demo && linkEmail && <a className="btn btn--sm" href={mailtoLink(linkEmail,`Interview feedback: ${c.name}`,`Hi ${linkFor},\n\nPlease submit your rating, screening outcome and feedback for ${c.name} using your private link:\n${link}\n\nNo HireLens login is needed. This link accepts one response and expires in 7 days.`)}>Open email draft</a>}</div>{!demo && <p className="xs muted">You can copy this link into your own email if platform email delivery is unavailable. Only share it with {linkFor}.</p>}</div>}
    {!!responses.length && <p className="small muted">{responses.length}/{iv.panelistIds.length} responses · Average rating {(responses.reduce((sum, f) => sum + (f.rating || 0), 0) / responses.length).toFixed(1)}/5 <Button size="sm" variant="ghost" onClick={() => { initStore({ userId: me?.profile.id }).catch(e => setError(e.message)) }}>Refresh workspace</Button></p>}
  </section>
}
