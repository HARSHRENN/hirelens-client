import { useSyncExternalStore } from 'react'
import { cap, TARGET } from './runtime'
import { DEFAULT_LEVELS, getStages, setStageLevels, type AppConfig, type Candidate, type Job, type Panelist, type Secrets, type Template } from './types'
import { lsGet, lsSet } from './util'

/* One in-memory store, persisted through whichever backend the host offers:
 *  - claude.ai artifact: the `db` capability (shared, realtime across the team)
 *  - deployed web build: this browser's localStorage (+ JSON export/import)
 * API keys never go to the shared db; they stay in this browser only. */

type Coll = 'jobs' | 'candidates' | 'templates' | 'panelists'
const COLLS: Coll[] = ['jobs', 'candidates', 'templates', 'panelists']
interface State {
  ready: boolean
  backend: 'db' | 'local' | 'loading'
  offline: boolean
  jobs: Record<string, Job>
  candidates: Record<string, Candidate>
  templates: Record<string, Template>
  panelists: Record<string, Panelist>
  config: AppConfig
  secrets: Secrets
  me: string // 'admin' (super admin) or a recruiter id; picks whose work new uploads count as
}

export const DEFAULT_CONFIG: AppConfig = {
  productName: 'HireLens',
  companyName: 'AlphacodeAI',
  recruiterName: '',
  careersUrl: '',
  weights: { skills: 0.4, experience: 0.25, location: 0.1, ctc: 0.15, notice: 0.1 },
  shortlistAt: 75,
  bands: { potential: 70, near: 40 },
  levels: DEFAULT_LEVELS,
  recruiters: [
    { id: 'rec-riya', name: 'Riya Sharma', email: 'riya.demo@example.com' },
    { id: 'rec-kabir', name: 'Kabir Malhotra', email: 'kabir.demo@example.com' },
    { id: 'rec-sana', name: 'Sana Qureshi', email: 'sana.demo@example.com' },
  ],
  billing: {
    planName: 'HireLens Team plan', price: 4999, taxPct: 18, trialDays: 7, trialStart: Date.now(),
    seller: { name: 'AlphacodeAI Private Limited', address: 'Malad West, Mumbai 400064, Maharashtra', gstin: '' },
    buyer: { name: '', address: '', gstin: '', email: '' },
    invoices: [],
  },
}

export const DEFAULT_SECRETS: Secrets = {
  aiProvider: TARGET === 'web' ? 'openai' : 'builtin', anthropicKey: '', openaiKey: '', geminiKey: '', aiModel: '',
  googleMapsKey: '', waPhoneNumberId: '', waToken: '', resendKey: '', emailFrom: '',
  webhookUrl: '', apiBase: '',
}

const LS_DATA = 'hl-data-v1'
const LS_SECRETS = 'hl-secrets-v1'
const LS_CONFIG = 'hl-config-v1'

const readMe = () => { try { return localStorage.getItem('hl-me') || 'admin' } catch { return 'admin' } }
let state: State = {
  ready: false, backend: 'loading', offline: false,
  jobs: {}, candidates: {}, templates: {}, panelists: {},
  config: (() => { const c = lsGet(LS_CONFIG, DEFAULT_CONFIG); return { ...c, billing: { ...DEFAULT_CONFIG.billing, ...(c.billing || {}) }, bands: { ...DEFAULT_CONFIG.bands, ...(c.bands || {}) } } })(),
  secrets: lsGet(LS_SECRETS, DEFAULT_SECRETS),
  me: readMe(),
}
setStageLevels(state.config.levels?.length ? state.config.levels : DEFAULT_LEVELS)
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const setState = (p: Partial<State>) => {
  if (p.config) setStageLevels(p.config.levels?.length ? p.config.levels : DEFAULT_LEVELS)
  state = { ...state, ...p }; emit()
}

export function setMe(id: string) { try { localStorage.setItem('hl-me', id) } catch { /* ignore */ } setState({ me: id }) }

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => sel(state))
}
export const getState = () => state

let db: any = null

function saveLocal() {
  if (state.backend !== 'local') return
  lsSet(LS_DATA, { jobs: state.jobs, candidates: state.candidates, templates: state.templates, panelists: state.panelists })
}

