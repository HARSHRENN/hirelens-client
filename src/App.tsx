import { BarChart3, BriefcaseBusiness, Columns3, CreditCard, LayoutDashboard, LogOut, Menu, MessagesSquare, Settings2, ShieldCheck, UserCheck, Users } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Forgot, Login, Reset, Signup, Verify } from './auth/AuthPages'
import { Mark } from './components/Mark'
import { Button, Empty, PressFilter, Skeleton, ToastHost, useToast } from './components/ui'
import { TopBar } from './components/TopBar'
import { aiStatus } from './lib/ai'
import { adminToken, api, ApiError, loadConfig, setAdminToken, signOut, supa, type Me } from './lib/cloud'
import { MeCtx } from './lib/me'
import { href, useRoute, type Route } from './lib/router'
import { MODE, setMode, TARGET } from './lib/runtime'
import { ensureTemplates, loadSample } from './lib/sample'
import { initStore, onStoreError, useStore } from './lib/store'
import { UiCtx } from './lib/uictx'
import { CandidateDrawer } from './views/CandidateDrawer'
import { Billing } from './views/Billing'
import { Candidates } from './views/Candidates'
import { Dashboard } from './views/Dashboard'
import { JobDetail } from './views/JobDetail'
import { Jobs } from './views/Jobs'
import { Outreach } from './views/Outreach'
import { Panelists } from './views/Panelists'
import { Pipeline } from './views/Pipeline'
import { Settings } from './views/Settings'

const PanelFeedbackPage = lazy(() => import('./views/PanelFeedbackPage'))
const AdminApp = lazy(() => import('./admin/AdminApp'))
const RecruiterAnalytics = lazy(() => import('./admin/RecruiterAnalytics'))

export { Mark }

/* Which page a path is:
 *   /login /signup /verify /forgot /reset   public account pages
 *   /u/<username>#dashboard                 a recruiter's own workspace (signed in)
 *   /admin                                  the platform admin's panel (signed in, admin only)
 *   /demo                                   sample workspace in this browser, no account
 *   the claude.ai preview build             one shared workspace, no account */
export default function App() {
  const path = location.pathname.replace(/\/+$/, '') || '/'
  let page: React.ReactNode
  if (TARGET === 'artifact') { setMode('artifact'); page = <Workspace /> }
  else if (path === '/demo') { setMode('demo'); page = <Workspace /> }
  else if (path === '/feedback') page = <Suspense fallback={<p>Opening feedback…</p>}><PanelFeedbackPage /></Suspense>
  else if (path === '/login') page = <Login />
  else if (path === '/signup') page = <Signup />
  else if (path === '/verify') page = <Verify />
  else if (path === '/forgot') page = <Forgot />
  else if (path === '/reset') page = <Reset />
  else if (path === '/admin') page = <AdminGate />
  else page = <Gate />
  return <ToastHost>{page}</ToastHost>
}

/** Signed-in pages: find the session and the account, then open the workspace or the admin panel. */
function Gate({ admin = false }: { admin?: boolean }) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'setup' } | { kind: 'blocked'; msg: string } | { kind: 'ok'; me: Me }>({ kind: 'loading' })
  const load = useCallback(async () => {
    const cfg = await loadConfig()
    if (!cfg.configured) return setState({ kind: 'setup' })
    const s = await supa()
    const { data } = await s!.auth.getSession()
    if (!data.session) { location.replace(`/login?next=${encodeURIComponent(location.pathname + location.hash)}`); return }
    try {
      const me = await api<Me>('app', 'me')
      setState({ kind: 'ok', me })
      if (!admin) {
        // every recruiter lives at /u/<their username>
        const want = `/u/${me.profile.username}`
        if (location.pathname !== want) history.replaceState(null, '', want + location.hash)
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { await s!.auth.signOut(); location.replace('/login'); return }
      setState({ kind: 'blocked', msg: (e as Error).message })
    }
  }, [admin])
  useEffect(() => {
    load()
    let unsub = () => {}
    supa().then((s) => { const sub = s?.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.replace('/login') }); unsub = () => sub?.data.subscription.unsubscribe() })
    return () => unsub()
  }, [load])
  const refresh = useCallback(async () => { try { setState({ kind: 'ok', me: await api<Me>('app', 'me') }) } catch { /* keep the old one */ } }, [])

  if (state.kind === 'loading') return <div className="boot"><Mark size={34} /><span className="small muted">Opening your workspace…</span></div>
  if (state.kind === 'setup') return <Setup />
  if (state.kind === 'blocked') return <div className="boot"><Mark size={34} /><p className="small" style={{ maxWidth: '44ch', textAlign: 'center' }}>{state.msg}</p><Button variant="ghost" onClick={signOut}>Sign out</Button></div>
  const ctx = { me: state.me, refresh }
  if (admin) {
    if (!state.me.isAdmin) return <div className="boot"><Mark size={34} /><p className="small">This page is for the platform admin.</p><a className="btn" href={`/u/${state.me.profile.username}`}>Open my workspace</a></div>
    return <MeCtx.Provider value={ctx}><Suspense fallback={<div className="boot"><Mark size={34} /></div>}><AdminApp /></Suspense></MeCtx.Provider>
  }
  return <MeCtx.Provider value={ctx}><Workspace me={state.me} /></MeCtx.Provider>
}

