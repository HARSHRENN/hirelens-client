import { Download, Mail, MessageCircle, Pause, Search, Send, Share2, Star, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { BandChip, Button, Dialog, Empty, Field, Groove, Input, LinkButton, ScoreCell, Select, Skeleton, StageTag, Textarea, useToast } from '../components/ui'
import { clientResumePdf, redact } from '../lib/clientResume'
import { getOriginal } from '../lib/files'
import { canServerSend, candidateVars, gmailLink, saveFile, sendEmailWithFiles, waLink } from '../lib/integrations'
import { companiesCount, selfMatch } from '../lib/match'
import { getState, put, useStages, useStore } from '../lib/store'
import { stageLabel, type Candidate, type Job, type Remark, type Stage } from '../lib/types'
import { useUi } from '../lib/uictx'
import { ago, csv, fill, fmtDays, fmtKm, fmtLpa, fmtYrs, uid } from '../lib/util'

/* The tracker: tick candidates down the side and fields across the top. Ticked rows
 * and ticked columns are what every export, mail and client share contains. */

type ColId = 'date' | 'job' | 'match' | 'self' | 'total' | 'rel' | 'company' | 'companies' | 'cur' | 'exp' | 'notice' | 'location' | 'stage' | 'remark' | 'phone' | 'email'
interface Col { id: ColId; label: string; num?: boolean; value: (c: Candidate, j?: Job) => string | number | null; sort?: (c: Candidate, j?: Job) => number | string }

const lastRemark = (c: Candidate) => [...c.remarks].sort((a, b) => b.at - a.at)[0]

const COLS: Col[] = [
  { id: 'date', label: 'Date added', value: (c) => new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }), sort: (c) => c.createdAt },
  { id: 'job', label: 'Job', value: (_c, j) => j?.title || '', sort: (_c, j) => j?.title || '' },
  { id: 'match', label: 'Match %', num: true, value: (c) => c.match?.score ?? null, sort: (c) => c.match?.score ?? -1 },
  { id: 'self', label: 'Self-rated %', num: true, value: (c, j) => selfMatch(c, j), sort: (c, j) => selfMatch(c, j) ?? -1 },
  { id: 'total', label: 'Total exp', num: true, value: (c) => c.totalExp, sort: (c) => c.totalExp ?? -1 },
  { id: 'rel', label: 'Relevant exp', num: true, value: (c) => c.relevantExp, sort: (c) => c.relevantExp ?? -1 },
  { id: 'company', label: 'Current company', value: (c) => c.currentCompany || '', sort: (c) => c.currentCompany.toLowerCase() },
  { id: 'companies', label: 'Companies', num: true, value: (c) => companiesCount(c), sort: (c) => companiesCount(c) ?? -1 },
  { id: 'cur', label: 'Current CTC', num: true, value: (c) => c.currentCtcLpa, sort: (c) => c.currentCtcLpa ?? -1 },
  { id: 'exp', label: 'Expected CTC', num: true, value: (c) => c.expectedCtcLpa, sort: (c) => c.expectedCtcLpa ?? -1 },
  { id: 'notice', label: 'Notice (days)', num: true, value: (c) => c.noticeDays, sort: (c) => c.noticeDays ?? 999 },
  { id: 'location', label: 'Location', value: (c, j) => `${c.currentLocation.label}${j?.workMode === 'remote' ? ' (remote role)' : c.distanceKm != null ? ` (${Math.round(c.distanceKm)} km)` : ''}`, sort: (c) => c.distanceKm ?? 1e6 },
  { id: 'stage', label: 'Stage', value: (c) => `${stageLabel(c.stage)}${c.shortlisted ? ', shortlisted' : ''}`, sort: (c) => c.stage },
  { id: 'remark', label: 'Last remark', value: (c) => lastRemark(c)?.text || '', sort: (c) => lastRemark(c)?.at || 0 },
  { id: 'phone', label: 'Phone', value: (c) => c.phone },
  { id: 'email', label: 'Email', value: (c) => c.email },
]
const DEFAULT_ON: ColId[] = ['date', 'job', 'match', 'total', 'rel', 'company', 'companies', 'cur', 'exp', 'notice', 'location', 'stage', 'remark']

