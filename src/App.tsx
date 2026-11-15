import { BriefcaseBusiness, Columns3, LayoutDashboard, Menu, MessagesSquare, Receipt, Settings2, UserCheck, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CandidateDrawer } from './views/CandidateDrawer'
import { PressFilter, ToastHost, useToast } from './components/ui'
import { aiStatus } from './lib/ai'
import { href, useRoute, type Route } from './lib/router'
import { ensureTemplates, loadSample } from './lib/sample'
import { TARGET } from './lib/runtime'
import { getState, initStore, onStoreError, setMe, useStore, wipeAll } from './lib/store'
import { ensureBilling } from './lib/billing'
import { Billing } from './views/Billing'
import { Panelists } from './views/Panelists'
import { Admin } from './views/Admin'
import { Candidates } from './views/Candidates'
import { Dashboard } from './views/Dashboard'
import { JobDetail } from './views/JobDetail'
import { Jobs } from './views/Jobs'
import { Outreach } from './views/Outreach'
import { Pipeline } from './views/Pipeline'
import { UiCtx } from './lib/uictx'

const NAV: { r: Route; label: string; icon: typeof Users }[] = [
  { r: { name: 'dashboard' }, label: 'Dashboard', icon: LayoutDashboard },
  { r: { name: 'jobs' }, label: 'Jobs', icon: BriefcaseBusiness },
  { r: { name: 'candidates' }, label: 'Tracker', icon: Users },
  { r: { name: 'pipeline' }, label: 'Pipeline', icon: Columns3 },
  { r: { name: 'outreach' }, label: 'Outreach', icon: MessagesSquare },
  { r: { name: 'panelists' }, label: 'Panelists', icon: UserCheck },
  { r: { name: 'admin' }, label: 'Admin', icon: Settings2 },
  { r: { name: 'billing' }, label: 'Billing', icon: Receipt },
]
const ADMIN_ONLY = new Set(['admin', 'billing'])

export default function App() {
  return <ToastHost><Shell /></ToastHost>
}

