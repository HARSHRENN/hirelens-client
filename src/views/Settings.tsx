import { LogOut, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { Button, Dialog, Field, Input, Select, useToast } from '../components/ui'
import { api, signOut, supaSync } from '../lib/cloud'
import { copy, saveFile } from '../lib/integrations'
import { rescore } from '../lib/match'
import { useMe } from '../lib/me'
import { MODE } from '../lib/runtime'
import { loadSample } from '../lib/sample'
import { exportAll, getState, importAll, put, setConfig, useStore, wipeAll } from '../lib/store'
import type { MatchBreakdown } from '../lib/types'
import { BandsEditor, LevelsEditor } from './WorkspaceEditors'

const WLABEL: Record<keyof MatchBreakdown, string> = { skills: 'Skills', experience: 'Experience', ctc: 'CTC fit', location: 'Location', notice: 'Notice period' }
const ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney']

/** A recruiter's own workspace settings. Platform keys live with the admin, not here. */
export function Settings() {
  const cfg = useStore((s) => s.config)
  const backend = useStore((s) => s.backend)
  const { me } = useMe()
  const [w, setW] = useState(cfg.weights)
  const [cut, setCut] = useState(cfg.shortlistAt)
  const [wipe, setWipe] = useState(false)
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

  return <>
    <TopBar title="Settings" actions={MODE() === 'cloud' ? <Button variant="ghost" onClick={signOut}><LogOut size={15} />Sign out</Button> : undefined} />
    {me && <Account />}

    <section className="section" aria-labelledby="h-ws">
      <div className="section-head"><h2 id="h-ws">Workspace</h2><p>Used in messages, emails and job posts</p></div>
      <div className="form-grid">
        <Field label="Company name" hint="Signs templates as {{company}}"><Input autoComplete="organization" defaultValue={cfg.companyName} onBlur={(e) => e.target.value !== cfg.companyName && setConfig({ companyName: e.target.value.trim() })} /></Field>
        <Field label="Recruiter name" hint="Signs templates as {{recruiter}}"><Input autoComplete="name" defaultValue={cfg.recruiterName} onBlur={(e) => e.target.value !== cfg.recruiterName && setConfig({ recruiterName: e.target.value.trim() })} /></Field>
        <Field label="Careers or apply link" hint="Added to every job post"><Input type="url" inputMode="url" defaultValue={cfg.careersUrl} onBlur={(e) => e.target.value !== cfg.careersUrl && setConfig({ careersUrl: e.target.value.trim() })} /></Field>
        <Field label="Time zone" hint="Reminder emails go out on the morning of the interview in this zone"><Select value={cfg.timezone} onChange={(e) => setConfig({ timezone: e.target.value })} options={ZONES.map((z) => ({ value: z, label: z.replace('_', ' ') }))} /></Field>
        <Field label="Automation webhook" hint="Zapier, Make or n8n. Receives job posts so they can be auto-posted to LinkedIn, Instagram, X and Facebook." className="span-2"><Input type="url" inputMode="url" placeholder="https://hooks.zapier.com/…" defaultValue={cfg.webhookUrl} onBlur={(e) => e.target.value !== cfg.webhookUrl && setConfig({ webhookUrl: e.target.value.trim() })} /></Field>
      </div>
    </section>

    <section className="section" aria-labelledby="h-auto">
      <div className="section-head"><h2 id="h-auto">Automatic emails</h2><p>{MODE() !== 'cloud' ? 'Available in a signed-in workspace' : me?.emailReady ? 'Sent from the platform, with your email as reply-to' : 'Email is not switched on for the platform yet'}</p></div>
      <div className="stack">
        <label className="row small"><input type="checkbox" checked={cfg.autoInvites} onChange={(e) => setConfig({ autoInvites: e.target.checked })} /> <span><b>Interview invite</b>: when you schedule a round, email the candidate the time and Meet link with a calendar invite, and CC the panel.</span></label>
        <label className="row small"><input type="checkbox" checked={cfg.autoReminders} onChange={(e) => setConfig({ autoReminders: e.target.checked })} /> <span><b>Morning reminder</b>: on the day of the interview, email the candidate a reminder at about 8 am. Uses your "Interview reminder" email template.</span></label>
        <p className="xs muted" style={{ margin: 0 }}>Invoices for your plan are emailed to your billing address automatically.</p>
      </div>
    </section>

    <LevelsEditor />
    <BandsEditor />

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

    <section className="section" aria-labelledby="h-data">
      <div className="section-head"><h2 id="h-data">Data</h2><p>{backend === 'cloud' ? 'Saved to your account; only you can see it' : backend === 'db' ? 'Shared with everyone you share this app with' : 'Demo data, saved in this browser only'}</p></div>
      <div className="row">
        <Button onClick={async () => { const r = await saveFile(`hirelens-backup-${new Date().toISOString().slice(0, 10)}.json`, exportAll(), 'application/json'); if (r !== 'saved') toast((await copy(exportAll())) ? 'Downloads are blocked here, so the backup was copied to your clipboard' : 'Export blocked in this view') }}>Export backup</Button>
        <label className="btn"><Upload size={14} />Import backup<input type="file" accept=".json,application/json" className="visually-hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { await importAll(await f.text()); toast('Backup imported') } catch { toast('That file is not a valid backup', { kind: 'error' }) } e.target.value = '' }} /></label>
        <Button onClick={async () => { await loadSample(); toast('Sample jobs and profiles added') }}>Add sample data</Button>
        <Button variant="danger" onClick={() => setWipe(true)}>Delete all data</Button>
      </div>
    </section>
    {wipe && <Dialog title="Delete every job and profile?" onClose={() => setWipe(false)} footer={<><Button variant="ghost" onClick={() => setWipe(false)}>Keep my data</Button><Button variant="ink" onClick={async () => { await wipeAll(); setWipe(false); toast('All data deleted') }}>Delete everything</Button></>}>
      <p className="small">This removes all jobs, candidates, remarks, panelists and templates in this workspace. Export a backup first if you might need it. Your account, settings and invoices stay.</p>
    </Dialog>}
  </>
}

function Account() {
  const { me, refresh } = useMe()
  const p = me!.profile
  const [f, setF] = useState({ full_name: p.full_name, company: p.company, phone: p.phone })
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState<'' | 'profile' | 'pw'>('')
  const toast = useToast()
  return <section className="section" aria-labelledby="h-acct">
    <div className="section-head"><h2 id="h-acct">Your account</h2><p>{p.email} · /u/{p.username}</p></div>
    <div className="form-grid">
      <Field label="Full name"><Input autoComplete="name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
      <Field label="Company"><Input autoComplete="organization" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
      <Field label="Phone"><Input type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      <div className="row" style={{ alignItems: 'end' }}><Button busy={busy === 'profile'} onClick={async () => {
        setBusy('profile')
        try { await api('app', 'update-profile', f); await refresh(); toast('Account saved') } catch (e: any) { toast(e.message, { kind: 'error' }) } finally { setBusy('') }
      }}>Save account</Button></div>
      <Field label="New password" hint="At least 8 characters"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <div className="row" style={{ alignItems: 'end' }}><Button disabled={pw.length < 8} busy={busy === 'pw'} onClick={async () => {
        setBusy('pw')
        const { error } = await supaSync()!.auth.updateUser({ password: pw })
        setBusy(''); if (error) toast(error.message, { kind: 'error' }); else { setPw(''); toast('Password changed') }
      }}>Change password</Button></div>
    </div>
  </section>
}
