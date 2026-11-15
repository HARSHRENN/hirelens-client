import { BarChart3, Database, Download, KeyRound, LogOut, Mail, Receipt, Search, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Mark } from '../components/Mark'
import { Button, ErrorBox, Field, Input, Select, Skeleton, useToast } from '../components/ui'
import { fmtDay, fromRow, inr, invoicePdf, totalOf } from '../lib/billing'
import { api, signOut } from '../lib/cloud'
import { saveFile } from '../lib/integrations'
import { useMe } from '../lib/me'

/* The platform admin's panel. One admin sets the keys for the whole platform and
 * sees every recruiter's numbers, trials and invoices. Recruiters never see this. */

interface Stats { jobs: number; candidates: number; shortlisted: number; selected: number; offered: number; joined: number; declined: number; rejected: number; hold: number; interviews: number; panelists: number; last_change: string | null }
interface User { id: string; username: string; full_name: string; company: string; phone: string; email: string; role: string; status: 'active' | 'suspended'; trial_start: string; trial_days: number; created_at: string; last_seen: string | null; isAdmin: boolean; trialEnd: number; stats: Partial<Stats>; due: number }
interface Settings {
  productName: string; aiProvider: string; aiModel: string; emailFrom: string; replyTo: string
  openaiKeySet: boolean; openaiKeyHint: string; anthropicKeySet: boolean; anthropicKeyHint: string; geminiKeySet: boolean; geminiKeyHint: string; resendKeySet: boolean; resendKeyHint: string
  trialDays: number; planName: string; price: number; taxPct: number; seller: { name: string; address: string; gstin: string }
  emailDailyLimit: number; emailMonthlyLimit: number; userEmailDailyLimit: number; aiDailyLimit: number
}
interface Overview {
  settings: Settings; users: User[]; invoices: Record<string, any>[]; cronSecret: boolean
  usage: { emailsToday: number; emailsMonth: number; aiToday: number; aiMonth: number; failedToday: number; recent: { kind: string; detail: string; ok: boolean; error: string | null; at: string }[] }
}

type Tab = 'overview' | 'users' | 'invoices' | 'settings' | 'system'
const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'users', label: 'Recruiters', icon: Users },
  { id: 'invoices', label: 'Invoices', icon: Receipt },
  { id: 'settings', label: 'Keys and plan', icon: KeyRound },
  { id: 'system', label: 'System', icon: Database },
]
const tabFromHash = (): Tab => (TABS.find((t) => `#${t.id}` === location.hash)?.id || 'overview')
const D = 864e5
const ago = (t?: string | null) => { if (!t) return 'never'; const m = (Date.now() - Date.parse(t)) / 6e4; return m < 60 ? `${Math.max(1, Math.round(m))} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago` }

export default function AdminApp() {
  const { me } = useMe()
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const [data, setData] = useState<Overview | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => { setErr(''); api<Overview>('admin', 'overview').then(setData).catch((e) => setErr(e.message)) }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { const f = () => setTab(tabFromHash()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f) }, [])
  useEffect(() => { document.title = `${TABS.find((t) => t.id === tab)!.label} · Admin` }, [tab])

  return <div className="shell admin-shell">
    <nav className="rail" aria-label="Admin">
      <a className="wordmark" href="#overview"><Mark />Admin</a>
      <div className="nav">
        {TABS.map(({ id, label, icon: I }) => <a key={id} href={`#${id}`} aria-current={tab === id ? 'page' : undefined}><I size={16} aria-hidden />{label}
          {id === 'users' && data && <span className="count">{data.users.length}</span>}</a>)}
      </div>
      <div className="rail-foot">
        {me && <div className="me-card"><b>{me.profile.full_name}</b><span>Platform admin</span></div>}
        {me && <a className="small" href={`/u/${me.profile.username}`}>Open my workspace</a>}
        <button type="button" className="linkbtn small signout" onClick={signOut}><LogOut size={13} aria-hidden /> Sign out</button>
      </div>
    </nav>
    <div className="main">
      <header className="topbar"><h1>{TABS.find((t) => t.id === tab)!.label}</h1><span className="spacer" /><Button variant="ghost" onClick={load}>Refresh</Button></header>
      <main className="page">
        {err ? <ErrorBox onRetry={load}>{err}</ErrorBox> : !data ? <Skeleton rows={6} /> : <>
          {tab === 'overview' && <OverviewTab d={data} />}
          {tab === 'users' && <UsersTab d={data} reload={load} />}
          {tab === 'invoices' && <InvoicesTab d={data} reload={load} />}
          {tab === 'settings' && <SettingsTab d={data} reload={load} />}
          {tab === 'system' && <SystemTab d={data} reload={load} />}
        </>}
      </main>
    </div>
  </div>
}

