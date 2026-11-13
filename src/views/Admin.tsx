import { Eye, EyeOff, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { Button, Dialog, Field, Input, Select, useToast } from '../components/ui'
import { aiStatus, complete } from '../lib/ai'
import { copy, saveFile } from '../lib/integrations'
import { TARGET } from '../lib/runtime'
import { loadSample } from '../lib/sample'
import { exportAll, getState, importAll, setConfig, setSecrets, useStore, wipeAll } from '../lib/store'
import type { MatchBreakdown, Secrets } from '../lib/types'
import { rescore } from '../lib/match'
import { put } from '../lib/store'

const WLABEL: Record<keyof MatchBreakdown, string> = { skills: 'Skills', experience: 'Experience', ctc: 'CTC fit', location: 'Location', notice: 'Notice period' }

export function Admin() {
  const cfg = useStore((s) => s.config)
  const secrets = useStore((s) => s.secrets)
  const backend = useStore((s) => s.backend)
  const [w, setW] = useState(cfg.weights)
  const [cut, setCut] = useState(cfg.shortlistAt)
  const [wipe, setWipe] = useState(false)
  const [test, setTest] = useState<{ busy: boolean; msg: string; ok?: boolean }>({ busy: false, msg: '' })
  const toast = useToast()
  useEffect(() => { setW(cfg.weights); setCut(cfg.shortlistAt) }, [cfg.weights, cfg.shortlistAt])

  const total = Object.values(w).reduce((a, b) => a + b, 0)
  async function saveWeights() {
    const norm = Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / (total || 1)])) as unknown as MatchBreakdown
    await setConfig({ weights: norm, shortlistAt: cut })
    const st = getState()
    for (const c of Object.values(st.candidates)) { const j = st.jobs[c.jobId]; if (j) await put('candidates', rescore(c, j, norm)) }
    toast('Weights saved and every profile re-scored')
  }

  async function testAi() {
    setTest({ busy: true, msg: '' })
    try { const t = await complete('Reply with exactly: ready', { quick: true }); setTest({ busy: false, ok: true, msg: `Connected. The model replied “${t.trim().slice(0, 40)}”.` }) }
    catch (e: any) { setTest({ busy: false, ok: false, msg: e.message }) }
  }

  const keyNote = TARGET === 'artifact'
    ? 'This preview runs AI through Claude and saves data for your team automatically. Keys you enter here are kept in this browser and take effect on the deployed app, where the server can call WhatsApp, email, Maps and other AI providers.'
    : 'Keys stay in this browser and travel only to this app\'s own server routes, which forward them to the provider. Leave a field blank to use the key set on the server instead.'

  return <>
    <TopBar title="Admin" />
    <section className="section" aria-labelledby="h-ws">
      <div className="section-head"><h2 id="h-ws">Workspace</h2></div>
      <div className="form-grid">
        <Field label="Product name" hint="Shown in the sidebar"><Input defaultValue={cfg.productName} onBlur={(e) => e.target.value.trim() && e.target.value !== cfg.productName && setConfig({ productName: e.target.value.trim() })} /></Field>
        <Field label="Company name" hint="Used in messages and job posts"><Input autoComplete="organization" defaultValue={cfg.companyName} onBlur={(e) => e.target.value !== cfg.companyName && setConfig({ companyName: e.target.value.trim() })} /></Field>
        <Field label="Recruiter name" hint="Signs WhatsApp and email templates"><Input autoComplete="name" defaultValue={cfg.recruiterName} onBlur={(e) => e.target.value !== cfg.recruiterName && setConfig({ recruiterName: e.target.value.trim() })} /></Field>
        <Field label="Careers or apply link" hint="Added to every job post"><Input type="url" inputMode="url" defaultValue={cfg.careersUrl} onBlur={(e) => e.target.value !== cfg.careersUrl && setConfig({ careersUrl: e.target.value.trim() })} /></Field>
      </div>
    </section>

    <section className="section" aria-labelledby="h-match">
      <div className="section-head"><h2 id="h-match">How the match percentage is weighed</h2><p>Each part scores 0 to 100%; these weights add them up</p></div>
      <div className="grid-2">
        <div className="stack">
          {(Object.keys(WLABEL) as (keyof MatchBreakdown)[]).map((k) => (
            <label key={k} className="part" style={{ gridTemplateColumns: '8rem minmax(0,1fr) 3.5rem' }}>
              <span>{WLABEL[k]}</span>
              <input type="range" min={0} max={1} step={0.05} value={w[k]} onChange={(e) => setW({ ...w, [k]: +e.target.value })} style={{ accentColor: 'var(--color-accent-2)' }} />
              <span className="fig" style={{ textAlign: 'right' }}>{Math.round((w[k] / (total || 1)) * 100)}%</span>
            </label>
          ))}
        </div>
        <div className="stack">
          <Field label="Shortlist at" hint="Profiles at or above this score are shortlisted when they arrive"><Input type="number" min={0} max={100} value={cut} onChange={(e) => setCut(+e.target.value)} /></Field>
          <div><Button variant="ink" onClick={saveWeights}>Save and re-score everyone</Button></div>
        </div>
      </div>
    </section>

    <section className="section" aria-labelledby="h-keys">
      <div className="section-head"><h2 id="h-keys">API keys</h2></div>
      <p className="small muted" style={{ maxWidth: '75ch' }}>{keyNote}</p>
      <div className="form-grid">
        <Field label="AI provider" hint="Reads resumes, writes JDs, summarises calls, translates">
          <Select value={secrets.aiProvider} onChange={(e) => setSecrets({ aiProvider: e.target.value as Secrets['aiProvider'] })} options={[
            { value: 'openai', label: 'OpenAI (your key)' },
            { value: 'builtin', label: TARGET === 'artifact' ? 'Claude (built in)' : 'Server default key' },
            { value: 'anthropic', label: 'Anthropic Claude (your key)' }, { value: 'gemini', label: 'Google Gemini (your key)' }]} />
        </Field>
        <Field label="Model" hint="Optional. OpenAI default is gpt-5.6-terra (gpt-5.6-luna for quick tasks); use gpt-5.6-sol for the strongest reads"><Input value={secrets.aiModel} onChange={(e) => setSecrets({ aiModel: e.target.value.trim() })} placeholder="Provider default" /></Field>
        {secrets.aiProvider === 'anthropic' && <Secret label="Anthropic API key" k="anthropicKey" placeholder="sk-ant-…" />}
        {secrets.aiProvider === 'openai' && <Secret label="OpenAI API key" k="openaiKey" placeholder="sk-…" />}
        {secrets.aiProvider === 'gemini' && <Secret label="Gemini API key" k="geminiKey" placeholder="AIza…" />}
        <div className="span-2 row"><Button busy={test.busy} onClick={testAi}>Test AI connection</Button>{test.msg && <span className="small" style={{ color: test.ok ? 'var(--color-success)' : 'var(--color-error)' }}>{test.msg}</span>}<AiLine /></div>

        <Secret label="Google Maps API key" k="googleMapsKey" hint="Geocoding API. Places any address. Major Indian cities and areas of Mumbai, Pune, Bengaluru, Hyderabad, Chennai and NCR work without it." placeholder="AIza…" />
        <Secret label="Automation webhook URL" k="webhookUrl" hint="Zapier, Make or n8n. Receives job posts for auto-posting to LinkedIn, Instagram, X and Facebook." placeholder="https://hooks.zapier.com/…" plain />
        <Secret label="WhatsApp phone number ID" k="waPhoneNumberId" hint="Meta WhatsApp Cloud API, from your Business app" plain />
        <Secret label="WhatsApp access token" k="waToken" hint="A permanent system-user token" placeholder="EAAG…" />
        <Secret label="Resend API key" k="resendKey" hint="Sends email from your domain" placeholder="re_…" />
        <Field label="Send email from" hint="An address on a domain verified in Resend"><Input type="email" value={secrets.emailFrom} onChange={(e) => setSecrets({ emailFrom: e.target.value.trim() })} placeholder="Hiring <hiring@example.com>" /></Field>
        {TARGET === 'web' && <Field label="API base URL" hint="Leave blank when the API runs on this same site"><Input type="url" value={secrets.apiBase} onChange={(e) => setSecrets({ apiBase: e.target.value.trim().replace(/\/$/, '') })} /></Field>}
      </div>
    </section>

    <section className="section" aria-labelledby="h-data">
      <div className="section-head"><h2 id="h-data">Data</h2><p>{backend === 'db' ? 'Shared with everyone you share this app with' : 'Saved in this browser. Export regularly, or connect a database before going live.'}</p></div>
      <div className="row">
        <Button onClick={async () => { const r = await saveFile(`hirelens-backup-${new Date().toISOString().slice(0, 10)}.json`, exportAll(), 'application/json'); if (r !== 'saved') toast((await copy(exportAll())) ? 'Downloads are blocked here, so the backup was copied to your clipboard' : 'Export blocked in this view') }}>Export backup</Button>
        <label className="btn"><Upload size={14} />Import backup<input type="file" accept=".json,application/json" className="visually-hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { await importAll(await f.text()); toast('Backup imported') } catch { toast('That file is not a valid backup', { kind: 'error' }) } e.target.value = '' }} /></label>
        <Button onClick={async () => { await loadSample(); toast('Sample jobs and profiles added') }}>Add sample data</Button>
        <Button variant="danger" onClick={() => setWipe(true)}>Delete all data</Button>
      </div>
    </section>
    {wipe && <Dialog title="Delete every job and profile?" onClose={() => setWipe(false)} footer={<><Button variant="ghost" onClick={() => setWipe(false)}>Keep my data</Button><Button variant="ink" onClick={async () => { await wipeAll(); setWipe(false); toast('All data deleted') }}>Delete everything</Button></>}>
      <p className="small">This removes all jobs, candidates, remarks and templates{backend === 'db' ? ' for everyone on your team' : ' from this browser'}. Export a backup first if you might need it. API keys and settings stay.</p>
    </Dialog>}
  </>
}

