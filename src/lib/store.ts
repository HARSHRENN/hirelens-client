import { useSyncExternalStore } from 'react'
import { api, supaSync } from './cloud'
import { cap, MODE } from './runtime'
import { DEFAULT_LEVELS, getStages, setStageLevels, type AppConfig, type Candidate, type Job, type Panelist, type PanelFeedback, type Template } from './types'
import { lsGet, lsSet } from './util'

/* One in-memory store, persisted through the backend that fits where the app runs:
 *  - cloud: the signed-in recruiter's rows on the server (row-level security keeps workspaces apart)
 *  - demo: this browser's localStorage, sample data only
 *  - artifact: the claude.ai `db` capability
 * No API keys live here: the platform's keys stay on the server. */

export interface JobAssignment { job_id: string; recruiter_id: string; assigned_at: string; version: number }
export interface RecruiterOption { id: string; full_name: string; email: string; status: string }
const docOwners = new Map<string, string>()
export const jobOwner = (id: string) => docOwners.get(`jobs/${id}`)

type Coll = 'jobs' | 'candidates' | 'templates' | 'panelists'
const COLLS: Coll[] = ['jobs', 'candidates', 'templates', 'panelists']
interface State {
  ready: boolean
  backend: 'cloud' | 'db' | 'local' | 'loading'
  offline: boolean
  jobs: Record<string, Job>
  candidates: Record<string, Candidate>
  templates: Record<string, Template>
  panelists: Record<string, Panelist>
  config: AppConfig
  panelFeedback: PanelFeedback[]
  panelFeedbackEnabled: boolean
  assignmentsEnabled: boolean
  assignments: Record<string, JobAssignment>
  recruiters: RecruiterOption[]
}

export const DEFAULT_CONFIG: AppConfig = {
  productName: 'HireLens',
  companyName: '',
  recruiterName: '',
  careersUrl: '',
  weights: { skills: 0.4, experience: 0.25, location: 0.1, ctc: 0.15, notice: 0.1 },
  shortlistAt: 75,
  bands: { potential: 70, near: 40 },
  levels: DEFAULT_LEVELS,
  webhookUrl: '',
  timezone: 'Asia/Kolkata',
  autoInvites: true,
  autoReminders: true,
}

const LS_DEMO_DATA = 'hl-demo-data-v1'
const LS_DEMO_CONFIG = 'hl-demo-config-v1'

const withDefaults = (c: Partial<AppConfig> | undefined): AppConfig => ({
  ...DEFAULT_CONFIG, ...(c || {}),
  bands: { ...DEFAULT_CONFIG.bands, ...(c?.bands || {}) },
  weights: { ...DEFAULT_CONFIG.weights, ...(c?.weights || {}) },
  levels: c?.levels?.length ? c.levels : DEFAULT_LEVELS,
})

let state: State = {
  panelFeedback: [], panelFeedbackEnabled: false, assignmentsEnabled: false, assignments: {}, recruiters: [],
  ready: false, backend: 'loading', offline: false,
  jobs: {}, candidates: {}, templates: {}, panelists: {},
  config: DEFAULT_CONFIG,
}
setStageLevels(DEFAULT_LEVELS)
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
const setState = (p: Partial<State>) => {
  if (p.config) setStageLevels(p.config.levels?.length ? p.config.levels : DEFAULT_LEVELS)
  state = { ...state, ...p }; emit()
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => sel(state), () => sel(state))
}
export const getState = () => state

let db: any = null // artifact db capability
let loadVersion = 0
let writesPending = 0
let owner = '' // cloud: the signed-in user's id

function saveLocal() {
  lsSet(LS_DEMO_DATA, { jobs: state.jobs, candidates: state.candidates, templates: state.templates, panelists: state.panelists })
}