/* ---------------- overview ---------------- */
function OverviewTab({ d }: { d: Overview }) {
  const s = d.settings, u = d.usage
  const hr = d.users.filter((x) => !x.isAdmin)
  const now = Date.now()
  const onTrial = hr.filter((x) => x.trialEnd > now).length
  const active7 = hr.filter((x) => x.last_seen && now - Date.parse(x.last_seen) < 7 * D).length
  const inv = d.invoices.map(fromRow)
  const due = inv.filter((i) => i.status === 'due').reduce((a, i) => a + totalOf(i), 0)
  const paid = inv.filter((i) => i.status === 'paid').reduce((a, i) => a + totalOf(i), 0)
  const tot = (k: keyof Stats) => hr.reduce((a, x) => a + Number(x.stats[k] || 0), 0)
  const ready = [
    { ok: s.openaiKeySet || s.anthropicKeySet || s.geminiKeySet, label: 'AI key', fix: 'Keys and plan' },
    { ok: s.resendKeySet && !!s.emailFrom, label: 'Email (Resend)', fix: 'Keys and plan' },
    { ok: d.cronSecret, label: 'Cron secret', fix: 'System' },
  ]
  return <>
    {ready.some((r) => !r.ok) && <div className="setup-list" role="note"><b>To finish setting up:</b> {ready.filter((r) => !r.ok).map((r) => <span key={r.label} className="setup-chip">{r.label} <a href={`#${r.fix === 'System' ? 'system' : 'settings'}`}>set up</a></span>)}</div>}
    <section className="stats" aria-label="Platform totals">
      <div className="stat"><span className="v">{hr.length}</span><span className="k">Recruiters</span></div>
      <div className="stat"><span className="v">{onTrial}</span><span className="k">On free trial</span></div>
      <div className="stat"><span className="v">{active7}</span><span className="k">Active in 7 days</span></div>
      <div className="stat"><span className="v">{inr(due).replace(/\.00$/, '')}</span><span className="k">INR due</span></div>
      <div className="stat"><span className="v">{inr(paid).replace(/\.00$/, '')}</span><span className="k">INR paid</span></div>
    </section>
    <section className="section" aria-labelledby="h-funnel">
      <div className="section-head"><h2 id="h-funnel">Hiring across all recruiters</h2><p>Every workspace, all time</p></div>
      <section className="stats">
        {([['candidates', 'Screened'], ['shortlisted', 'Shortlisted'], ['interviews', 'Interviews'], ['selected', 'Selected'], ['offered', 'Offered'], ['joined', 'Joined'], ['declined', 'Declined'], ['rejected', 'Rejected']] as [keyof Stats, string][]).map(([k, l]) =>
          <div className="stat" key={k}><span className="v">{tot(k)}</span><span className="k">{l}</span></div>)}
      </section>
    </section>
    <section className="section" aria-labelledby="h-usage">
      <div className="section-head"><h2 id="h-usage">Usage against free limits</h2><p>Resend free plan: 100 emails a day, 3,000 a month</p></div>
      <div className="usage-grid">
        <Meter label="Emails today" n={u.emailsToday} of={s.emailDailyLimit} />
        <Meter label="Emails this month" n={u.emailsMonth} of={s.emailMonthlyLimit} />
        <Meter label="AI reads today" n={u.aiToday} />
        <Meter label="AI reads this month" n={u.aiMonth} />
      </div>
      {u.failedToday > 0 && <p className="small" style={{ color: 'var(--color-error)' }}>{u.failedToday} email{u.failedToday > 1 ? 's' : ''} failed today. See System for details.</p>}
    </section>
  </>
}

