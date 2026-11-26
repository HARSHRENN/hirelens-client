import { analyse } from '../lib/match'
import { Sparkles, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, ErrorBox, ScoreCell, useToast } from '../components/ui'
import { completeJson } from '../lib/ai'
import { put, useStore } from '../lib/store'
import type { Candidate, IdealProfile as IP, Job } from '../lib/types'
import { useUi } from '../lib/uictx'
import { extractText, ACCEPT } from '../lib/parse'
import { getState } from '../lib/store'
import { fmtDate, norm } from '../lib/util'

/* The ideal candidate is drawn from the people the recruiter actually shortlisted,
 * then used to surface the next-closest profiles that are not on the list yet. */

function stats(sl: Candidate[]) {
  const exps = sl.map((c) => c.relevantExp ?? c.totalExp).filter((x): x is number => x != null)
  const ctcs = sl.map((c) => c.expectedCtcLpa).filter((x): x is number => x != null)
  const count = new Map<string, number>()
  sl.forEach((c) => new Set(c.skills.map((s) => s.trim())).forEach((s) => count.set(s, (count.get(s) || 0) + 1)))
  const common = [...count.entries()].filter(([, n]) => n >= Math.max(1, Math.ceil(sl.length / 2))).sort((a, b) => b[1] - a[1]).map(([s]) => s).slice(0, 10)
  const r = (a: number[]) => (a.length ? `${Math.min(...a)}–${Math.max(...a)}` : 'not known')
  return { exp: r(exps), ctc: r(ctcs), common, expMid: exps.length ? exps.reduce((a, b) => a + b, 0) / exps.length : null }
}