let errorHook: (m: string) => void = () => {}
export const onStoreError = (f: (m: string) => void) => { errorHook = f }
function toastError(e: any) {
  const code = e?.code
  if (code === 'quota_exceeded') errorHook('Storage is full. Delete old candidates or jobs to add more.')
  else if (code === 'invalid_argument' || code === '42501') errorHook('This change was not saved: your account may be suspended or signed out.')
  else errorHook('Could not save that change. Check your connection and try again.')
}

/** Loads the workspace. cloud needs the signed-in user's id. */
export async function initStore(opts: { userId?: string } = {}) {
  const mode = MODE()
  if (mode === 'cloud') {
    const sb = supaSync()
    if (!sb || !opts.userId) throw new Error('Not signed in')
    if (writesPending) return
    const version = ++loadVersion
    if (owner && owner !== opts.userId) setState({ ready: false, jobs: {}, candidates: {}, templates: {}, panelists: {}, panelFeedback: [], panelFeedbackEnabled: false, assignments: {}, recruiters: [] })
    owner = opts.userId
    setState({ backend: 'cloud' })
    const next: Record<string, Record<string, any>> = { jobs: {}, candidates: {}, templates: {}, panelists: {} }
    let config: any = null
    const owners = new Map<string, string>()
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('docs').select('owner, coll, id, data').order('owner').order('coll').order('id').range(from, from + 999)
      if (error) { toastError(error); setState({ ready: true, offline: true }); return }
      for (const r of data) { owners.set(`${r.coll}/${r.id}`, r.owner); if (r.coll === 'config') { if (r.id === 'app') config = r.data } else next[r.coll]![r.id] = { ...r.data, id: r.id } }
      if (data.length < 1000) break
    }
    const assignmentData = await api<{ enabled: boolean; assignments: JobAssignment[]; recruiters: RecruiterOption[] }>('app', 'job-assignments')
    if (version !== loadVersion || writesPending) return
    for (const coll of COLLS) for (const [id, value] of Object.entries(next[coll]!)) {
      if (JSON.stringify(value) === JSON.stringify(state[coll][id])) next[coll]![id] = state[coll][id]
    }
    const feedback: PanelFeedback[] = []
    let feedbackEnabled = true
    for (let from = 0; ; from += 1000) {
      const fb = await sb.from('panel_feedback').select('candidate_id,interview_id,panelist_id,panelist_name,expires_at,requested_at,revoked_at,submitted_at,rating,recommendation,comments').order('candidate_id').order('interview_id').order('panelist_id').range(from, from + 999)
      if (fb.error) {
        if (!['PGRST205', '42P01'].includes(fb.error.code)) throw fb.error
        feedbackEnabled = false; break
      }
      feedback.push(...fb.data)
      if (fb.data.length < 1000) break
    }
    if (version !== loadVersion || writesPending) return
    const nextConfig = withDefaults(config)
    docOwners.clear(); owners.forEach((value, key) => docOwners.set(key, value))
    setState({ panelFeedback: feedback, panelFeedbackEnabled: feedbackEnabled, assignmentsEnabled: assignmentData.enabled, assignments: Object.fromEntries(assignmentData.assignments.map(a => [a.job_id, a])), recruiters: assignmentData.recruiters, ...next, config: JSON.stringify(nextConfig) === JSON.stringify(state.config) ? state.config : nextConfig, ready: true, offline: false } as any)
    return
  }
  if (mode === 'artifact') {
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
      db.doc('config/app').onSnapshot((d: any) => { if (d.exists) setState({ config: withDefaults(d.data()) }); done() }, () => done())
      return
    }
  }
  // demo (and an artifact without a db): this browser only
  let data: any = {}
  try { data = JSON.parse(localStorage.getItem(LS_DEMO_DATA) || '{}') } catch { /* ignore */ }
  setState({ panelFeedback: [], panelFeedbackEnabled: true, assignmentsEnabled: true, assignments: {}, recruiters: [], backend: 'local', ready: true, jobs: data.jobs || {}, candidates: data.candidates || {}, templates: data.templates || {}, panelists: data.panelists || {}, config: withDefaults(lsGet(LS_DEMO_CONFIG, DEFAULT_CONFIG)) })
}