function Meter({ label, n, of }: { label: string; n: number; of?: number }) {
  const pct = of ? Math.min(100, (n / of) * 100) : 0
  return <div className="meter">
    <div className="row" style={{ justifyContent: 'space-between' }}><span className="small">{label}</span><span className="fig small"><b>{n}</b>{of ? ` / ${of}` : ''}</span></div>
    {of ? <div className="trial-bar" role="meter" aria-valuemin={0} aria-valuemax={of} aria-valuenow={n} aria-label={label} data-warn={pct > 80 || undefined}><i style={{ transform: `scaleX(${pct / 100})` }} /></div> : null}
  </div>
}

/* ---------------- recruiters ---------------- */
function UsersTab({ d, reload }: { d: Overview; reload: () => void }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const toast = useToast()
  const rows = useMemo(() => d.users.filter((u) => !q || `${u.full_name} ${u.email} ${u.username} ${u.company}`.toLowerCase().includes(q.toLowerCase())), [d.users, q])
  const act = async (id: string, action: string, body: Record<string, unknown>, msg: string) => {
    setBusy(id + action)
    try { await api('admin', action, { id, ...body }); toast(msg); reload() } catch (e: any) { toast(e.message, { kind: 'error' }) } finally { setBusy('') }
  }
  const now = Date.now()
  return <>
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <label className="search" style={{ minWidth: 280 }}><Search size={15} aria-hidden /><input className="input" placeholder="Name, email, username, company" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search recruiters" /></label>
      <span className="small muted">{rows.length} of {d.users.length}</span>
    </div>
    <div className="table-wrap"><table className="table table--stack kpi-table">
      <thead><tr><th>Recruiter</th><th>Plan</th><th className="num">Jobs</th><th className="num">Screened</th><th className="num">Shortlisted</th><th className="num">Interviews</th><th className="num">Selected</th><th className="num">Rejected</th><th className="num">Offered</th><th className="num">Joined</th><th className="num">Declined</th><th className="num">Due (INR)</th><th>Last active</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
      <tbody>{rows.map((u) => {
        const left = u.trialEnd - now
        return <tr key={u.id} style={{ opacity: u.status === 'suspended' ? 0.55 : 1 }}>
          <td><div className="who"><b>{u.full_name}{u.isAdmin && <span className="xs muted"> · admin</span>}</b><span>{u.email}</span><span className="xs muted">/u/{u.username}{u.company ? ` · ${u.company}` : ''}</span></div></td>
          <td data-label="Plan" className="small">{left > 0 ? `Trial, ${Math.ceil(left / D)}d left` : `Trial ended ${fmtDay(u.trialEnd)}`}{u.status === 'suspended' && <><br /><b style={{ color: 'var(--color-error)' }}>Suspended</b></>}</td>
          {(['jobs', 'candidates', 'shortlisted', 'interviews', 'selected', 'rejected', 'offered', 'joined', 'declined'] as (keyof Stats)[]).map((k) => <td key={k} className="num" data-label={k}>{Number(u.stats[k] || 0)}</td>)}
          <td className="num" data-label="Due">{u.due ? inr(u.due) : '—'}</td>
          <td data-label="Last active" className="small">{ago(u.last_seen)}</td>
          <td><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
            {!u.isAdmin && <Button size="sm" variant="ghost" busy={busy === u.id + 'user-trial'} onClick={() => act(u.id, 'user-trial', { trialDays: u.trial_days + 7 }, `Trial extended for ${u.full_name}`)}>+7 days</Button>}
            {!u.isAdmin && <Button size="sm" variant={u.status === 'active' ? 'ghost' : 'card'} busy={busy === u.id + 'user-status'} onClick={() => act(u.id, 'user-status', { status: u.status === 'active' ? 'suspended' : 'active' }, u.status === 'active' ? `${u.full_name} suspended` : `${u.full_name} reactivated`)}>{u.status === 'active' ? 'Suspend' : 'Reactivate'}</Button>}
          </div></td>
        </tr>
      })}</tbody>
    </table></div>
    <p className="xs muted">Numbers are each recruiter's own workspace. Selected counts everyone who reached Selected, including those later offered, joined or declined. Suspended accounts can't sign in to their workspace; their data stays.</p>
  </>
}