export async function initStore() {
  db = await cap('db')
  if (db) {
    setState({ backend: 'db' })
    let pending = COLLS.length + 1
    const timer = setTimeout(() => setState({ offline: true, ready: true }), 10_000)
    const done = () => { if (--pending <= 0) { clearTimeout(timer); setState({ ready: true, offline: false }) } }
    for (const c of COLLS) {
      let first = true
      db.collection(c).onSnapshot((snap: any) => {
        const next: Record<string, any> = {}
        for (const d of snap.docs) next[d.id] = { ...d.data(), id: d.id }
        setState({ [c]: next } as any)
        if (first && !snap.metadata?.fromCache) { first = false; done() }
      }, () => { if (first) { first = false; done() } })
    }
    db.doc('config/app').onSnapshot((d: any) => {
      if (d.exists) { const cfg = { ...DEFAULT_CONFIG, ...d.data() }; setState({ config: cfg }); lsSet(LS_CONFIG, cfg) }
      done()
    }, () => done())
  } else {
    let data: any = {}
    try { data = JSON.parse(localStorage.getItem(LS_DATA) || '{}') } catch { /* ignore */ }
    setState({ backend: 'local', ready: true, jobs: data.jobs || {}, candidates: data.candidates || {}, templates: data.templates || {}, panelists: data.panelists || {} })
  }
}

const writeQueue = new Map<string, Promise<void>>()
function dbWrite(path: string, fn: () => Promise<void>) {
  const prev = writeQueue.get(path) || Promise.resolve()
  const next = prev.then(fn).catch((e) => { console.warn('db write failed', path, e); toastError(e) })
  writeQueue.set(path, next)
  return next
}

let errorHook: (m: string) => void = () => {}
export const onStoreError = (f: (m: string) => void) => { errorHook = f }
function toastError(e: any) {
  const code = e?.code
  if (code === 'quota_exceeded') errorHook('Storage is full. Delete old candidates or jobs to add more.')
  else if (code === 'invalid_argument') errorHook('You have view-only access, so changes are not saved.')
  else errorHook('Could not save that change. Check your connection and try again.')
}

export function put<C extends Coll>(c: C, obj: State[C][string]) {
  const o = { ...(obj as any), updatedAt: Date.now() }
  setState({ [c]: { ...state[c], [o.id]: o } } as any)
  if (state.backend === 'db') return dbWrite(`${c}/${o.id}`, () => db.collection(c).doc(o.id).set(JSON.parse(JSON.stringify(o))))
  saveLocal(); return Promise.resolve()
}

export function remove(c: Coll, id: string) {
  const next = { ...state[c] }; delete next[id]
  setState({ [c]: next } as any)
  if (state.backend === 'db') return dbWrite(`${c}/${id}`, () => db.collection(c).doc(id).delete())
  saveLocal(); return Promise.resolve()
}

export function setConfig(p: Partial<AppConfig>) {
  const cfg = { ...state.config, ...p }
  setState({ config: cfg }); lsSet(LS_CONFIG, cfg)
  if (state.backend === 'db') return dbWrite('config/app', () => db.doc('config/app').set(cfg))
  return Promise.resolve()
}

export function setSecrets(p: Partial<Secrets>) {
  const s = { ...state.secrets, ...p }
  setState({ secrets: s }); lsSet(LS_SECRETS, s)
}

export function exportAll() {
  return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), config: state.config, jobs: state.jobs, candidates: state.candidates, templates: state.templates, panelists: state.panelists }, null, 2)
}

export async function importAll(json: string) {
  const d = JSON.parse(json)
  for (const j of Object.values(d.jobs || {})) await put('jobs', j as Job)
  for (const c of Object.values(d.candidates || {})) await put('candidates', c as Candidate)
  for (const t of Object.values(d.templates || {})) await put('templates', t as Template)
  for (const p of Object.values(d.panelists || {})) await put('panelists', p as Panelist)
  if (d.config) await setConfig(d.config)
}

export async function wipeAll() {
  for (const c of ['candidates', 'jobs', 'templates', 'panelists'] as Coll[]) for (const id of Object.keys(state[c])) await remove(c, id)
}

/** The stage list, re-read whenever the admin edits the interview levels. */
export function useStages() { useStore((s) => s.config.levels); return getStages() }
