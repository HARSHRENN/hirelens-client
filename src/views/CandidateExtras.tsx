import { CalendarPlus, Download, FileText, Video } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BandChip, Button, Field, Input, LinkButton, Select, Textarea, useToast } from '../components/ui'
import { clientResumePdf } from '../lib/clientResume'
import { getOriginal } from '../lib/files'
import { MODE } from '../lib/runtime'
import { calendarLink, canServerSend, candidateVars, saveFile, sendInterviewInvite } from '../lib/integrations'
import { companiesCount, selfMatch, yearsAt } from '../lib/match'
import { getState, put, useStages, useStore } from '../lib/store'
import type { Candidate, Employment, Interview } from '../lib/types'
import { stageLabel } from '../lib/types'
import { fmtDate, uid } from '../lib/util'

const fill = (t: string, v: Record<string, string>) => t.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (v[k] ? v[k] : m))

/* ---------------- employment stint: one bar per job across the years ---------------- */
export function EmploymentTimeline({ c }: { c: Candidate }) {
  const rows = (c.employment || []).filter((e) => /^\d{4}/.test(e.from))
  if (!rows.length) return <p className="small muted">No employment history was read from this resume. Re-upload it with AI on, or add jobs in Edit details.</p>
  const toN = (s: string) => (s === 'present' ? new Date().getFullYear() + new Date().getMonth() / 12 : +s.slice(0, 4) + (+s.slice(5, 7) - 1) / 12)
  const start = Math.floor(Math.min(...rows.map((e) => toN(e.from))))
  const end = Math.ceil(Math.max(...rows.map((e) => toN(e.to)))) || new Date().getFullYear() + 1
  const span = Math.max(1, end - start)
  const years = Array.from({ length: span + 1 }, (_, i) => start + i)
  const sorted = [...rows].sort((a, b) => toN(a.from) - toN(b.from))
  return (
    <div className="stint" role="img" aria-label={`Employment from ${start} to ${end}: ${sorted.map((e) => `${e.company} ${e.from} to ${e.to}`).join('; ')}`}>
      {sorted.map((e, i) => {
        const l = ((toN(e.from) - start) / span) * 100, w = Math.max(1.5, ((toN(e.to) - toN(e.from)) / span) * 100)
        return <div className="stint-row" key={i}>
          <span className="stint-name"><b>{e.company}</b><span>{e.role}</span></span>
          <span className="stint-track"><i data-current={e.to === 'present'} style={{ left: `${l}%`, width: `${w}%` }} title={`${e.from} to ${e.to}, ${yearsAt(e).toFixed(1)} yrs`}><span>{yearsAt(e).toFixed(1)} yrs</span></i></span>
        </div>
      })}
      <div className="stint-row stint-axis" aria-hidden><span /><span className="stint-track">{years.map((y) => <em key={y} style={{ left: `${((y - start) / span) * 100}%` }}>{y}</em>)}</span></div>
    </div>
  )
}

export function EmploymentEditor({ value, onChange }: { value: Employment[]; onChange: (v: Employment[]) => void }) {
  const set = (i: number, p: Partial<Employment>) => onChange(value.map((e, k) => (k === i ? { ...e, ...p } : e)))
  return <div className="stack">
    {value.map((e, i) => (
      <div className="row" key={i} style={{ alignItems: 'end' }}>
        <Field label="Company"><Input value={e.company} onChange={(ev) => set(i, { company: ev.target.value })} /></Field>
        <Field label="Role"><Input value={e.role} onChange={(ev) => set(i, { role: ev.target.value })} /></Field>
        <Field label="From"><Input type="month" value={e.from} onChange={(ev) => set(i, { from: ev.target.value })} /></Field>
        <Field label="To" hint="Blank for present"><Input type="month" value={e.to === 'present' ? '' : e.to} onChange={(ev) => set(i, { to: ev.target.value || 'present' })} /></Field>
        <Button variant="ghost" size="sm" onClick={() => onChange(value.filter((_, k) => k !== i))}>Remove</Button>
      </div>))}
    <div><Button size="sm" onClick={() => onChange([...value, { company: '', role: '', from: `${new Date().getFullYear() - 1}-01`, to: 'present' }])}>Add a job</Button></div>
  </div>
}