/* ---------------- invoices ---------------- */
function InvoicesTab({ d, reload }: { d: Overview; reload: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const users = Object.fromEntries(d.users.map((u) => [u.id, u]))
  const set = async (id: string, status: string) => { try { await api('admin', 'invoice-status', { id, status }); toast(`Marked ${status}`); reload() } catch (e: any) { toast(e.message, { kind: 'error' }) } }
  return <>
    <div className="row">
      <Button busy={busy === 'run'} onClick={async () => { setBusy('run'); try { const r = await api<{ made: number }>('admin', 'run-billing'); toast(r.made ? `${r.made} invoice${r.made > 1 ? 's' : ''} raised` : 'Nothing due right now'); reload() } catch (e: any) { toast(e.message, { kind: 'error' }) } finally { setBusy('') } }}>Raise due invoices now</Button>
      <span className="small muted">The daily job does this at 8 am IST: the first invoice when a trial ends, then one a month.</span>
    </div>
    {d.invoices.length ? <div className="table-wrap"><table className="table table--stack">
      <thead><tr><th>Invoice</th><th>Recruiter</th><th>Period</th><th className="num">Final (INR)</th><th>Emailed</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
      <tbody>{d.invoices.map((r) => {
        const inv = fromRow(r); const u = users[r.owner]
        return <tr key={r.id}>
          <td><div className="who"><b className="fig">{inv.number}</b><span>{fmtDay(inv.issuedAt)}</span></div></td>
          <td data-label="Recruiter"><div className="who"><b>{u?.full_name || 'Deleted account'}</b><span>{inv.buyer.email}</span></div></td>
          <td data-label="Period" className="small">{inv.description.replace(`${inv.planName}, `, '')}</td>
          <td className="num" data-label="Final"><b>{inr(totalOf(inv))}</b></td>
          <td data-label="Emailed" className="small">{inv.emailedAt ? fmtDay(inv.emailedAt) : 'not yet'}</td>
          <td data-label="Status"><div style={{ width: 110 }}><Select aria-label={`Status of ${inv.number}`} value={inv.status} onChange={(e) => set(r.id, e.target.value)} options={[{ value: 'due', label: 'Due' }, { value: 'paid', label: 'Paid' }, { value: 'void', label: 'Void' }]} /></div></td>
          <td><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
            <Button variant="ghost" icon aria-label={`Download ${inv.number}`} onClick={() => saveFile(`${inv.number.replace(/\//g, '-')}.pdf`, invoicePdf(inv), 'application/pdf')}><Download size={15} /></Button>
            <Button variant="ghost" icon aria-label={`Email ${inv.number} again`} busy={busy === r.id} onClick={async () => { setBusy(r.id); try { await api('admin', 'invoice-email', { id: r.id }); toast(`Sent to ${inv.buyer.email}`); reload() } catch (e: any) { toast(e.message, { kind: 'error' }) } finally { setBusy('') } }}><Mail size={15} /></Button>
          </div></td>
        </tr>
      })}</tbody>
    </table></div> : <p className="small muted">No invoices yet. The first one is raised when a recruiter's trial ends.</p>}
  </>
}

/* ---------------- keys and plan ---------------- */
function SettingsTab({ d, reload }: { d: Overview; reload: () => void }) {
  const s = d.settings
  const [f, setF] = useState({ ...s, openaiKey: '', anthropicKey: '', geminiKey: '', resendKey: '' })
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ k: string; ok: boolean; t: string } | null>(null)
  const toast = useToast()
  useEffect(() => { setF({ ...d.settings, openaiKey: '', anthropicKey: '', geminiKey: '', resendKey: '' }) }, [d.settings])
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }))
  async function save(keys: (keyof typeof f)[], label: string) {
    setBusy(label)
    try {
      const patch = Object.fromEntries(keys.map((k) => [k, f[k]]))
      await api('admin', 'save-settings', { patch }); toast(`${label} saved`); reload()
    } catch (e: any) { toast(e.message, { kind: 'error' }) } finally { setBusy('') }
  }
  const keyField = (k: 'openaiKey' | 'anthropicKey' | 'geminiKey' | 'resendKey', label: string, ph: string) => {
    const isSet = s[`${k}Set` as const] as boolean, hint = s[`${k}Hint` as const] as string
    return <Field label={label} hint={isSet ? `Saved on the server: ${hint}. Paste a new key to replace it.` : 'Not set'}>
      <Input type="text" name={`hl-${k}`} autoComplete="off" autoCorrect="off" spellCheck={false} data-1p-ignore="true" data-lpignore="true" style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
        value={f[k]} placeholder={isSet ? '••••••••  (unchanged)' : ph} onChange={(e) => set({ [k]: e.target.value } as any)} />
    </Field>
  }
  const test = async (k: string, fn: () => Promise<string>) => { setBusy(k); setMsg(null); try { setMsg({ k, ok: true, t: await fn() }) } catch (e: any) { setMsg({ k, ok: false, t: e.message }) } finally { setBusy('') } }
  const aiKey = f.aiProvider === 'anthropic' ? 'anthropicKey' : f.aiProvider === 'gemini' ? 'geminiKey' : 'openaiKey'

  return <>
    <p className="small muted" style={{ maxWidth: '72ch' }}>These keys power every recruiter's workspace. They are stored on the server and never sent to any browser, including this one: you see only a fingerprint.</p>
    <section className="section" aria-labelledby="h-ai">
      <div className="section-head"><h2 id="h-ai">AI</h2><p>Reads resumes, writes JDs, summarises calls, translates</p></div>
      <div className="form-grid">
        <Field label="Provider"><Select value={f.aiProvider} onChange={(e) => set({ aiProvider: e.target.value })} options={[{ value: 'openai', label: 'OpenAI' }, { value: 'anthropic', label: 'Anthropic Claude' }, { value: 'gemini', label: 'Google Gemini' }]} /></Field>
        <Field label="Model" hint="Optional. OpenAI default gpt-5.6-terra, with gpt-5.6-luna for quick tasks"><Input value={f.aiModel} onChange={(e) => set({ aiModel: e.target.value.trim() })} placeholder="Provider default" /></Field>
        {keyField(aiKey, `${f.aiProvider === 'anthropic' ? 'Anthropic' : f.aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} API key`, f.aiProvider === 'anthropic' ? 'sk-ant-…' : f.aiProvider === 'gemini' ? 'AIza…' : 'sk-…')}
        <Field label="AI reads per recruiter per day" hint="Protects your credits from one heavy user"><Input type="number" min={0} value={f.aiDailyLimit} onChange={(e) => set({ aiDailyLimit: +e.target.value })} /></Field>
        <div className="span-2 row">
          <Button variant="ink" busy={busy === 'AI settings'} onClick={() => save(['aiProvider', 'aiModel', aiKey, 'aiDailyLimit'], 'AI settings')}>Save AI settings</Button>
          <Button busy={busy === 'ai'} onClick={() => test('ai', async () => `Connected. The model replied "${(await api<{ text: string }>('admin', 'test-ai')).text}".`)}>Test AI</Button>
          {msg?.k === 'ai' && <span className="small" style={{ color: msg.ok ? 'var(--color-success)' : 'var(--color-error)' }}>{msg.t}</span>}
        </div>
      </div>
    </section>

    <section className="section" aria-labelledby="h-email">
      <div className="section-head"><h2 id="h-email">Email (Resend)</h2><p>Sign-up links, interview invites and reminders, invoices</p></div>
      <div className="form-grid">
        {keyField('resendKey', 'Resend API key', 're_…')}
        <Field label="Send from" hint="An address on a domain you verified in Resend, e.g. HireLens <hello@mail.yourdomain.com>"><Input type="text" value={f.emailFrom} onChange={(e) => set({ emailFrom: e.target.value })} placeholder="HireLens <hello@mail.example.com>" /></Field>
        <Field label="Reply-to (optional)" hint="Platform emails like invoices; recruiters' emails reply to the recruiter"><Input type="email" value={f.replyTo} onChange={(e) => set({ replyTo: e.target.value.trim() })} /></Field>
        <Field label="Per-recruiter hand-sent emails a day"><Input type="number" min={0} value={f.userEmailDailyLimit} onChange={(e) => set({ userEmailDailyLimit: +e.target.value })} /></Field>
        <Field label="Platform emails a day" hint="Resend free plan: 100"><Input type="number" min={0} value={f.emailDailyLimit} onChange={(e) => set({ emailDailyLimit: +e.target.value })} /></Field>
        <Field label="Platform emails a month" hint="Resend free plan: 3,000"><Input type="number" min={0} value={f.emailMonthlyLimit} onChange={(e) => set({ emailMonthlyLimit: +e.target.value })} /></Field>
        <div className="span-2 row">
          <Button variant="ink" busy={busy === 'Email settings'} onClick={() => save(['resendKey', 'emailFrom', 'replyTo', 'userEmailDailyLimit', 'emailDailyLimit', 'emailMonthlyLimit'], 'Email settings')}>Save email settings</Button>
          <Button busy={busy === 'email'} onClick={() => test('email', async () => `Sent to ${(await api<{ to: string }>('admin', 'test-email')).to}. Check the inbox.`)}>Send me a test email</Button>
          {msg?.k === 'email' && <span className="small" style={{ color: msg.ok ? 'var(--color-success)' : 'var(--color-error)' }}>{msg.t}</span>}
        </div>
      </div>
      <p className="xs muted">Until email is set up, new sign-ups are confirmed without an email and password reset is off.</p>
    </section>

    <section className="section" aria-labelledby="h-plan">
      <div className="section-head"><h2 id="h-plan">Plan, trial and tax</h2><p>Applies to new sign-ups and to invoices raised from now on</p></div>
      <div className="form-grid">
        <Field label="Product name"><Input value={f.productName} onChange={(e) => set({ productName: e.target.value })} /></Field>
        <Field label="Free trial"><Select value={String(f.trialDays)} onChange={(e) => set({ trialDays: +e.target.value })} options={[3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: n === 3 ? '72 hours (3 days)' : n === 7 ? '1 week (7 days)' : `${n} days` }))} /></Field>
        <Field label="Plan name"><Input value={f.planName} onChange={(e) => set({ planName: e.target.value })} /></Field>
        <Field label="Price per month (INR, before tax)"><Input type="number" min={0} value={f.price} onChange={(e) => set({ price: +e.target.value })} /></Field>
        <Field label="Tax %" hint={!f.seller.gstin.trim() && f.taxPct > 0 ? <span style={{ color: 'var(--color-error)' }}>GST can be charged only with a GSTIN. Add the seller's GSTIN, or set this to 0 until you register.</span> : 'Final amount = price + tax. With a GSTIN, split as CGST + SGST.'}><Input type="number" min={0} max={28} step={0.5} value={f.taxPct} onChange={(e) => set({ taxPct: +e.target.value })} /></Field>
        <div className="invoice-preview"><dl className="sum"><div><dt>Product</dt><dd>INR {inr(f.price)}</dd></div><div><dt>Tax</dt><dd>INR {inr(Math.round(f.price * f.taxPct) / 100)}</dd></div><div className="tot"><dt>Final</dt><dd>INR {inr(totalOf({ amount: f.price, taxPct: f.taxPct }))}</dd></div></dl></div>
        <Field label="Seller name"><Input value={f.seller.name} onChange={(e) => set({ seller: { ...f.seller, name: e.target.value } })} /></Field>
        <Field label="Seller GSTIN" hint="Leave blank if not registered"><Input value={f.seller.gstin} onChange={(e) => set({ seller: { ...f.seller, gstin: e.target.value.toUpperCase() } })} /></Field>
        <Field label="Seller address" className="span-2"><Input value={f.seller.address} onChange={(e) => set({ seller: { ...f.seller, address: e.target.value } })} /></Field>
        <div className="span-2"><Button variant="ink" busy={busy === 'Plan'} onClick={() => save(['productName', 'trialDays', 'planName', 'price', 'taxPct', 'seller'], 'Plan')}>Save plan</Button></div>
      </div>
    </section>
  </>
}