function Shell() {
  const route = useRoute()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [cand, setCand] = useState<string | null>(null)
  const ready = useStore((s) => s.ready)
  const backend = useStore((s) => s.backend)
  const offline = useStore((s) => s.offline)
  const cfg = useStore((s) => s.config)
  const secrets = useStore((s) => s.secrets)
  const nJobs = useStore((s) => Object.values(s.jobs).filter((j) => j.status === 'open').length)
  const nCands = useStore((s) => Object.keys(s.candidates).length)
  const me = useStore((s) => s.me)
  const trialEnds = useStore((s) => s.config.billing.trialStart + s.config.billing.trialDays * 864e5)
  const trialLeft = trialEnds - Date.now()
  const [ai, setAi] = useState<{ ok: boolean; via: string } | null>(null)

  useEffect(() => { onStoreError((m) => toast(m, { kind: 'error' })); initStore() }, [toast])
  useEffect(() => {
    if (!ready || offline) return
    ensureTemplates()
    // the deployed demo starts filled: sample jobs and profiles on first visit (Admin → Delete all data clears them for good)
    let seeded = true, v1 = false
    try { seeded = !!localStorage.getItem('hl-seeded-v2'); v1 = !!localStorage.getItem('hl-seeded') } catch { /* storage blocked */ }
    if (TARGET !== 'web' || seeded) return
    try { localStorage.setItem('hl-seeded-v2', '1'); localStorage.setItem('hl-seeded', '1') } catch { /* ignore */ }
    const st = getState()
    const cs = Object.values(st.candidates), js = Object.values(st.jobs)
    // replace the first demo set with the current one, but only when nothing real has been added
    const onlyDemo = cs.every((c) => /\.demo@example\.com$/.test(c.email)) && js.every((j) => /^Example /.test(j.client || ''))
    if (!js.length && !cs.length && !v1) loadSample()
    else if (v1 && onlyDemo && (js.length || cs.length)) wipeAll().then(async () => { await loadSample(); await ensureTemplates() })
  }, [ready, offline]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { aiStatus().then(setAi) }, [secrets.aiProvider])
  useEffect(() => { if (ready && !offline) ensureBilling() }, [ready, offline])
  useEffect(() => { setOpen(false) }, [route])
  useEffect(() => { document.title = `${cfg.productName} · ${titleOf(route)}` }, [route, cfg.productName])

  const ctx = useMemo(() => ({ openCandidate: setCand }), [])
  const active = (r: Route) => r.name === route.name || (r.name === 'jobs' && route.name === 'job')

  return (
    <UiCtx.Provider value={ctx}>
      <PressFilter />
      <div className="shell">
        {open && <div className="scrim" onClick={() => setOpen(false)} />}
        <nav className="rail" data-open={open} aria-label="Main">
          <a className="wordmark" href="#dashboard" aria-label={`${cfg.productName} home`}>
            <Mark />
            {cfg.productName}
          </a>
          <div className="nav">
            {NAV.filter(({ r }) => me === 'admin' || !ADMIN_ONLY.has(r.name)).map(({ r, label, icon: I }) => (
              <a key={r.name} href={href(r)} aria-current={active(r) ? 'page' : undefined}>
                <I size={16} aria-hidden />{label}
                {r.name === 'jobs' && nJobs > 0 && <span className="count">{nJobs}</span>}
                {r.name === 'candidates' && nCands > 0 && <span className="count">{nCands}</span>}
                {r.name === 'billing' && trialLeft > 0 && <span className="count">trial</span>}
              </a>
            ))}
          </div>
          <div className="rail-foot">
            <label className="me-switch">Working as
              <select className="select" value={me} onChange={(e) => setMe(e.target.value)}>
                <option value="admin">Super admin</option>
                {cfg.recruiters.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <div className="status-line"><b>Data</b><span>{backend === 'db' ? (offline ? 'shared, reconnecting' : 'shared with your team') : backend === 'local' ? 'saved in this browser' : 'connecting'}</span></div>
            <div className="status-line"><b>AI</b><span>{ai ? ai.via : 'checking'}</span></div>
            <div>{cfg.companyName}</div>
          </div>
        </nav>
        <div className="main">
          <header className="topbar">
            <button type="button" className="btn btn--ghost btn--icon menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={18} /></button>
            <div id="topbar-slot" style={{ display: 'contents' }} />
          </header>
          <main className="page" id="main">
            {route.name === 'dashboard' && <Dashboard />}
            {route.name === 'jobs' && <Jobs />}
            {route.name === 'job' && <JobDetail id={route.id} tab={route.tab} />}
            {route.name === 'candidates' && <Candidates />}
            {route.name === 'pipeline' && <Pipeline />}
            {route.name === 'outreach' && <Outreach />}
            {route.name === 'admin' && <Admin />}
            {route.name === 'panelists' && <Panelists />}
            {route.name === 'billing' && (me === 'admin' ? <Billing /> : <p className="small">Billing is for the super admin. Switch “Working as” in the sidebar.</p>)}
          </main>
        </div>
      </div>
      {cand && <CandidateDrawer id={cand} onClose={() => setCand(null)} />}
    </UiCtx.Provider>
  )
}

const titleOf = (r: Route) => ({ dashboard: 'Dashboard', jobs: 'Jobs', job: 'Job', candidates: 'Tracker', pipeline: 'Pipeline', outreach: 'Outreach', admin: 'Admin', panelists: 'Panelists', billing: 'Billing' })[r.name]

export function Mark({ size = 26 }: { size?: number }) {
  return <svg className="wordmark-mark" width={size} height={size} viewBox="0 0 26 26" aria-hidden>
    <rect x="0" y="0" width="16" height="26" rx="5" fill="var(--color-ink)" />
    <circle cx="8" cy="9" r="4" fill="var(--color-paper)" />
    <rect x="18" y="0" width="8" height="12" rx="3" fill="var(--blue-500)" />
    <rect x="18" y="14" width="8" height="12" rx="3" fill="var(--color-accent)" />
  </svg>
}