/* ---------------- self rating against the JD ---------------- */
export function SelfRating({ c }: { c: Candidate }) {
  const job = useStore((s) => s.jobs[c.jobId])
  const cfg = useStore((s) => s.config)
  const toast = useToast()
  if (!job) return <p className="small muted">This profile has no job.</p>
  const skills = [...job.mustSkills.map((s) => [s, true] as const), ...job.niceSkills.map((s) => [s, false] as const)]
  const rate = (s: string, v: number) => put('candidates', { ...c, selfRatings: { ...(c.selfRatings || {}), [s]: v } })
  const pct = selfMatch(c, job)
  const ask = `Hi ${c.name.split(' ')[0]}, for the ${job.title} role, please rate yourself from 1 (basic) to 5 (expert) on:\n${skills.map(([s]) => `- ${s}:`).join('\n')}\nReply with the numbers. Thanks, ${cfg.recruiterName || cfg.companyName}`
  return <section className="stack" style={{ gap: 'var(--space-lg)' }}>
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
      <div className="stack" style={{ gap: 2 }}>
        <span className="label">Self-rated match</span>
        <div className="row" style={{ alignItems: 'baseline' }}><span className="fig" style={{ fontSize: 56, fontWeight: 300, letterSpacing: '-.05em', lineHeight: 1 }}>{pct == null ? '—' : `${pct}%`}</span>{pct != null && <BandChip score={pct} />}</div>
        <span className="xs muted">The candidate's own ratings, 1 to 5, against the JD skills (must-haves count 80%). Resume match: {c.match ? `${c.match.score}%` : 'not scored'}.</span>
      </div>
      <LinkButton size="sm" href={`https://wa.me/${c.phone.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}?text=${encodeURIComponent(ask)}`}>Ask on WhatsApp</LinkButton>
    </div>
    <div className="rating-grid">
      {skills.map(([s, must]) => (
        <div className="rating-row" key={s}>
          <span>{s}{must && <span className="xs muted"> must-have</span>}</span>
          <div className="groove" role="radiogroup" aria-label={`${s} self rating`}>
            {[1, 2, 3, 4, 5].map((v) => <button key={v} type="button" role="radio" aria-checked={c.selfRatings?.[s] === v} aria-pressed={c.selfRatings?.[s] === v} onClick={() => rate(s, v)}>{v}</button>)}
          </div>
        </div>))}
    </div>
    {c.selfRatings && Object.keys(c.selfRatings).length > 0 && <div><Button size="sm" variant="ghost" onClick={() => { put('candidates', { ...c, selfRatings: {} }); toast('Self ratings cleared') }}>Clear ratings</Button></div>}
  </section>
}