/** /admin: its own username and password, independent of recruiter accounts and of the database. */
function AdminGate() {
  const [state, setState] = useState<'checking' | 'login' | 'in'>(adminToken() ? 'checking' : 'login')
  useEffect(() => {
    document.title = 'Admin · HireLens'
    if (state !== 'checking') return
    api('admin', 'whoami').then(() => setState('in')).catch(() => { setAdminToken(''); setState('login') })
  }, [state])
  if (state === 'checking') return <div className="boot"><Mark size={34} /></div>
  if (state === 'login') return <AdminLogin onIn={() => setState('in')} />
  return <MeCtx.Provider value={{ me: null, refresh: async () => {} }}><Suspense fallback={<div className="boot"><Mark size={34} /></div>}><AdminApp /></Suspense></MeCtx.Provider>
}

function AdminLogin({ onIn }: { onIn: () => void }) {
  const [u, setU] = useState('admin')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return <div className="auth auth--solo"><main className="auth-main"><div className="auth-card">
    <span className="wordmark auth-mark-sm" style={{ display: 'flex' }}><Mark size={26} />Admin</span>
    <h1>Platform admin</h1>
    <p className="auth-sub">Keys, plans, recruiters and invoices for the whole platform.</p>
    <form className="auth-form" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr('')
      try { const { token } = await api<{ token: string }>('admin', 'login', { username: u, password: pw }); setAdminToken(token); onIn() }
      catch (x: any) { setErr(x.message) } finally { setBusy(false) }
    }}>
      <label className="field"><span className="label">Username</span><input className="input" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} /></label>
      <label className="field"><span className="label">Password</span><input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
      {err && <div className="auth-notice auth-notice--error" role="alert">{err}</div>}
      <Button type="submit" variant="ink" busy={busy} disabled={!u || !pw}>Sign in</Button>
    </form>
  </div><p className="auth-foot"><a href="/">Back to the site</a></p></main></div>
}

function Setup() {
  return <div className="boot boot--wide">
    <Mark size={34} />
    <h1 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>Accounts aren't switched on yet</h1>
    <p className="small" style={{ maxWidth: '58ch', textAlign: 'center' }}>The database still has to be connected. In Vercel: project → Storage → Create Database → Supabase (free) → connect it to this project, then redeploy. Sign-up, login and workspaces work from then on.</p>
    <a className="btn btn--ink" href="/demo">Try the demo meanwhile</a>
  </div>
}

const NAV: { r: Route; label: string; icon: typeof Users }[] = [
  { r: { name: 'dashboard' }, label: 'Dashboard', icon: LayoutDashboard },
  { r: { name: 'recruiter-analytics' }, label: 'Recruiter Analytics', icon: BarChart3 },
  { r: { name: 'jobs' }, label: 'Jobs', icon: BriefcaseBusiness },
  { r: { name: 'candidates' }, label: 'Tracker', icon: Users },
  { r: { name: 'pipeline' }, label: 'Pipeline', icon: Columns3 },
  { r: { name: 'outreach' }, label: 'Outreach', icon: MessagesSquare },
  { r: { name: 'panelists' }, label: 'Panelists', icon: UserCheck },
  { r: { name: 'billing' }, label: 'Billing', icon: CreditCard },
  { r: { name: 'settings' }, label: 'Settings', icon: Settings2 },
]

