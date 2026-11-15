import { Copy, Mail, MessageCircle, Pause, Send, Star, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button, Dialog, Drawer, Empty, Field, Groove, Input, LinkButton, MatchCard, Select, StageTag, Tabs, Textarea, useToast } from '../components/ui'
import { geocode, km, mapsLink } from '../lib/geo'
import { canServerSend, candidateVars, copy, gmailLink, sendEmail, waLink } from '../lib/integrations'
import { companiesCount, rescore, selfMatch } from '../lib/match'
import { getState, put, remove, useStages, useStore } from '../lib/store'
import { stageLabel, type Candidate, type Remark, type Stage } from '../lib/types'
import { EmploymentEditor, EmploymentTimeline, PanelInterviews, ResumeFiles, SelfRating } from './CandidateExtras'
import { ago, fill, fmtDays, fmtKm, fmtLpa, fmtYrs, uid } from '../lib/util'

type Tab = 'overview' | 'contact' | 'interview' | 'self' | 'notes' | 'resume'

const remark = (text: string, kind: Remark['kind']): Remark => ({ id: uid('r'), at: Date.now(), text, kind })

export function CandidateDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const c = useStore((s) => s.candidates[id])
  const job = useStore((s) => (c ? s.jobs[c.jobId] : undefined))
  const [tab, setTab] = useState<Tab>('overview')
  const [confirm, setConfirm] = useState(false)
  const toast = useToast()
  const STAGES = useStages()

  if (!c) return <Drawer title="Profile" onClose={onClose}><Empty title="This profile was removed">Someone on your team may have deleted it.</Empty></Drawer>

  const save = (p: Partial<Candidate>, note?: Remark) => put('candidates', { ...c, ...p, remarks: note ? [...c.remarks, note] : (p.remarks ?? c.remarks) })
  const setStage = (s: Stage) => s !== c.stage && save({ stage: s }, remark(`Moved to ${stageLabel(s)}`, 'stage'))

  return <Drawer onClose={onClose}
    title={<span className="stack" style={{ gap: 0 }}><span>{c.name || 'Unnamed'}</span><span className="small muted" style={{ fontWeight: 400, letterSpacing: 0 }}>{job?.title || 'No job'}{c.currentRole ? `, now ${c.currentRole}${c.currentCompany ? ' at ' + c.currentCompany : ''}` : ''}</span></span>}
    actions={<>
      <Button size="sm" variant={c.shortlisted ? 'ink' : 'card'} aria-pressed={c.shortlisted} onClick={() => save({ shortlisted: !c.shortlisted, stage: !c.shortlisted && (c.stage === 'rejected' || c.stage === 'hold') ? 'contacted' : c.stage }, remark(c.shortlisted ? 'Removed from shortlist' : 'Shortlisted', 'note'))}><Star size={14} />{c.shortlisted ? 'Shortlisted' : 'Shortlist'}</Button>
      <Button size="sm" variant={c.stage === 'hold' ? 'ink' : 'card'} aria-pressed={c.stage === 'hold'} onClick={() => setStage(c.stage === 'hold' ? 'contacted' : 'hold')}><Pause size={14} />Hold</Button>
      <Button size="sm" variant={c.stage === 'rejected' ? 'ink' : 'card'} aria-pressed={c.stage === 'rejected'} onClick={() => c.stage === 'rejected' ? setStage('contacted') : save({ stage: 'rejected', shortlisted: false }, remark('Moved to Rejected', 'stage'))}><X size={14} />Reject</Button>
      <div style={{ width: 160 }}><Select aria-label="Stage or level" value={c.stage} onChange={(e) => setStage(e.target.value as Stage)} options={STAGES.map((s) => ({ value: s.id, label: s.label }))} /></div>
    </>}>
    <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'contact', label: 'Message' }, { id: 'interview', label: `Interviews (${(c.interviews || []).length})` }, { id: 'self', label: `Self rating${selfMatch(c, job) != null ? ` ${selfMatch(c, job)}%` : ''}` }, { id: 'notes', label: `Remarks (${c.remarks.length})` }, { id: 'resume', label: 'Resume' }]} />

    {tab === 'overview' && <Overview c={c} />}
    {tab === 'contact' && <Contact c={c} onSent={(kind, text) => save({ stage: c.stage === 'new' ? 'contacted' : c.stage }, remark(text, kind))} />}
    {tab === 'interview' && <PanelInterviews c={c} />}
    {tab === 'self' && <SelfRating c={c} />}
    {tab === 'notes' && <Notes c={c} />}
    {tab === 'resume' && <section className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}><span className="small muted">{c.fileName}{c.fileKind ? `, ${c.fileKind}` : ''}</span><Button size="sm" variant="ghost" onClick={async () => toast((await copy(c.resumeText)) ? 'Resume text copied' : 'Copy blocked here')}><Copy size={14} />Copy text</Button></div>
      <ResumeFiles c={c} />
      <div className="resume stock">{c.resumeText || 'No text was extracted.'}</div>
    </section>}

    <div><Button variant="danger" size="sm" onClick={() => setConfirm(true)}><Trash2 size={14} />Delete profile</Button></div>
    {confirm && <Dialog title="Delete this profile?" onClose={() => setConfirm(false)} footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Keep it</Button><Button variant="ink" onClick={async () => { await remove('candidates', c.id); toast('Profile deleted'); onClose() }}>Delete</Button></>}>
      <p className="small">{c.name}'s profile, remarks and score will be removed for everyone. This cannot be undone.</p>
    </Dialog>}
  </Drawer>
}