export function Candidates() {
  const ready = useStore((s) => s.ready)
  const cands = useStore((s) => s.candidates)
  const jobs = useStore((s) => s.jobs)
  const cfg = useStore((s) => s.config)
  const STAGES = useStages()
  const [q, setQ] = useState('')
  const [job, setJob] = useState('all')
  const [stage, setStage] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<{ k: ColId | 'name'; dir: 1 | -1 }>({ k: 'date', dir: -1 })
  const [rows, setRows] = useState<Set<string>>(new Set())
  const [cols, setCols] = useState<Set<ColId>>(() => { try { const v = JSON.parse(localStorage.getItem('hl-cols') || 'null'); if (Array.isArray(v)) return new Set(v) } catch { /* default */ } return new Set(DEFAULT_ON) })
  const [dialog, setDialog] = useState<null | 'mail' | 'client' | 'wa' | 'email'>(null)
  const { openCandidate } = useUi()
  const toast = useToast()

  const toggleCol = (id: ColId) => setCols((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); try { localStorage.setItem('hl-cols', JSON.stringify([...n])) } catch { /* ignore */ } return n })

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const f0 = from ? new Date(from + 'T00:00').getTime() : 0, t0 = to ? new Date(to + 'T23:59:59').getTime() : Infinity
    const col = COLS.find((c) => c.id === sort.k)
    const key = (c: Candidate) => (sort.k === 'name' ? c.name.toLowerCase() : col?.sort ? col.sort(c, jobs[c.jobId]) : String(col?.value(c, jobs[c.jobId]) ?? ''))
    return Object.values(cands)
      .filter((c) => job === 'all' || c.jobId === job)
      .filter((c) => stage === 'all' || (stage === 'short' ? c.shortlisted : c.stage === stage))
      .filter((c) => c.createdAt >= f0 && c.createdAt <= t0)
      .filter((c) => !ql || [c.name, c.email, c.phone, c.currentLocation.label, c.currentCompany, ...c.skills].join(' ').toLowerCase().includes(ql))
      .sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir })
  }, [cands, jobs, job, stage, from, to, q, sort])

  const picked = list.filter((c) => rows.has(c.id))
  const target = picked.length ? picked : list
  const activeCols = COLS.filter((c) => cols.has(c.id))
  const allPicked = list.length > 0 && list.every((c) => rows.has(c.id))

  const tableRows = (who: Candidate[], hideContacts = false) => {
    const use = activeCols.filter((c) => !hideContacts || (c.id !== 'phone' && c.id !== 'email'))
    return [['Name', ...use.map((c) => c.label)], ...who.map((c) => [c.name, ...use.map((col) => { const v = col.value(c, jobs[c.jobId]); return v == null ? '' : String(v) })])]
  }

  function bulk(p: (c: Candidate) => Partial<Candidate>, text: string) {
    picked.forEach((c) => put('candidates', { ...c, ...p(c), remarks: [...c.remarks, { id: uid('r'), at: Date.now(), kind: 'stage', text } as Remark] }))
    toast(`${picked.length} profile${picked.length > 1 ? 's' : ''} updated`); setRows(new Set())
  }
  async function exportCsv() {
    const r = await saveFile(`tracker-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + csv(tableRows(target)), 'text/csv')
    toast(r === 'saved' ? `Exported ${target.length} rows and ${activeCols.length + 1} columns` : 'Downloads are blocked in this preview')
  }

  const th = (c: Col) => (
    <th key={c.id} className={c.num ? 'num' : undefined} data-off={!cols.has(c.id) || undefined} aria-sort={sort.k === c.id ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <span className="th-in">
        <input type="checkbox" checked={cols.has(c.id)} onChange={() => toggleCol(c.id)} aria-label={`Include ${c.label} in exports`} title="Include in export, mail and client share" />
        <button onClick={() => setSort((s) => ({ k: c.id, dir: s.k === c.id ? (s.dir === 1 ? -1 : 1) : c.num ? -1 : 1 }))}>{c.label}</button>
      </span>
    </th>
  )

  return <>
    <TopBar title="Candidate tracker" actions={<>
      <Button onClick={exportCsv} disabled={!list.length}><Download size={14} />Export</Button>
      <Button onClick={() => setDialog('mail')} disabled={!list.length}><Mail size={14} />Mail tracker</Button>
      <Button variant="ink" onClick={() => setDialog('client')} disabled={!list.length}><Share2 size={14} />Share with client</Button>
    </>} />
    <div className="row" style={{ gap: 'var(--space-sm)' }}>
      <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
        <Search size={16} aria-hidden style={{ position: 'absolute', left: 14, top: 14, color: 'var(--color-muted)' }} />
        <Input type="search" aria-label="Search candidates" placeholder="Name, phone, skill, city" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 40 }} />
      </div>
      <div style={{ width: 200 }}><Select aria-label="Job" value={job} onChange={(e) => setJob(e.target.value)} options={[{ value: 'all', label: 'All jobs' }, ...Object.values(jobs).map((j) => ({ value: j.id, label: j.title }))]} /></div>
      <div style={{ width: 170 }}><Select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} options={[{ value: 'all', label: 'Every stage' }, { value: 'short', label: 'Shortlisted' }, ...STAGES.map((s) => ({ value: s.id, label: s.label }))]} /></div>
      <label className="row small" style={{ gap: 6 }}>From<input className="input" style={{ width: 150 }} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="row small" style={{ gap: 6 }}>To<input className="input" style={{ width: 150 }} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      {(from || to) && <Button size="sm" variant="ghost" onClick={() => { setFrom(''); setTo('') }}>Clear dates</Button>}
    </div>

    {picked.length > 0 && <div className="bulkbar" role="toolbar" aria-label="Selected candidates">
      <b>{picked.length} selected</b>
      <Button size="sm" onClick={() => bulk(() => ({ shortlisted: true }), 'Shortlisted')}><Star size={14} />Shortlist</Button>
      <Button size="sm" onClick={() => bulk(() => ({ stage: 'hold' }), 'Moved to On hold')}><Pause size={14} />Hold</Button>
      <Button size="sm" onClick={() => bulk(() => ({ stage: 'rejected', shortlisted: false }), 'Moved to Rejected')}><X size={14} />Reject</Button>
      <div style={{ width: 170 }}><Select aria-label="Move selected to" value="" onChange={(e) => e.target.value && bulk(() => ({ stage: e.target.value as Stage }), `Moved to ${stageLabel(e.target.value)}`)} options={[{ value: '', label: 'Move to…' }, ...STAGES.map((s) => ({ value: s.id, label: s.label }))]} /></div>
      <span className="spacer" style={{ flex: 1 }} />
      <Button size="sm" onClick={() => setDialog('wa')}><MessageCircle size={14} />WhatsApp all</Button>
      <Button size="sm" onClick={() => setDialog('email')}><Send size={14} />Email all</Button>
      <Button size="sm" variant="ghost" onClick={() => setRows(new Set())}>Clear</Button>
    </div>}

    {!ready ? <Skeleton rows={8} /> : !Object.keys(cands).length ? (
      <Empty title="No candidates yet" action={<a className="btn btn--ink" href="#jobs">Go to jobs</a>}>Open a job and drop resumes on it. Every profile lands here with experience, CTC, notice period and distance filled in.</Empty>
    ) : !list.length ? <p className="muted small">No one matches these filters.</p> : (
      <div className="table-wrap"><table className="table table--stack tracker">
        <thead><tr>
          <th className="pick"><input type="checkbox" checked={allPicked} aria-label="Select all candidates shown" onChange={(e) => setRows(e.target.checked ? new Set(list.map((c) => c.id)) : new Set())} /></th>
          <th aria-sort={sort.k === 'name' ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}><button onClick={() => setSort((s) => ({ k: 'name', dir: s.k === 'name' ? (s.dir === 1 ? -1 : 1) : 1 }))}>Candidate</button></th>
          {COLS.map(th)}
        </tr></thead>
        <tbody>{list.map((c) => {
          const j = jobs[c.jobId]; const last = lastRemark(c); const sm = selfMatch(c, j)
          const cell: Record<ColId, React.ReactNode> = {
            date: <span className="fig">{new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>,
            job: <div className="who"><span style={{ color: 'var(--color-ink)', fontSize: 'var(--text-sm)' }}>{j?.title || '—'}</span><span>{j?.client}</span></div>,
            match: <ScoreCell m={c.match} />, self: sm == null ? '—' : <span className="fig">{sm}%</span>,
            total: fmtYrs(c.totalExp), rel: fmtYrs(c.relevantExp), company: c.currentCompany || '—', companies: companiesCount(c) ?? '—',
            cur: fmtLpa(c.currentCtcLpa), exp: fmtLpa(c.expectedCtcLpa), notice: fmtDays(c.noticeDays),
            location: <div className="who" style={{ textAlign: 'right', minWidth: 120 }}><span style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>{c.currentLocation.label || '—'}</span><span>{j?.workMode === 'remote' ? 'remote role' : `${fmtKm(c.distanceKm)} to ${j?.location.label.split(',')[0] || 'job'}`}</span></div>,
            stage: <StageTag stage={c.stage} />,
            remark: <div className="who" style={{ maxWidth: 240 }}><span style={{ color: 'var(--color-ink)', fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{last?.text || '—'}</span><span>{last ? ago(last.at) : ''}</span></div>,
            phone: <span className="fig">{c.phone || '—'}</span>, email: c.email || '—',
          }
          return <tr key={c.id} data-shortlisted={c.shortlisted} data-picked={rows.has(c.id) || undefined} onClick={() => openCandidate(c.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openCandidate(c.id)}>
            <td className="pick" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={rows.has(c.id)} aria-label={`Select ${c.name}`} onChange={(e) => setRows((s) => { const n = new Set(s); e.target.checked ? n.add(c.id) : n.delete(c.id); return n })} /></td>
            <td><div className="who"><b>{c.name}</b><span>{c.match ? <BandChip score={c.match.score} /> : c.fileName}</span></div></td>
            {COLS.map((col) => <td key={col.id} className={col.num ? 'num' : undefined} data-off={!cols.has(col.id) || undefined} data-label={col.label}>{cell[col.id]}</td>)}
          </tr>
        })}</tbody>
      </table></div>
    )}
    {list.length > 0 && <p className="xs muted">{list.length} shown{picked.length ? `, ${picked.length} ticked` : ''}. Ticked rows and ticked columns go into Export, Mail tracker and Share with client; with no rows ticked, everything shown goes. Colours: {cfg.bands.potential}%+ potential match, {cfg.bands.near}–{cfg.bands.potential - 1}% near match, under {cfg.bands.near}% not a match.</p>}

    {dialog === 'mail' && <MailTracker who={target} rows={tableRows(target)} onClose={() => setDialog(null)} />}
    {dialog === 'client' && <ShareClient who={target} rows={(hide) => tableRows(target, hide)} onClose={() => setDialog(null)} />}
    {(dialog === 'wa' || dialog === 'email') && <Broadcast channel={dialog === 'wa' ? 'whatsapp' : 'email'} who={picked} onClose={() => setDialog(null)} />}
  </>
}

/* ---------------- mail the tracker ---------------- */
function MailTracker({ who, rows, onClose }: { who: Candidate[]; rows: string[][]; onClose: () => void }) {
  const cfg = useStore((s) => s.config)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState(`Candidate tracker, ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`)
  const [note, setNote] = useState(`Hi,\n\nPlease find the candidate tracker attached (${who.length} profiles).\n\nRegards,\n${cfg.recruiterName || cfg.companyName}`)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const file = '﻿' + csv(rows)
  const table = rows.slice(0, 40).map((r) => r.join(' | ')).join('\n')
  return <Dialog title="Mail the tracker" onClose={onClose} wide footer={<>
    <Button variant="ghost" onClick={onClose}>Close</Button>
    <LinkButton href={gmailLink(to, subject, `${note}\n\n${table}${rows.length > 41 ? '\n…' : ''}`)} onClick={() => saveFile('candidate-tracker.csv', file, 'text/csv')}><Mail size={14} />Open Gmail draft</LinkButton>
    {canServerSend() && <Button variant="ink" busy={busy} disabled={!/@/.test(to)} onClick={async () => {
      setBusy(true)
      try { await sendEmailWithFiles(to, subject, note, [{ filename: 'candidate-tracker.csv', content: btoa(unescape(encodeURIComponent(file))) }]); toast('Tracker sent with the CSV attached'); onClose() }
      catch (e: any) { toast(e.message, { kind: 'error' }) } finally { setBusy(false) }
    }}><Send size={14} />Send with attachment</Button>}
  </>}>
    <div className="form-grid">
      <Field label="To"><Input type="email" inputMode="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" /></Field>
      <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
      <Field label="Message" className="span-2"><Textarea rows={5} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </div>
    <p className="xs muted">{rows.length - 1} rows, {rows[0]!.length} columns. Gmail draft: the CSV downloads, the table goes into the mail body, attach the CSV before sending.{canServerSend() ? ' Send with attachment emails it from the platform.' : ''}</p>
  </Dialog>
}

/* ---------------- share with the client: tracker + resumes ---------------- */
function ShareClient({ who, rows, onClose }: { who: Candidate[]; rows: (hideContacts: boolean) => string[][]; onClose: () => void }) {
  const cfg = useStore((s) => s.config)
  const jobs = useStore((s) => s.jobs)
  const [format, setFormat] = useState<'client' | 'original'>('client')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState<'' | 'zip' | 'send'>('')
  const toast = useToast()
  const agency = cfg.companyName || 'Agency'
  const subject = `Profiles for your review: ${[...new Set(who.map((c) => jobs[c.jobId]?.title).filter(Boolean))].join(', ')}`
  const body = `Hi,\n\nSharing ${who.length} profile${who.length > 1 ? 's' : ''} for your review. The tracker and resumes are attached.\n\nRegards,\n${cfg.recruiterName || agency}\n${agency}`

  async function build() {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    zip.file('tracker.csv', '﻿' + csv(rows(format === 'client')))
    let missing = 0
    for (const c of who) {
      const base = c.name.replace(/[^\w ]+/g, '').trim().replace(/\s+/g, '-')
      if (format === 'client') zip.file(`resumes/${base}-${agency.replace(/\W+/g, '-')}.pdf`, clientResumePdf(c, jobs[c.jobId], agency))
      else {
        const f = await getOriginal(c.id, c.fileName)
        if (f) zip.file(`resumes/${base}-${f.name}`, f.blob)
        else { missing++; zip.file(`resumes/${base}-resume-text.txt`, c.resumeText) }
      }
    }
    return { blob: await zip.generateAsync({ type: 'blob' }), missing }
  }

  return <Dialog title={`Share ${who.length} profile${who.length > 1 ? 's' : ''} with the client`} onClose={onClose} wide footer={<>
    <Button variant="ghost" onClick={onClose}>Close</Button>
    <Button busy={busy === 'zip'} onClick={async () => {
      setBusy('zip'); const { blob, missing } = await build()
      const r = await saveFile(`profiles-${new Date().toISOString().slice(0, 10)}.zip`, blob, 'application/zip'); setBusy('')
      toast(r === 'saved' ? `Pack saved${missing ? `; ${missing} original file${missing > 1 ? 's were' : ' was'} not in this browser, so the resume text went in instead` : ''}` : 'Downloads are blocked in this preview')
    }}><Download size={14} />Download pack (.zip)</Button>
    <LinkButton href={gmailLink(to, subject, body)}><Mail size={14} />Gmail draft</LinkButton>
    {canServerSend() && <Button variant="ink" busy={busy === 'send'} disabled={!/@/.test(to)} onClick={async () => {
      setBusy('send')
      try {
        const { blob } = await build()
        const b64 = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]!); fr.readAsDataURL(blob) })
        await sendEmailWithFiles(to, subject, body, [{ filename: 'profiles.zip', content: b64 }]); toast('Sent to the client with the pack attached'); onClose()
      } catch (e: any) { toast(e.message, { kind: 'error' }) } finally { setBusy('') }
    }}><Send size={14} />Send to client</Button>}
  </>}>
    <Groove label="Resume format" value={format} onChange={setFormat} options={[{ value: 'client', label: 'Client format: contacts hidden, watermarked' }, { value: 'original', label: 'Original files' }]} />
    <p className="small muted">{format === 'client'
      ? `Each resume is rebuilt in ${agency}'s layout with email and phone numbers removed everywhere and "${agency}" watermarked on every page. Phone and Email columns are left out of the tracker too.`
      : 'The files exactly as the candidates sent them, with the tracker as you ticked it. Originals are kept in the browser that uploaded them.'}</p>
    <Field label="Client email"><Input type="email" inputMode="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="hiring.manager@example.com" /></Field>
    <ul className="queue">{who.slice(0, 8).map((c) => <li key={c.id}><span>{c.name}</span><span className="small muted">{redact(c.currentCompany || '')}</span>{c.match && <BandChip score={c.match.score} />}</li>)}{who.length > 8 && <li><span className="small muted">and {who.length - 8} more</span></li>}</ul>
  </Dialog>
}