export function IdealProfile({ job }: { job: Job }) {
  const cands = useStore((s) => s.candidates)
  const [referenceBusy,setReferenceBusy]=useState(false)
  const [referenceAi,setReferenceAi]=useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const toast = useToast()
  const { openCandidate } = useUi()
  const all = Object.values(cands).filter((c) => c.jobId === job.id)
  const sl = all.filter((c) => c.shortlisted)
  const st = useMemo(() => stats(sl), [sl])

  const closest = useMemo(() => {
    const ideal = new Set((job.ideal ? [...job.ideal.traits, ...st.common] : st.common).map(norm))
    if (!ideal.size) return []
    return all.filter((c) => !c.shortlisted && c.stage !== 'rejected').map((c) => {
      const have = new Set(c.skills.map(norm))
      const overlap = [...ideal].filter((s) => have.has(s)).length / ideal.size
      const e = c.relevantExp ?? c.totalExp
      const expFit = st.expMid == null || e == null ? 0.5 : Math.max(0, 1 - Math.abs(e - st.expMid) / Math.max(st.expMid, 1))
      return { c, close: Math.round((overlap * 0.7 + expFit * 0.3) * 100) }
    }).sort((a, b) => b.close - a.close).slice(0, 6)
  }, [all, job.ideal, st])

  async function build() {
    setBusy(true); setErr('')
    try {
      const people = sl.slice(0, 12).map((c) => `- ${c.currentRole || 'role n/a'} at ${c.currentCompany || 'n/a'}; ${c.relevantExp ?? c.totalExp ?? '?'} yrs; skills ${c.skills.slice(0, 12).join(', ')}; expects ${c.expectedCtcLpa ?? '?'} LPA; notice ${c.noticeDays ?? '?'} days; ${c.summary}`).join('\n')
      const r = await completeJson<{ summary: string; traits: string[] }>(
        `A recruiter shortlisted these profiles for "${job.title}" (must-have: ${job.mustSkills.join(', ')}).
${people}
Describe the ideal candidate they are converging on, so a sourcer can find more like them.
Return {"summary": string (3 plain sentences: background, what they have done, what sets them apart), "traits": string[] (5-8 short, searchable traits: skills, domains, company types, seniority signals)}`)
      const ideal: IP = { summary: r.summary, traits: r.traits || [], expRange: st.exp, ctcBand: st.ctc, basedOn: sl.map((c) => c.id), createdAt: Date.now() }
      await put('jobs', { ...job, ideal }); toast('Ideal candidate profile saved')
    } catch (e: any) {
      const ideal: IP = { summary: `Built from ${sl.length} shortlisted profiles without AI. They share ${st.common.slice(0, 5).join(', ') || 'no common skills yet'}.`, traits: st.common, expRange: st.exp, ctcBand: st.ctc, basedOn: sl.map((c) => c.id), createdAt: Date.now() }
      await put('jobs', { ...job, ideal }); setErr(`AI unavailable (${e.message}), so the profile was built from the shortlist's numbers only.`)
    } finally { setBusy(false) }
  }

  async function reference(files: FileList | null) {
    if(!files?.length)return
    if(files.length!==1){setErr('Choose exactly one reference resume. Use Profiles for bulk uploads.');return}
    const file=files[0]!
    if(file.size>20*1024*1024){setErr('Choose a resume smaller than 20 MB.');return}
    setReferenceBusy(true);setErr('')
    try{
      const {text}=await extractText(file)
      if(text.trim().length<30)throw new Error('No readable text. Try a text-based PDF or DOCX.')
      const {ex}=await analyse(text,job,getState().config.weights,referenceAi)
      const ideal:IP={summary:ex.summary||`${ex.currentRole || 'Reference profile'}${ex.currentCompany?' at '+ex.currentCompany:''}.`,traits:ex.skills||[],expRange:ex.relevantExp!=null?String(ex.relevantExp):ex.totalExp!=null?String(ex.totalExp):'Not recorded',ctcBand:ex.expectedCtcLpa!=null?String(ex.expectedCtcLpa):'Not recorded',basedOn:[],createdAt:Date.now(),referenceFileName:file.name}
      await put('jobs',{...getState().jobs[job.id]!,ideal});toast('Reference resume saved as the ideal profile. No candidate was added.')
    }catch(e){setErr((e as Error).message)}finally{setReferenceBusy(false)}
  }

  const stale = job.ideal && !job.ideal.referenceFileName && job.ideal.basedOn.length !== sl.length
  return <section className="section">
    <div className="stock stack" style={{padding:20,marginBottom:24}}><h2>Ideal candidate reference — one resume</h2><p className="small muted">Upload a single reference resume to describe the ideal profile. This does not add a candidate or change your shortlist. Upload multiple candidate resumes under Profiles.</p>
    <label className="btn"><Upload size={16}/>{referenceBusy?'Reading reference…':'Choose one reference resume'}<input className="visually-hidden" aria-label="Single ideal candidate resume" type="file" accept={ACCEPT} disabled={referenceBusy || busy} onChange={e=>{reference(e.target.files);e.target.value=''}}/></label>
    <label className="check"><input type="checkbox" checked={referenceAi} onChange={e=>setReferenceAi(e.target.checked)}/>Use AI for the reference profile</label></div>
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="stack">
        {job.ideal ? (
          <div className="ideal stock">
            <div className="row" style={{ justifyContent: 'space-between' }}><h2>Ideal candidate</h2><span className="xs muted">{job.ideal.referenceFileName ? `Reference: ${job.ideal.referenceFileName}` : `From ${job.ideal.basedOn.length} shortlisted`}, {fmtDate(job.ideal.createdAt)}</span></div>
            <p>{job.ideal.summary}</p>
            <dl className="facts">
              <div><dt>Relevant experience</dt><dd className="fig">{job.ideal.expRange} yrs</dd></div>
              <div><dt>Expected CTC band</dt><dd className="fig">{job.ideal.ctcBand} LPA</dd></div>
            </dl>
            <span className="label">Look for</span>
            <div className="chips">{job.ideal.traits.map((t) => <span key={t} className="chip chip--hit">{t}</span>)}</div>
          </div>
        ) : <div className="note">{sl.length} shortlisted. Build the ideal profile from them.</div>}
        <div className="row">
          <Button variant={job.ideal ? 'card' : 'ink'} busy={busy} disabled={!sl.length || referenceBusy} onClick={build}><Sparkles size={14} />{job.ideal ? 'Rebuild from current shortlist' : 'Build ideal profile'}</Button>
          {stale && <span className="xs muted">The shortlist changed since this was built.</span>}
        </div>
        {err && <ErrorBox>{err}</ErrorBox>}
      </div>
      <div className="stack">
        <h2>Closest not yet shortlisted</h2>
        <p className="small muted">Ranked by overlap with the ideal profile's traits and experience, not by the job's match score.</p>
        {closest.length ? <ul className="feed">{closest.map(({ c, close }) => (
          <li key={c.id}><span><button className="linkbtn" onClick={() => openCandidate(c.id)}>{c.name}</button> <span className="kind">{close}% like the ideal</span></span><ScoreCell m={c.match} /></li>))}</ul>
          : <p className="small muted">Everyone else is shortlisted or rejected.</p>}
      </div>
    </div>
  </section>
}