/* ---------- overview: the match card and the tracker fields ---------- */
function Overview({ c }: { c: Candidate }) {
  const job = useStore((s) => s.jobs[c.jobId])
  const cfg = useStore((s) => s.config)
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState(c)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => { if (!edit) setF(c) }, [c, edit])
  const n = (v: string) => (v.trim() === '' ? null : +v)

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true)
    let next = { ...f }
    if (f.currentLocation.label !== c.currentLocation.label) {
      const place = await geocode(f.currentLocation.label)
      next = { ...next, currentLocation: place, distanceKm: km(place, job?.location) }
    }
    if (job) next = rescore(next, job, getState().config.weights)
    const changed = (['totalExp', 'relevantExp', 'currentCtcLpa', 'expectedCtcLpa', 'noticeDays'] as const).filter((k) => next[k] !== c[k])
    await put('candidates', { ...next, remarks: [...c.remarks, remark(changed.length || next.currentLocation.label !== c.currentLocation.label ? `Details updated, now ${next.match?.score ?? '—'}% match` : 'Details updated', 'note')] })
    setBusy(false); setEdit(false); toast('Profile updated')
  }

  return <section className="stack" style={{ gap: 'var(--space-xl)' }}>
    <MatchCard m={c.match} weights={cfg.weights} shortlisted={c.shortlisted}>
      {c.match && <div className="grid-2" style={{ gap: 'var(--space-lg)' }}>
        <div className="stack" style={{ gap: 'var(--space-xs)' }}><span className="label">Strengths</span>{c.match.strengths.length ? <ul className="small" style={{ margin: 0, paddingLeft: '1.1em' }}>{c.match.strengths.map((s) => <li key={s}>{s}</li>)}</ul> : <span className="small muted">None noted</span>}</div>
        <div className="stack" style={{ gap: 'var(--space-xs)' }}><span className="label">Gaps</span>{c.match.gaps.length ? <ul className="small" style={{ margin: 0, paddingLeft: '1.1em' }}>{c.match.gaps.map((s) => <li key={s}>{s}</li>)}</ul> : <span className="small muted">None noted</span>}</div>
      </div>}
      {job && c.match && <div className="chips">
        {job.mustSkills.map((s) => <span key={s} className={`chip ${c.match!.missingSkills.includes(s) ? 'chip--miss' : 'chip--hit'}`}>{s}</span>)}
        {job.niceSkills.map((s) => <span key={s} className={`chip ${c.match!.matchedSkills.includes(s) ? 'chip--hit' : 'chip--miss'}`}>{s}</span>)}
      </div>}
    </MatchCard>

    {!edit ? <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}><h3>Tracker details</h3><Button size="sm" onClick={() => setEdit(true)}>Edit details</Button></div>
      <dl className="facts">
        <div><dt>Total experience</dt><dd className="fig">{fmtYrs(c.totalExp)}</dd></div>
        <div><dt>Relevant experience</dt><dd className="fig">{fmtYrs(c.relevantExp)}</dd></div>
        <div><dt>Current CTC</dt><dd className="fig">{fmtLpa(c.currentCtcLpa)}</dd></div>
        <div><dt>Expected CTC</dt><dd className="fig">{fmtLpa(c.expectedCtcLpa)}{c.currentCtcLpa && c.expectedCtcLpa ? <span className="xs muted"> (+{Math.round(((c.expectedCtcLpa - c.currentCtcLpa) / c.currentCtcLpa) * 100)}%)</span> : null}</dd></div>
        <div><dt>Notice period</dt><dd className="fig">{fmtDays(c.noticeDays)}</dd></div>
        <div><dt>Current location</dt><dd>{c.currentLocation.label || '—'}</dd></div>
        <div><dt>Distance to job</dt><dd className="fig">{job?.workMode === 'remote' ? 'Remote role' : fmtKm(c.distanceKm)}{c.currentLocation.label && job?.location.label && job.workMode !== 'remote' ? <> <a className="xs" href={mapsLink(c.currentLocation.label, job.location.label)} target="_blank" rel="noreferrer">route</a></> : null}</dd></div>
        <div><dt>Phone</dt><dd className="fig">{c.phone || '—'}</dd></div>
        <div><dt>Email</dt><dd style={{ overflowWrap: 'anywhere' }}>{c.email || '—'}</dd></div>
        <div><dt>Current company</dt><dd>{c.currentCompany || '—'}</dd></div>
        <div><dt>Companies worked</dt><dd className="fig">{companiesCount(c) ?? '—'}</dd></div>
        <div><dt>Education</dt><dd>{c.education || '—'}</dd></div>
      </dl>
      {c.summary && <p className="small muted" style={{ maxWidth: '70ch' }}>{c.summary}</p>}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 'var(--space-md)' }}><h3>Employment stint</h3><span className="small muted">{companiesCount(c) ? `${companiesCount(c)} companies` : ''}</span></div>
      <EmploymentTimeline c={c} />
      {c.skills.length > 0 && <div className="chips">{c.skills.map((s) => <span key={s} className="chip">{s}</span>)}</div>}
    </div> : (
      <form className="form-grid" onSubmit={saveEdit}>
        <Field label="Name"><Input autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone"><Input type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Current location" hint="Distance updates on save"><Input value={f.currentLocation.label} onChange={(e) => setF({ ...f, currentLocation: { label: e.target.value } })} /></Field>
        <Field label="Total experience (yrs)"><Input type="number" step={0.5} inputMode="decimal" value={f.totalExp ?? ''} onChange={(e) => setF({ ...f, totalExp: n(e.target.value) })} /></Field>
        <Field label="Relevant experience (yrs)"><Input type="number" step={0.5} inputMode="decimal" value={f.relevantExp ?? ''} onChange={(e) => setF({ ...f, relevantExp: n(e.target.value) })} /></Field>
        <Field label="Current CTC (LPA)"><Input type="number" step={0.1} inputMode="decimal" value={f.currentCtcLpa ?? ''} onChange={(e) => setF({ ...f, currentCtcLpa: n(e.target.value) })} /></Field>
        <Field label="Expected CTC (LPA)"><Input type="number" step={0.1} inputMode="decimal" value={f.expectedCtcLpa ?? ''} onChange={(e) => setF({ ...f, expectedCtcLpa: n(e.target.value) })} /></Field>
        <Field label="Notice period (days)" hint="0 for immediate joiners"><Input type="number" step={1} inputMode="numeric" value={f.noticeDays ?? ''} onChange={(e) => setF({ ...f, noticeDays: n(e.target.value) })} /></Field>
        <Field label="Current role"><Input value={f.currentRole} onChange={(e) => setF({ ...f, currentRole: e.target.value })} /></Field>
        <Field label="Current company"><Input value={f.currentCompany} onChange={(e) => setF({ ...f, currentCompany: e.target.value })} /></Field>
        <div className="span-2 stack"><span className="label">Employment history</span><EmploymentEditor value={f.employment || []} onChange={(v) => setF({ ...f, employment: v })} /></div>
        <div className="span-2 row row--end"><Button variant="ghost" onClick={() => setEdit(false)}>Cancel</Button><Button type="submit" variant="ink" busy={busy}>Save and re-score</Button></div>
      </form>
    )}
  </section>
}