/* ---------------- system ---------------- */
function SystemTab({ d, reload }: { d: Overview; reload: () => void }) {
  const [busy, setBusy] = useState('')
  const toast = useToast()
  const run = async (action: string, done: (r: any) => string) => { setBusy(action); try { toast(done(await api('admin', action))); reload() } catch (e: any) { toast(e.message, { kind: 'error' }) } finally { setBusy('') } }
  return <>
    <section className="section" aria-labelledby="h-jobs">
      <div className="section-head"><h2 id="h-jobs">Scheduled jobs</h2><p>Run daily at 08:00 IST by Vercel Cron</p></div>
      <div className="row">
        <Button busy={busy === 'run-reminders'} onClick={() => run('run-reminders', (r) => r.skipped ? `Skipped: ${r.skipped}` : `${r.sent} reminder${r.sent === 1 ? '' : 's'} sent${r.failed ? `, ${r.failed} failed` : ''}`)}>Send today's interview reminders now</Button>
        <Button busy={busy === 'run-billing'} onClick={() => run('run-billing', (r) => r.made ? `${r.made} invoices raised` : 'Nothing due right now')}>Raise due invoices now</Button>
      </div>
      <p className="xs muted">{d.cronSecret ? 'CRON_SECRET is set, so only Vercel can trigger the daily job.' : 'Add a CRON_SECRET environment variable in Vercel (any long random string) so only Vercel can trigger the daily job. Both jobs are safe to repeat: nothing is sent twice.'}</p>
    </section>
    <section className="section" aria-labelledby="h-db">
      <div className="section-head"><h2 id="h-db">Database</h2><p>Tables, row-level security and views</p></div>
      <div className="row"><Button busy={busy === 'migrate'} onClick={() => run('migrate', (r) => (r.ok ? 'Database is up to date' : `Skipped: ${r.skipped}`))}>Run database setup</Button><span className="small muted">Runs on every deploy too. Safe to repeat.</span></div>
    </section>
    <section className="section" aria-labelledby="h-log">
      <div className="section-head"><h2 id="h-log">Recent emails</h2><p>Last 30</p></div>
      {d.usage.recent.length ? <ul className="feed">{d.usage.recent.map((r, i) => <li key={i}><span><b className={r.ok ? '' : 'err-text'}>{r.kind.replace('email:', '')}</b> <span className="kind">{r.detail}{r.error ? ` · ${r.error}` : ''}</span></span><time>{ago(r.at)}</time></li>)}</ul> : <p className="small muted">No emails yet.</p>}
    </section>
  </>
}
