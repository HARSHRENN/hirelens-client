import { Languages, Mic, Square, Sparkles, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, ErrorBox, Select, Textarea, useToast } from '../components/ui'
import { complete, completeJson } from '../lib/ai'
import { TARGET } from '../lib/runtime'
import { saveFile } from '../lib/integrations'
import { put } from '../lib/store'
import type { Job } from '../lib/types'
import { debounce, fmtDate } from '../lib/util'

const LANGS = ['English', 'Hindi', 'Marathi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Bengali', 'Malayalam', 'Punjabi', 'Odia', 'Assamese', 'Urdu', 'Sanskrit', 'Konkani', 'German', 'French', 'Mandarin Chinese', 'Spanish', 'Arabic', 'Portuguese', 'Bahasa Indonesia', 'Russian', 'Italian', 'Polish', 'Romanian', 'Dutch']

/* The calibration call with the hiring manager: take notes (or live captions where the
 * browser allows the mic), record the call, summarise into requirements, translate. */
export function Calibration({ job }: { job: Job }) {
  const [notes, setNotes] = useState(job.calibration?.notes || '')
  const [busy, setBusy] = useState<'' | 'sum' | 'tr' | 'apply'>('')
  const [err, setErr] = useState('')
  const [lang, setLang] = useState(job.calibration?.translation?.lang || 'Hindi')
  const [listening, setListening] = useState(false)
  const [recording, setRecording] = useState(false)
  const [suggest, setSuggest] = useState<null | { mustSkills: string[]; niceSkills: string[]; expMin: number | null; expMax: number | null; ctcMaxLpa: number | null; noticeMaxDays: number | null }>(null)
  const recRef = useRef<any>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const jobRef = useRef(job); jobRef.current = job
  const toast = useToast()

  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  const micAllowed = TARGET === 'web' && !!navigator.mediaDevices?.getUserMedia

  const persist = useRef(debounce((text: string) => {
    const j = jobRef.current
    put('jobs', { ...j, calibration: { ...(j.calibration || {}), notes: text, updatedAt: Date.now() } })
  }, 900)).current
  useEffect(() => () => { recRef.current?.stop?.(); mediaRef.current?.stop() }, [])

  function onNotes(v: string) { setNotes(v); persist(v) }

  function toggleCaptions() {
    if (listening) { recRef.current?.stop(); setListening(false); return }
    const r = new SR(); r.lang = 'en-IN'; r.continuous = true; r.interimResults = false
    r.onresult = (e: any) => { const t = [...e.results].slice(e.resultIndex).map((x: any) => x[0].transcript).join(' '); setNotes((n) => { const v = (n ? n + '\n' : '') + t.trim(); persist(v); return v }) }
    r.onerror = (e: any) => { setErr(`Captions stopped: ${e.error}`); setListening(false) }
    r.onend = () => setListening(false)
    r.start(); recRef.current = r; setListening(true)
  }

  async function toggleRecord() {
    if (recording) { mediaRef.current?.stop(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const m = new MediaRecorder(stream); chunks.current = []
      m.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      m.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); setRecording(false)
        const blob = new Blob(chunks.current, { type: m.mimeType || 'audio/webm' })
        await saveFile(`calibration-${job.title.replace(/\W+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.webm`, blob, blob.type)
        toast('Recording saved to your downloads')
      }
      m.start(); mediaRef.current = m; setRecording(true)
    } catch (e: any) { setErr(`Microphone unavailable: ${e.message}`) }
  }

  async function summarise() {
    if (notes.trim().length < 30) { setErr('Add the call notes or transcript first.'); return }
    setBusy('sum'); setErr('')
    try {
      const r = await completeJson<{ summary: string; mustSkills: string[]; niceSkills: string[]; expMin: number | null; expMax: number | null; ctcMaxLpa: number | null; noticeMaxDays: number | null }>(
        `These are notes or a transcript from a requirement-calibration call between a recruiter and a hiring manager for "${job.title}". The notes may mix English with Hindi or other Indian languages.
Current requirement: ${job.expMin}-${job.expMax} yrs, budget ${job.ctcMaxLpa} LPA, notice ${job.noticeMaxDays} days, must-have ${job.mustSkills.join(', ')}, nice ${job.niceSkills.join(', ')}.
NOTES:
${notes.slice(0, 12000)}
Return {"summary": string (in English, 4-7 short lines starting with "- ": what the manager really wants, deal-breakers, interview process, anything that changes the requirement),
"mustSkills": string[], "niceSkills": string[], "expMin": number|null, "expMax": number|null, "ctcMaxLpa": number|null, "noticeMaxDays": number|null}
Only change a requirement field when the notes clearly say so; otherwise repeat the current value.`)
      await put('jobs', { ...job, calibration: { ...(job.calibration || { notes }), notes, summary: r.summary, updatedAt: Date.now() } })
      const changed = r.mustSkills?.join() !== job.mustSkills.join() || r.niceSkills?.join() !== job.niceSkills.join() || r.expMin !== job.expMin || r.expMax !== job.expMax || r.ctcMaxLpa !== job.ctcMaxLpa || r.noticeMaxDays !== job.noticeMaxDays
      setSuggest(changed ? r : null)
    } catch (e: any) { setErr(e.message) } finally { setBusy('') }
  }

  async function translate() {
    const src = job.calibration?.summary || notes
    if (src.trim().length < 10) { setErr('Nothing to translate yet.'); return }
    setBusy('tr'); setErr('')
    try {
      const text = await complete(`Translate into ${lang}, keeping skill names, numbers and company names as they are. Output only the translation.\n\n${src}`)
      await put('jobs', { ...job, calibration: { ...(job.calibration || { notes }), notes, translation: { lang, text: text.trim() }, updatedAt: Date.now() } })
    } catch (e: any) { setErr(e.message) } finally { setBusy('') }
  }

  async function applySuggest() {
    if (!suggest) return
    setBusy('apply')
    await put('jobs', { ...job, mustSkills: suggest.mustSkills?.length ? suggest.mustSkills : job.mustSkills, niceSkills: suggest.niceSkills || job.niceSkills, expMin: suggest.expMin ?? job.expMin, expMax: suggest.expMax ?? job.expMax, ctcMaxLpa: suggest.ctcMaxLpa ?? job.ctcMaxLpa, noticeMaxDays: suggest.noticeMaxDays ?? job.noticeMaxDays })
    setSuggest(null); setBusy(''); toast('Requirement updated. Re-score the profiles to apply it.')
  }

  return <section className="section">
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="label">Call notes or transcript</span>
          <div className="row">
            {micAllowed && SR && <Button size="sm" onClick={toggleCaptions}>{listening ? <><Square size={12} />Stop captions</> : <><Mic size={14} />Live captions</>}</Button>}
            {micAllowed && <Button size="sm" onClick={toggleRecord}>{recording ? <><Square size={12} />Stop and save recording</> : <><Mic size={14} />Record call</>}</Button>}
            <label className="btn btn--sm btn--ghost"><Upload size={14} />Load transcript<input type="file" accept=".txt,.vtt,.srt,.md" className="visually-hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) onNotes((notes ? notes + '\n\n' : '') + (await f.text()).replace(/^\d+\n|\d\d:\d\d:\d\d[.,]\d+ --> .*\n/gm, '')); e.target.value = '' }} /></label>
          </div>
        </div>
        <Textarea aria-label="Call notes" rows={16} value={notes} onChange={(e) => onNotes(e.target.value)} placeholder="Type while you talk to the hiring manager, or load the transcript Google Meet saves to Drive (Meet's own recording and transcripts need a Workspace plan that includes them). Hindi, Marathi and mixed-language notes are fine." />
        {!micAllowed && <p className="xs muted">Live captions and call recording use the microphone, which this preview cannot reach. They work on the deployed app in Chrome.</p>}
        <div className="row"><Button variant="ink" busy={busy === 'sum'} onClick={summarise}><Sparkles size={14} />Summarise into requirement</Button><span className="xs muted">{job.calibration?.updatedAt ? `Saved ${fmtDate(job.calibration.updatedAt, true)}` : ''}</span></div>
        {err && <ErrorBox>{err}</ErrorBox>}
      </div>
      <div className="stack">
        <span className="label">What the manager wants</span>
        {job.calibration?.summary ? <div className="preview-msg stock">{job.calibration.summary}</div> : <p className="small muted">The summary appears here, with any change to skills, experience, budget or notice it implies.</p>}
        {suggest && <div className="note stack">
          <b style={{ fontWeight: 500 }}>The call changes the requirement</b>
          <span className="small">Must-have: {suggest.mustSkills.join(', ')}<br />Nice-to-have: {suggest.niceSkills.join(', ')}<br />Experience {suggest.expMin ?? job.expMin}–{suggest.expMax ?? job.expMax} yrs, budget {suggest.ctcMaxLpa ?? job.ctcMaxLpa} LPA, notice {suggest.noticeMaxDays ?? job.noticeMaxDays} days</span>
          <div className="row"><Button size="sm" variant="ink" busy={busy === 'apply'} onClick={applySuggest}>Apply to job</Button><Button size="sm" variant="ghost" onClick={() => setSuggest(null)}>Keep current</Button></div>
        </div>}
        <div className="row" style={{ marginTop: 'var(--space-md)' }}>
          <div style={{ width: 240 }}><Select aria-label="Translate to" value={lang} onChange={(e) => setLang(e.target.value)} options={LANGS.map((l) => ({ value: l, label: l }))} /></div>
          <Button busy={busy === 'tr'} onClick={translate}><Languages size={14} />Translate</Button>
        </div>
        {job.calibration?.translation && <div className="preview-msg stock" lang={job.calibration.translation.lang === 'English' ? 'en' : undefined}><span className="xs muted">{job.calibration.translation.lang}</span>{'\n'}{job.calibration.translation.text}</div>}
      </div>
    </div>
  </section>
}
