import { ArrowRight, Check, Mail, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Mark } from '../components/Mark'
import { Button, Field, Input } from '../components/ui'
import { api, loadConfig, supa, type Me } from '../lib/cloud'

/* The public pages: sign up, log in, confirm email, forgot and reset password.
 * Sign-in itself runs through Supabase in the browser; account creation and the
 * emails go through /api/auth so they use the platform's own email sender. */

const go = (path: string) => { location.href = path }
const params = () => new URLSearchParams(location.search)

/** After a session exists: land in the right place. */
export async function landAfterSignIn() {
  const next = params().get('next')
  try {
    const me = await api<Me>('app', 'me')
    if (next && /^\/(u\/|admin)/.test(next)) return go(next)
    go(me.isAdmin && !next ? '/admin' : `/u/${me.profile.username}`)
  } catch { go('/login') }
}

function Shell({ title, sub, children, foot }: { title: string; sub?: ReactNode; children: ReactNode; foot?: ReactNode }) {
  const [name, setName] = useState('HireLens')
  useEffect(() => { loadConfig().then((c) => c.productName && setName(c.productName)); document.title = `${title} · HireLens` }, [title])
  const here = location.pathname
  return <div className="auth">
    <header className="auth-top">
      <a className="wordmark" href="/"><Mark size={28} />{name}</a>
      <nav className="auth-nav" aria-label="Site">
        <a href="/demo">Demo</a>
        {here !== '/login' && <a href="/login">Log in</a>}
        {here !== '/signup' && <a className="btn btn--ink btn--sm" href="/signup">Start free trial</a>}
      </nav>
    </header>
    <main className="auth-main">
      <div className="auth-card">
        <h1>{title}</h1>
        {sub && <p className="auth-sub">{sub}</p>}
        {children}
      </div>
      {foot && <p className="auth-foot">{foot}</p>}
      <ul className="auth-points" aria-label="What you get">
        <li><Check size={14} />Resume reading and match % for every JD</li>
        <li><Check size={14} />Tracker, panel interviews, client-ready resumes</li>
        <li><Check size={14} />Interview invites and reminders emailed for you</li>
      </ul>
    </main>
    <footer className="auth-bottom">Built by AlphacodeAI, Mumbai</footer>
  </div>
}