/* ---------- message: WhatsApp and email from templates ---------- */
function Contact({ c, onSent }: { c: Candidate; onSent: (kind: 'whatsapp' | 'email', text: string) => void }) {
  const job = useStore((s) => s.jobs[c.jobId])
  const cfg = useStore((s) => s.config)
  const tmap = useStore((s) => s.templates)
  const templates = useMemo(() => Object.values(tmap), [tmap])
  const [channel, setChannel] = useState<'whatsapp' | 'email'>(c.phone ? 'whatsapp' : 'email')
  const list = useMemo(() => templates.filter((t) => t.channel === channel).sort((a, b) => a.name.localeCompare(b.name)), [templates, channel])
  const [tid, setTid] = useState(list[0]?.id || '')
  const t = list.find((x) => x.id === tid) || list[0]
  const vars = useMemo(() => candidateVars(c, job, cfg), [c, job, cfg])
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => { setBody(t ? fill(t.body, vars) : ''); setSubject(t?.subject ? fill(t.subject, vars) : '') }, [t?.id, channel, vars]) // eslint-disable-line
  useEffect(() => { if (!list.find((x) => x.id === tid)) setTid(list[0]?.id || '') }, [channel, list.length]) // eslint-disable-line

  const missing = channel === 'whatsapp' ? !c.phone : !c.email
  const unfilled = (body + subject).match(/\{\{\w+\}\}/g)
  const apiReady = canServerSend() && channel === 'email'

  async function apiSend() {
    setBusy(true)
    try {
      await sendEmail(c.email, subject, body)
      onSent('email', `Email sent: ${t?.name || 'custom message'}`); toast(`Email sent to ${c.email}`)
    } catch (e: any) { toast(e.message, { kind: 'error' }) } finally { setBusy(false) }
  }

  return <section className="stack" style={{ gap: 'var(--space-md)' }}>
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <Groove label="Channel" value={channel} onChange={setChannel} options={[{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'Email' }]} />
      <div style={{ width: 220 }}><Select aria-label="Template" value={t?.id || ''} onChange={(e) => setTid(e.target.value)} options={list.length ? list.map((x) => ({ value: x.id, label: x.name })) : [{ value: '', label: 'No templates' }]} /></div>
    </div>
    {missing && <div className="error-box">No {channel === 'whatsapp' ? 'phone number' : 'email'} on this profile. Add it in Overview, Edit details.</div>}
    {channel === 'email' && <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>}
    <Field label="Message" hint={unfilled ? `Still has ${[...new Set(unfilled)].join(', ')}. Fill those in or schedule the interview first.` : `To ${channel === 'whatsapp' ? c.phone : c.email}`}>
      <Textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
    </Field>
    <div className="row">
      {channel === 'whatsapp'
        ? <LinkButton variant="ink" href={missing ? undefined : waLink(c.phone, body)} aria-disabled={missing} onClick={() => !missing && onSent('whatsapp', `WhatsApp opened: ${t?.name || 'custom message'}`)}><MessageCircle size={16} />Open in WhatsApp</LinkButton>
        : <LinkButton variant="ink" href={missing ? undefined : gmailLink(c.email, subject, body)} aria-disabled={missing} onClick={() => !missing && onSent('email', `Email drafted in Gmail: ${t?.name || 'custom message'}`)}><Mail size={16} />Open in Gmail</LinkButton>}
      {apiReady && <Button busy={busy} disabled={missing} onClick={apiSend}><Send size={14} />Send now</Button>}
      <Button variant="ghost" onClick={async () => toast((await copy(channel === 'email' ? `Subject: ${subject}\n\n${body}` : body)) ? 'Message copied' : 'Copy blocked here')}><Copy size={14} />Copy</Button>
    </div>
    <p className="xs muted">
      {channel === 'whatsapp' ? 'Opens WhatsApp with the message ready; you press send. ' : 'Opens a Gmail draft; you press send. '}
      {channel === 'email' && canServerSend() ? 'Send now emails it from the platform, with your address as reply-to. ' : ''}Every message is logged in Remarks.
    </p>
  </section>
}