/** One recruiter's workspace (or the demo / preview workspace). */
function Workspace({ me }: { me?: Me }) {
  const route = useRoute()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [cand, setCand] = useState<string | null>(null)
  const ready = useStore((s) => s.ready)
  const backend = useStore((s) => s.backend)
  const offline = useStore((s) => s.offline)
  const cfg = useStore((s) => s.config)
  const nJobs = useStore((s) => Object.values(s.jobs).filter((j) => j.status === 'open').length)
  const nCands = useStore((s) => Object.keys(s.candidates).length)
  const [ai, setAi] = useState<{ ok: boolean; via: string } | null>(null)
  const mode = MODE()
  const canViewAnalytics = mode === 'demo' || (mode === 'cloud' && !!me?.isAdmin)
  const trialLeft = me ? me.trialEnd - Date.now() : 0

  useEffect(() => {
    onStoreError((m) => toast(m, { kind: 'error' }))
    initStore({ userId: me?.profile.id }).catch((e) => toast(e.message, { kind: 'error' }))
  }, [toast, me?.profile.id])
  useEffect(() => {
    if (MODE() === 'demo') {
      const refreshDemo = (event: StorageEvent) => { if (event.key === 'hl-demo-data-v1') initStore().catch(() => {}) }
      window.addEventListener('storage', refreshDemo)
      return () => window.removeEventListener('storage', refreshDemo)
    }
    if (MODE() !== 'cloud' || !me?.profile.id) return
    let pending = false
    const refresh = async () => {
      if (pending || document.visibilityState !== 'visible') return
      pending = true
      try { await initStore({ userId: me.profile.id }) } catch { /* keep the current data until the next refresh */ }
      finally { pending = false }
    }
    const timer = window.setInterval(refresh, 10_000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [me?.profile.id])
  useEffect(() => {
    if (!ready || offline) return
    ensureTemplates()
    // the demo opens filled with sample data the first time
    if (mode === 'demo') {
      let seeded = true
      try { seeded = !!localStorage.getItem('hl-demo-seeded') } catch { /* storage blocked */ }
      if (!seeded) { try { localStorage.setItem('hl-demo-seeded', '1') } catch { /* ignore */ } loadSample() }
    }
  }, [ready, offline]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { aiStatus().then(setAi) }, [])
  useEffect(() => { setOpen(false) }, [route])
  useEffect(() => { document.title = `${titleOf(route)} · ${me ? me.productName : cfg.productName}` }, [route, cfg.productName, me])

  const ctx = useMemo(() => ({ openCandidate: setCand }), [])
  const active = (r: Route) => r.name === route.name || (r.name === 'jobs' && route.name === 'job')
  const name = me?.productName || cfg.productName

  return (
    <UiCtx.Provider value={ctx}>
      <PressFilter />
      {mode === 'demo' && <div className="demo-bar" role="note">Demo workspace: sample data in this browser only, with a few AI reads a day. <a href="/signup">Start your free trial</a> to save your work and use AI fully.</div>}
      <div className="shell">
        {open && <div className="scrim" onClick={() => setOpen(false)} />}
        <nav className="rail" data-open={open} aria-label="Main">
          <a className="wordmark" href="#dashboard" aria-label={`${name} home`}><Mark />{name}</a>
          <div className="nav">
            {NAV.filter(({ r }) => r.name !== 'recruiter-analytics' || canViewAnalytics).map(({ r, label, icon: I }) => (
              <a key={r.name} href={href(r)} aria-current={active(r) ? 'page' : undefined}>
                <I size={16} aria-hidden />{label}
                {r.name === 'jobs' && nJobs > 0 && <span className="count">{nJobs}</span>}
                {r.name === 'candidates' && nCands > 0 && <span className="count">{nCands}</span>}
                {r.name === 'billing' && me && trialLeft > 0 && <span className="count">{Math.ceil(trialLeft / 864e5)}d trial</span>}
              </a>
            ))}
            {me?.isAdmin && <a href="/admin"><ShieldCheck size={16} aria-hidden />Platform admin</a>}
          </div>
          <div className="rail-foot">
            {me && <div className="me-card"><b>{me.profile.full_name}</b><span>/u/{me.profile.username}</span></div>}
            <div className="status-line"><b>Data</b><span>{backend === 'cloud' ? (offline ? 'not reachable' : 'saved to your account') : backend === 'db' ? (offline ? 'shared, reconnecting' : 'shared with your team') : backend === 'local' ? 'this browser only' : 'connecting'}</span></div>
            <div className="status-line"><b>AI</b><span>{ai ? ai.via : 'checking'}</span></div>
            {me && <button type="button" className="linkbtn small signout" onClick={signOut}><LogOut size={13} aria-hidden /> Sign out</button>}
            {mode === 'demo' && <a className="small" href="/login">Log in</a>}
          </div>
        </nav>
        <div className="main">
          <header className="topbar">
            <button type="button" className="btn btn--ghost btn--icon menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={18} /></button>
            <div id="topbar-slot" style={{ display: 'contents' }} />
          </header>
          <main className="page" id="main">
            {!ready && route.name !== 'billing' && route.name !== 'settings' ? <Skeleton rows={6} /> : <>
              {route.name === 'dashboard' && <Dashboard />}
              {route.name === 'recruiter-analytics' && <>
                <TopBar title="Recruiter Analytics" actions={<a className="btn" href="#dashboard">Back to dashboard</a>} />
                {canViewAnalytics ? <Suspense fallback={<Skeleton rows={6} />}><RecruiterAnalytics demo={mode === 'demo'} /></Suspense>
                  : <Empty title="Admin access required">Recruiter comparisons are available to workspace admins.</Empty>}
              </>}
              {route.name === 'jobs' && <Jobs />}
              {route.name === 'job' && <JobDetail id={route.id} tab={route.tab} />}
              {route.name === 'candidates' && <Candidates />}
              {route.name === 'pipeline' && <Pipeline />}
              {route.name === 'outreach' && <Outreach />}
              {route.name === 'panelists' && <Panelists />}
              {route.name === 'billing' && <Billing />}
              {route.name === 'settings' && <Settings />}
            </>}
          </main>
        </div>
      </div>
      {cand && <CandidateDrawer id={cand} onClose={() => setCand(null)} />}
    </UiCtx.Provider>
  )
}

const titleOf = (r: Route) => ({ dashboard: 'Dashboard', 'recruiter-analytics': 'Recruiter Analytics', jobs: 'Jobs', job: 'Job', candidates: 'Tracker', pipeline: 'Pipeline', outreach: 'Outreach', settings: 'Settings', panelists: 'Panelists', billing: 'Billing' })[r.name]