function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  return <div className={`auth-notice auth-notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
}

function useNotConfigured() {
  const [off, setOff] = useState(false)
  useEffect(() => { loadConfig().then((c) => setOff(!c.configured)) }, [])
  return off
}
const OffNotice = () => <Notice kind="error">Accounts are not switched on yet: the database still has to be connected. You can <a href="/demo">try the demo</a> meanwhile.</Notice>

/* ---------------- log in ---------------- */
export function Login() {
  const [email, setEmail] = useState(params().get('email') || '')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [resent, setResent] = useState(false)
  const off = useNotConfigured()
  const verified = params().get('verified')

  useEffect(() => { supa().then(async (s) => { const { data } = (await s?.auth.getSession()) || { data: { session: null } }; if (data.session) landAfterSignIn() }) }, [])

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setUnconfirmed(false); setBusy(true)
    const s = await supa()
    if (!s) { setBusy(false); return setErr('Accounts are not switched on yet.') }
    const { error } = await s.auth.signInWithPassword({ email: email.trim(), password: pw })
    if (error) {
      setBusy(false)
      if (/confirm/i.test(error.message)) { setUnconfirmed(true); return setErr('Confirm your email first. We sent you a link when you signed up.') }
      return setErr(/invalid/i.test(error.message) ? 'That email and password don\'t match an account.' : error.message)
    }
    await landAfterSignIn()
  }

  return <Shell title="Log in" sub="Welcome back. Your workspace is where you left it." foot={<>New here? <a href="/signup">Start a free trial</a> · <a href="/demo">Try the demo</a></>}>
    {off && <OffNotice />}
    {verified && <Notice kind="ok">Email confirmed. Log in to open your workspace.</Notice>}
    <form className="auth-form" onSubmit={submit} noValidate>
      <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Password"><Input type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <a className="small" href={`/forgot${email ? `?email=${encodeURIComponent(email)}` : ''}`}>Forgot password?</a>
      </div>
      {err && <Notice kind="error">{err}{unconfirmed && !resent && <> <button type="button" className="linkbtn" onClick={async () => { await api('auth', 'resend-verification', { email }).catch(() => {}); setResent(true) }}>Send the link again</button></>}{resent && ' A new link is on its way.'}</Notice>}
      <Button type="submit" variant="ink" busy={busy} disabled={!email || !pw}>Log in<ArrowRight size={16} /></Button>
    </form>
  </Shell>
}

/* ---------------- sign up ---------------- */
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30)

export function Signup() {
  const [f, setF] = useState({ fullName: '', company: '', email: '', phone: '', username: '', password: '' })
  const [touchedUser, setTouchedUser] = useState(false)
  const [avail, setAvail] = useState<null | { available: boolean; valid: boolean }>(null)
  const [agree, setAgree] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<null | { verify: boolean }>(null)
  const timer = useRef<number>(undefined)
  const off = useNotConfigured()
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))

  // suggest a username from the name until the person edits it
  useEffect(() => { if (!touchedUser) set({ username: slug(f.fullName.split(' ')[0] + (f.company ? '-' + f.company.split(' ')[0] : '')) }) }, [f.fullName, f.company, touchedUser])
  useEffect(() => {
    setAvail(null); clearTimeout(timer.current)
    if (f.username.length < 3) return
    timer.current = window.setTimeout(() => { api<{ available: boolean; valid: boolean }>('auth', 'check-username', { username: f.username }).then(setAvail).catch(() => {}) }, 350)
  }, [f.username])

  const pwOk = f.password.length >= 8
  const ok = f.fullName.trim() && /\S+@\S+\.\S+/.test(f.email) && f.username.length >= 3 && avail?.available !== false && pwOk && agree

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const r = await api<{ verify: boolean }>('auth', 'signup', f)
      if (!r.verify) {
        const s = await supa()
        const { error } = await s!.auth.signInWithPassword({ email: f.email.trim(), password: f.password })
        if (!error) return landAfterSignIn()
      }
      setDone(r)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  if (done) return <Shell title="Check your inbox" sub={<>We sent a confirmation link to <b>{f.email}</b>. Open it to start your free trial.</>} foot={<><a href="/login">Back to log in</a></>}>
    <div className="auth-sent"><Mail size={28} aria-hidden /><p className="small">The link works once and expires in 24 hours. Nothing there? Check spam, or <ResendLink email={f.email} />.</p></div>
  </Shell>

  return <Shell title="Start your free trial" sub="Your own workspace in a minute. No card needed." foot={<>Have an account? <a href="/login">Log in</a> · <a href="/demo">Try the demo first</a></>}>
    {off && <OffNotice />}
    <form className="auth-form" onSubmit={submit} noValidate>
      <div className="form-grid">
        <Field label="Full name"><Input autoComplete="name" required value={f.fullName} onChange={(e) => set({ fullName: e.target.value })} /></Field>
        <Field label="Company or agency"><Input autoComplete="organization" value={f.company} onChange={(e) => set({ company: e.target.value })} /></Field>
      </div>
      <Field label="Work email"><Input type="email" autoComplete="email" required value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
      <Field label="Phone" hint="Optional"><Input type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
      <Field label="Username" hint={<span className={avail ? (avail.available ? 'ok-text' : 'err-text') : ''}>
        {f.username.length < 3 ? 'At least 3 characters: letters, numbers, hyphens' : !avail ? `Your workspace: ${location.host}/u/${f.username}` : avail.available ? <><Check size={12} /> {location.host}/u/{f.username} is yours</> : <><X size={12} /> {avail.valid ? 'Taken. Try another.' : 'That name is reserved.'}</>}
      </span>}>
        <Input autoComplete="username" required value={f.username} onChange={(e) => { setTouchedUser(true); set({ username: slug(e.target.value) }) }} />
      </Field>
      <Field label="Password" hint={f.password && !pwOk ? <span className="err-text">At least 8 characters</span> : 'At least 8 characters'}><Input type="password" autoComplete="new-password" required value={f.password} onChange={(e) => set({ password: e.target.value })} /></Field>
      <label className="row small auth-agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> <span>I agree to the terms of use and to HireLens storing the candidate data I upload for my hiring.</span></label>
      {err && <Notice kind="error">{err}</Notice>}
      <Button type="submit" variant="ink" busy={busy} disabled={!ok || off}>Create my workspace<ArrowRight size={16} /></Button>
    </form>
  </Shell>
}

function ResendLink({ email }: { email: string }) {
  const [state, setState] = useState<'' | 'busy' | 'sent'>('')
  if (state === 'sent') return <>a new link is on its way</>
  return <button type="button" className="linkbtn" disabled={state === 'busy'} onClick={async () => { setState('busy'); await api('auth', 'resend-verification', { email }).catch(() => {}); setState('sent') }}>send it again</button>
}

/* ---------------- confirm email (link from the email) ---------------- */
export function Verify() {
  const [err, setErr] = useState('')
  useEffect(() => {
    const p = params(); const token_hash = p.get('token_hash'); const type = (p.get('type') || 'signup') as any
    if (!token_hash) { setErr('This link is incomplete. Open it straight from the email.'); return }
    supa().then(async (s) => {
      if (!s) return setErr('Accounts are not switched on yet.')
      const { error } = await s.auth.verifyOtp({ token_hash, type })
      if (error) return setErr(/expired|invalid/i.test(error.message) ? 'This link has expired or was already used. Log in, or ask for a new link.' : error.message)
      await landAfterSignIn()
    })
  }, [])
  return <Shell title={err ? 'Link not valid' : 'Confirming your email'} foot={<a href="/login">Go to log in</a>}>
    {err ? <Notice kind="error">{err}</Notice> : <p className="small muted">One moment…</p>}
  </Shell>
}

/* ---------------- forgot password ---------------- */
export function Forgot() {
  const [email, setEmail] = useState(params().get('email') || '')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  return <Shell title="Reset your password" sub="We'll email you a link to set a new one." foot={<a href="/login">Back to log in</a>}>
    {sent ? <Notice kind="ok">If an account uses <b>{email}</b>, a reset link is on its way. It works once and expires in an hour.</Notice>
      : <form className="auth-form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(''); try { await api('auth', 'forgot', { email }); setSent(true) } catch (x: any) { setErr(x.message) } finally { setBusy(false) } }}>
        <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {err && <Notice kind="error">{err}</Notice>}
        <Button type="submit" variant="ink" busy={busy} disabled={!/\S+@\S+\.\S+/.test(email)}>Email me a link</Button>
      </form>}
  </Shell>
}

/* ---------------- set a new password (link from the email) ---------------- */
export function Reset() {
  const [stage, setStage] = useState<'checking' | 'ready' | 'bad'>('checking')
  const [err, setErr] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const token_hash = params().get('token_hash')
    if (!token_hash) { setStage('bad'); setErr('This link is incomplete. Open it straight from the email.'); return }
    supa().then(async (s) => {
      if (!s) { setStage('bad'); return setErr('Accounts are not switched on yet.') }
      const { error } = await s.auth.verifyOtp({ token_hash, type: 'recovery' })
      if (error) { setStage('bad'); setErr('This link has expired or was already used. Ask for a new one.') } else setStage('ready')
    })
  }, [])
  return <Shell title="Set a new password" foot={<a href="/login">Back to log in</a>}>
    {stage === 'checking' && <p className="small muted">Checking your link…</p>}
    {stage === 'bad' && <><Notice kind="error">{err}</Notice><p className="small"><a href="/forgot">Send a new link</a></p></>}
    {stage === 'ready' && <form className="auth-form" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr('')
      const s = await supa(); const { error } = await s!.auth.updateUser({ password: pw })
      if (error) { setBusy(false); return setErr(error.message) }
      await landAfterSignIn()
    }}>
      <Field label="New password" hint="At least 8 characters"><Input type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      {err && <Notice kind="error">{err}</Notice>}
      <Button type="submit" variant="ink" busy={busy} disabled={pw.length < 8}>Save and log in</Button>
    </form>}
  </Shell>
}