/* ---------- remarks: the call log ---------- */
function Notes({ c }: { c: Candidate }) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<'note' | 'call'>('call')
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!text.trim()) return
    await put('candidates', { ...c, stage: kind === 'call' && c.stage === 'new' ? 'contacted' : c.stage, remarks: [...c.remarks, remark(text.trim(), kind)] }); setText('')
  }
  const list = [...c.remarks].sort((a, b) => b.at - a.at)
  return <section className="stack" style={{ gap: 'var(--space-md)' }}>
    <form className="stack" onSubmit={add}>
      <Groove label="Remark type" value={kind} onChange={setKind} options={[{ value: 'call', label: 'Spoke on call' }, { value: 'note', label: 'Note' }]} />
      <Textarea aria-label="Remark" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'call' ? 'Spoke at 4pm. Interested, can join in 30 days, negotiable on CTC.' : 'Anything the team should know.'} />
      <div><Button type="submit" variant="ink" disabled={!text.trim()}>Add remark</Button></div>
    </form>
    <ul className="feed">{list.map((r) => (
      <li key={r.id}><span><span className="kind">{({ note: 'Note', call: 'Call', whatsapp: 'WhatsApp', email: 'Email', meet: 'Interview', stage: 'Stage' } as const)[r.kind]}.</span> {r.text}</span><time title={new Date(r.at).toLocaleString('en-IN')}>{ago(r.at)}</time></li>))}</ul>
    <p className="xs muted">Current stage: <StageTag stage={c.stage} /></p>
  </section>
}