const writeQueue = new Map<string, Promise<void>>()
function queued(path: string, fn: () => Promise<void>) {
  const prev = writeQueue.get(path) || Promise.resolve()
  writesPending++
  loadVersion++
  const next = prev.catch(() => {}).then(fn).catch((e) => { console.warn('save failed', path, e); toastError(e); throw e }).finally(() => { writesPending-- })
  writeQueue.set(path, next)
  return next
}
const clean = (o: unknown) => JSON.parse(JSON.stringify(o))

export function put<C extends Coll>(c: C, obj: State[C][string]) {
  const o = { ...(obj as any), updatedAt: Date.now() }
  if (state.backend === 'cloud') return queued(`${c}/${o.id}`, async () => {
    const recordOwner = docOwners.get(`${c}/${o.id}`) || (c === 'candidates' ? jobOwner(o.jobId) : undefined) || owner
    const { error } = await supaSync()!.from('docs').upsert({ owner: recordOwner, coll: c, id: o.id, data: clean(o), updated_at: new Date().toISOString() })
    if (error) throw error
    docOwners.set(`${c}/${o.id}`, recordOwner)
    setState({ [c]: { ...state[c], [o.id]: o } } as any)
  })
  setState({ [c]: { ...state[c], [o.id]: o } } as any)
  if (state.backend === 'db') return queued(`${c}/${o.id}`, () => db.collection(c).doc(o.id).set(clean(o)))
  saveLocal(); return Promise.resolve()
}

export function remove(c: Coll, id: string) {
  const next = { ...state[c] }; delete next[id]
  if (state.backend === 'cloud') return queued(`${c}/${id}`, async () => {
    const { error } = await supaSync()!.from('docs').delete().eq('owner', docOwners.get(`${c}/${id}`) || owner).eq('coll', c).eq('id', id)
    if (error) throw error
    setState({ [c]: next } as any)
  })
  setState({ [c]: next } as any)
  if (state.backend === 'db') return queued(`${c}/${id}`, () => db.collection(c).doc(id).delete())
  saveLocal(); return Promise.resolve()
}

export function setConfig(p: Partial<AppConfig>) {
  const cfg = withDefaults({ ...state.config, ...p })
  setState({ config: cfg })
  if (state.backend === 'cloud') return queued('config/app', async () => {
    const { error } = await supaSync()!.from('docs').upsert({ owner, coll: 'config', id: 'app', data: clean({ ...cfg, id: 'app' }), updated_at: new Date().toISOString() })
    if (error) throw error
  })
  if (state.backend === 'db') return queued('config/app', () => db.doc('config/app').set(clean(cfg)))
  lsSet(LS_DEMO_CONFIG, cfg)
  return Promise.resolve()
}

export function exportAll() {
  return JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), config: state.config, jobs: state.jobs, candidates: state.candidates, templates: state.templates, panelists: state.panelists }, null, 2)
}

export async function importAll(json: string) {
  const d = JSON.parse(json)
  for (const j of Object.values(d.jobs || {})) await put('jobs', j as Job)
  for (const c of Object.values(d.candidates || {})) await put('candidates', c as Candidate)
  for (const t of Object.values(d.templates || {})) await put('templates', t as Template)
  for (const p of Object.values(d.panelists || {})) await put('panelists', p as Panelist)
  if (d.config) { const { recruiters: _r, billing: _b, ...rest } = d.config; await setConfig(rest) }
}

export async function wipeAll() {
  for (const c of COLLS) for (const id of Object.keys(state[c])) await remove(c, id)
}

/** The stage list, re-read whenever the interview levels change. */
export function useStages() { useStore((s) => s.config.levels); return getStages() }