/* ---------------- broadcast to the ticked candidates ---------------- */
function Broadcast({ channel, who, onClose }: { channel: 'whatsapp' | 'email'; who: Candidate[]; onClose: () => void }) {
  const tmap = useStore((s) => s.templates)
  const jobs = useStore((s) => s.jobs)
  const cfg = useStore((s) => s.config)
  const list = useMemo(() => Object.values(tmap).filter((t) => t.channel === channel), [tmap, channel])
  const [tid, setTid] = useState(list[0]?.id || '')
  const t = list.find((x) => x.id === tid)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const toast = useToast()
  const reach = who.filter((c) => (channel === 'whatsapp' ? c.phone : c.email))
  const msg = (c: Candidate) => fill(t?.body || '', candidateVars(c, jobs[c.jobId], cfg))
  const log = (c: Candidate, text: string) => put('candidates', { ...getState().candidates[c.id]!, stage: c.stage === 'new' ? 'contacted' : c.stage, remarks: [...c.remarks, { id: uid('r'), at: Date.now(), kind: channel, text } as Remark] })
  const generic = fill(t?.body || '', { ...candidateVars(who[0]!, jobs[who[0]!.jobId], cfg), name: 'there', fullName: 'there', interviewTime: '', meetLink: '' })

  return <Dialog title={`${channel === 'whatsapp' ? 'WhatsApp' : 'Email'} ${reach.length} candidate${reach.length === 1 ? '' : 's'}`} onClose={onClose} wide footer={<Button variant="ghost" onClick={onClose}>Done</Button>}>
    <Field label="Template"><Select value={t?.id || ''} onChange={(e) => setTid(e.target.value)} options={list.length ? list.map((x) => ({ value: x.id, label: x.name })) : [{ value: '', label: 'No templates' }]} /></Field>
    {who.length > reach.length && <p className="small muted">{who.length - reach.length} ticked profile{who.length - reach.length > 1 ? 's have' : ' has'} no {channel === 'whatsapp' ? 'phone number' : 'email'} and {who.length - reach.length > 1 ? 'are' : 'is'} skipped.</p>}
    {channel === 'whatsapp' ? <>
      <p className="small muted">Each message is personalised. Open them one by one and press send in WhatsApp. Every send is logged in the candidate's remarks.</p>
      <ul className="queue">{reach.map((c) => (
        <li key={c.id}><span>{c.name}</span><span className="small muted fig">{c.phone}</span>
          <LinkButton size="sm" variant={sent.has(c.id) ? 'ghost' : 'card'} href={waLink(c.phone, msg(c))} onClick={() => { setSent((s) => new Set(s).add(c.id)); log(c, `WhatsApp opened (broadcast): ${t?.name || 'message'}`) }}>{sent.has(c.id) ? 'Opened' : 'Open'}</LinkButton></li>))}</ul>
    </> : <>
      <div className="preview-msg stock">{t?.subject && <b style={{ fontWeight: 500 }}>{fill(t.subject, { ...candidateVars(who[0]!, jobs[who[0]!.jobId], cfg) })}{'\n\n'}</b>}{generic}</div>
      <p className="small muted">One Gmail draft with everyone in BCC, so no candidate sees the others. Names are replaced with "there". Bulk mail goes through your own Gmail so the platform's free email allowance stays free for invites, reminders and invoices.</p>
      <div><LinkButton variant="ink" href={`https://mail.google.com/mail/?view=cm&fs=1&bcc=${encodeURIComponent(reach.map((c) => c.email).join(','))}&su=${encodeURIComponent(fill(t?.subject || '', candidateVars(who[0]!, jobs[who[0]!.jobId], cfg)))}&body=${encodeURIComponent(generic)}`}
        onClick={() => { reach.forEach((c) => log(c, `Email drafted (broadcast): ${t?.name || 'message'}`)); toast(`${reach.length} logged`) }}><Mail size={14} />Open Gmail with {reach.length} in BCC</LinkButton></div>
    </>}
  </Dialog>
}