/* ---------------- panel interviews with feedback ---------------- */
export function PanelInterviews({ c }: { c: Candidate }) {
  const job = useStore((s) => s.jobs[c.jobId])
  const panelists = useStore((s) => s.panelists)
  const stages = useStages()
  const levels = stages.filter((s) => s.kind === 'level')
  const toast = useToast()
  const def = () => { const d = new Date(Date.now() + 864e5); d.setHours(11, 0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16) }
  const [when, setWhen] = useState(def)
  const [round, setRound] = useState(levels.find((l) => !(c.interviews || []).some((i) => i.round === l.id))?.id || levels[0]?.id || 'l1')
  const [who, setWho] = useState<string[]>([])
  const [link, setLink] = useState('')
  const autoInvites = useStore((s) => s.config.autoInvites)
  const [mail, setMail] = useState(true)
  const [busy, setBusy] = useState(false)
  const canMail = canServerSend() && autoInvites && !!c.email
  const active = Object.values(panelists).filter((p) => p.active)
  const list = [...(c.interviews || [])].sort((a, b) => b.at - a.at)
  const start = new Date(when)
  const guests = [c.email, ...who.map((id) => panelists[id]?.email || '')]
  const cal = calendarLink({ title: `${stageLabel(round)}: ${c.name} for ${job?.title || 'role'}`, start, minutes: 45, details: `Candidate: ${c.name}\nRole: ${job?.title}\nMatch: ${c.match?.score ?? '—'}%\nPanel: ${who.map((id) => panelists[id]?.name).join(', ')}\n\nAdd Google Meet video conferencing before saving.`, guests })

  async function schedule() {
    if (isNaN(start.getTime())) return
    if (start.getTime() < Date.now() - 6e4) return toast('Pick a time in the future.', { kind: 'error' })
    setBusy(true)
    const iv: Interview = { id: uid('iv'), round, at: start.getTime(), panelistIds: who, meetLink: link.trim() || undefined, result: 'pending', createdAt: Date.now() }
    const when = start.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    let next: Candidate = { ...c, stage: round, interviewAt: iv.at, meetLink: iv.meetLink || c.meetLink, interviews: [...(c.interviews || []), iv],
      remarks: [...c.remarks, { id: uid('r'), at: Date.now(), kind: 'meet', text: `${stageLabel(round)} set for ${when}${who.length ? ' with ' + who.map((id) => panelists[id]?.name).join(', ') : ''}` }] }
    await put('candidates', next)
    if (canMail && mail) {
      // the automatic invite: the candidate's "Interview invite" email template, a calendar file, the panel in CC
      const st = getState()
      const tpl = Object.values(st.templates).find((t) => t.channel === 'email' && /invite/i.test(t.name))
      const vars = { ...candidateVars(next, job, st.config), round: stageLabel(round) }
      const subject = fill(tpl?.subject || 'Interview scheduled: {{role}}', vars)
      const text = fill(tpl?.body || 'Hi {{name}},\n\nYour {{round}} interview for {{role}} is on {{interviewTime}}.\n\nGoogle Meet: {{meetLink}}\n\nRegards,\n{{recruiter}}\n{{company}}', vars).replace(/\n?.*\{\{meetLink\}\}.*\n?/g, '\n')
      try {
        await sendInterviewInvite({ to: c.email, cc: who.map((id) => panelists[id]?.email || '').filter(Boolean), subject, text, start: iv.at, minutes: 45, title: `${stageLabel(round)}: ${c.name} for ${job?.title || 'the role'}`, location: iv.meetLink, interviewId: iv.id })
        next = getState().candidates[c.id] || next
        await put('candidates', { ...next, interviews: (next.interviews || []).map((x) => (x.id === iv.id ? { ...x, inviteSentAt: Date.now() } : x)),
          remarks: [...next.remarks, { id: uid('r'), at: Date.now(), kind: 'email', text: `Interview invite emailed to ${c.email}${who.length ? ` (panel in CC)` : ''} with a calendar file` }] })
        toast(`Interview scheduled and invite emailed to ${c.email}`)
      } catch (e: any) { toast(`Interview saved, but the invite email failed: ${e.message}`, { kind: 'error' }) }
    } else toast(c.email || !canServerSend() ? 'Interview scheduled. Send the invite from Message.' : 'Interview scheduled. This profile has no email, so send the invite on WhatsApp from Message.')
    setLink(''); setBusy(false)
  }

  return <section className="stack" style={{ gap: 'var(--space-xl)' }}>
    <div className="stack">
      <h3>Schedule a round</h3>
      <div className="form-grid">
        <Field label="Round"><Select value={round} onChange={(e) => setRound(e.target.value)} options={levels.map((l) => ({ value: l.id, label: l.label }))} /></Field>
        <Field label="Date and time"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <div className="span-2 stack" style={{ gap: 'var(--space-2xs)' }}>
          <span className="label">Panel</span>
          {active.length ? <div className="chips">{active.map((p) => (
            <label key={p.id} className="check chip" style={{ cursor: 'pointer' }}><input type="checkbox" checked={who.includes(p.id)} onChange={(e) => setWho(e.target.checked ? [...who, p.id] : who.filter((x) => x !== p.id))} />{p.name}</label>))}</div>
            : <span className="small muted">No panelists yet. Add them on the Panelists page.</span>}
          {who.map((id) => panelists[id]?.calendly && <a key={id} className="xs" href={panelists[id]!.calendly} target="_blank" rel="noreferrer">{panelists[id]!.name}'s availability (Calendly)</a>)}
        </div>
        <Field label="Meet link" hint="From Google Calendar or meet.new" className="span-2"><Input type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/abc-defg-hij" /></Field>
      </div>
      <div className="row">
        <LinkButton href={cal}><CalendarPlus size={14} />Open in Google Calendar</LinkButton>
        <LinkButton variant="ghost" href="https://meet.new"><Video size={14} />meet.new</LinkButton>
        <Button variant="ink" busy={busy} onClick={schedule}>{canMail && mail ? 'Save and email invite' : 'Save interview'}</Button>
      </div>
      {canMail && <label className="row small"><input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} /> Email the invite to {c.email} with a calendar file{who.length ? ', panel in CC' : ''}. A reminder follows on the morning of the interview.</label>}
      {canServerSend() && !autoInvites && <p className="xs muted">Automatic invites are off in Settings.</p>}
    </div>
    <div className="stack">
      <h3>Rounds and panel feedback</h3>
      {list.length ? list.map((iv) => <InterviewCard key={iv.id} c={c} iv={iv} />) : <p className="small muted">No rounds yet.</p>}
      <p className="xs muted">Feedback is entered by the recruiter after the panel's call. Calendly links open the panelist's booking page; Calendly's own API is not connected.</p>
    </div>
  </section>
}

function InterviewCard({ c, iv }: { c: Candidate; iv: Interview }) {
  const panelists = useStore((s) => s.panelists)
  const [f, setF] = useState({ result: iv.result, rating: iv.rating ?? 0, feedback: iv.feedback || '', by: iv.feedbackBy || iv.panelistIds[0] || '' })
  const toast = useToast()
  useEffect(() => { setF({ result: iv.result, rating: iv.rating ?? 0, feedback: iv.feedback || '', by: iv.feedbackBy || iv.panelistIds[0] || '' }) }, [iv])
  async function save() {
    const next = (c.interviews || []).map((x) => (x.id === iv.id ? { ...x, result: f.result, rating: f.rating || undefined, feedback: f.feedback.trim(), feedbackBy: f.by || undefined } : x))
    const stage = f.result === 'reject' ? 'rejected' : f.result === 'hold' ? 'hold' : c.stage
    await put('candidates', { ...c, interviews: next, stage, remarks: [...c.remarks, { id: uid('r'), at: Date.now(), kind: 'note', text: `${stageLabel(iv.round)} feedback${f.by ? ' from ' + (panelists[f.by]?.name || '') : ''}: ${({ pending: 'pending', select: 'select', reject: 'reject', hold: 'hold' })[f.result]}${f.feedback ? '. ' + f.feedback.trim() : ''}` }] })
    toast('Feedback saved')
  }
  return <div className="stock" style={{ padding: 'var(--space-md) var(--space-lg)', display: 'grid', gap: 'var(--space-sm)' }}>
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <b style={{ fontWeight: 500 }}>{stageLabel(iv.round)}</b>
      <span className="small muted">{fmtDate(iv.at, true)}{iv.panelistIds.length ? `, ${iv.panelistIds.map((id) => panelists[id]?.name || 'removed panelist').join(', ')}` : ''}{iv.meetLink && <> · <a href={iv.meetLink} target="_blank" rel="noreferrer">Meet</a></>}</span>
    </div>
    <div className="row" style={{ alignItems: 'end' }}>
      <div className="groove" role="group" aria-label="Result">{(['pending', 'select', 'hold', 'reject'] as const).map((r) => <button key={r} type="button" aria-pressed={f.result === r} onClick={() => setF({ ...f, result: r })}>{({ pending: 'Pending', select: 'Select', hold: 'Hold', reject: 'Reject' })[r]}</button>)}</div>
      <div className="groove" role="group" aria-label="Rating">{[1, 2, 3, 4, 5].map((v) => <button key={v} type="button" aria-pressed={f.rating === v} onClick={() => setF({ ...f, rating: v })}>{v}</button>)}</div>
      {iv.panelistIds.length > 1 && <div style={{ width: 180 }}><Select aria-label="Feedback from" value={f.by} onChange={(e) => setF({ ...f, by: e.target.value })} options={iv.panelistIds.map((id) => ({ value: id, label: panelists[id]?.name || id }))} /></div>}
    </div>
    <Textarea aria-label="Panel feedback" rows={2} value={f.feedback} onChange={(e) => setF({ ...f, feedback: e.target.value })} placeholder="Strong on Spring Boot, weak on system design. Recommend L3." />
    <div><Button size="sm" variant="ink" onClick={save}>Save feedback</Button></div>
  </div>
}

/* ---------------- resume: original file and client format ---------------- */
export function ResumeFiles({ c }: { c: Candidate }) {
  const job = useStore((s) => s.jobs[c.jobId])
  const agency = useStore((s) => s.config.companyName)
  const toast = useToast()
  const [orig, setOrig] = useState<{ name: string } | null>(null)
  useEffect(() => { if (MODE() === 'cloud') setOrig(c.hasOriginal ? { name: c.fileName } : null); else getOriginal(c.id).then((f) => setOrig(f ? { name: f.name } : null)) }, [c.id, c.hasOriginal, c.fileName])
  return <div className="row">
    <Button size="sm" disabled={!orig} title={orig ? orig.name : 'The original file is kept only in the browser that uploaded it'} onClick={async () => {
      const f = await getOriginal(c.id, c.fileName); if (!f) return
      const r = await saveFile(f.name, f.blob, f.type); toast(r === 'saved' ? 'Original resume saved' : 'Download blocked here')
    }}><Download size={14} />Original{orig ? '' : ' (not in this browser)'}</Button>
    <Button size="sm" onClick={async () => {
      const r = await saveFile(`${c.name.replace(/\W+/g, '-')}-${agency.replace(/\W+/g, '-')}.pdf`, clientResumePdf(c, job, agency || 'Agency'), 'application/pdf')
      toast(r === 'saved' ? 'Client-format resume saved: contact details hidden, agency watermark added' : 'Download blocked here')
    }}><FileText size={14} />Client format (PDF)</Button>
    <span className="xs muted">{companiesCount(c) ? `${companiesCount(c)} companies on record` : ''}</span>
  </div>
}