// keys pasted from dashboards often carry spaces, line breaks, quotes or a "Bearer " prefix
export const cleanKey = (v: string) => v.replace(/["'`\u200b-\u200d\ufeff]/g, '').trim().replace(/^bearer\s+/i, '').replace(/\s/g, '')

function Secret({ label, k, hint, placeholder, plain }: { label: string; k: keyof Secrets; hint?: string; placeholder?: string; plain?: boolean }) {
  const v = useStore((s) => s.secrets[k]) as string
  const [show, setShow] = useState(false)
  const masked = v && !plain ? `Saved in this browser: ${v.slice(0, 8)}…${v.slice(-4)} (${v.length} characters)` : v ? 'Saved in this browser' : 'Not set'
  return <Field label={label} hint={hint ? <>{hint}<br />{masked}</> : masked}>
    <div className="secret-row">
      {/* a text field masked with CSS, so browser password managers do not autofill over the key */}
      <Input type="text" name={`hl-${k}`} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        data-1p-ignore="true" data-lpignore="true" data-form-type="other"
        style={!plain && !show ? ({ WebkitTextSecurity: 'disc' } as React.CSSProperties) : undefined}
        value={v} placeholder={placeholder} onChange={(e) => setSecrets({ [k]: plain ? e.target.value.trim() : cleanKey(e.target.value) } as Partial<Secrets>)} />
      {!plain && <Button variant="ghost" icon aria-label={show ? `Hide ${label}` : `Show ${label}`} onClick={() => setShow(!show)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</Button>}
    </div>
  </Field>
}

function AiLine() {
  const p = useStore((s) => s.secrets.aiProvider)
  const [s, setS] = useState('')
  useEffect(() => { aiStatus().then((x) => setS(x.via)) }, [p])
  return <span className="xs muted">Now: {s}</span>
}


