import { Loader2, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { band, bandLabel } from '../lib/match'
import type { Match, MatchBreakdown, Stage } from '../lib/types'
import { stageLabel } from '../lib/types'

/* ---------- buttons ---------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'card' | 'ink' | 'ghost' | 'danger'; size?: 'sm' | 'md'; icon?: boolean; busy?: boolean }
export function Button({ variant = 'card', size = 'md', icon, busy, className = '', children, disabled, type = 'button', ...rest }: BtnProps) {
  const cls = ['btn', variant === 'ink' && 'btn--ink', variant === 'ghost' && 'btn--ghost', variant === 'danger' && 'btn--ghost btn--danger', size === 'sm' && 'btn--sm', icon && 'btn--icon', className].filter(Boolean).join(' ')
  return <button type={type} className={cls} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>{busy && <Loader2 size={14} className="spin" aria-hidden />}{children}</button>
}
export function LinkButton({ variant = 'card', size = 'md', className = '', ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: 'card' | 'ink' | 'ghost'; size?: 'sm' | 'md' }) {
  const cls = ['btn', variant === 'ink' && 'btn--ink', variant === 'ghost' && 'btn--ghost', size === 'sm' && 'btn--sm', className].filter(Boolean).join(' ')
  return <a className={cls} target="_blank" rel="noreferrer" {...rest} />
}

/* ---------- fields ---------- */
export function Field({ label, hint, error, children, className = '' }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}{error ? <span className="err" role="alert">{error}</span> : <span className="hint">{hint}</span>}</label>
}
export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input className="input" {...p} />
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className="textarea" {...p} />
export function Select({ options, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return <select className="select" {...p}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
}

export function Groove<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return <div className="groove" role="group" aria-label={label}>{options.map((o) => <button type="button" key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>
}

export function ChipInput({ value, onChange, placeholder, id }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; id?: string }) {
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const parts = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
    if (parts.length) onChange([...new Set([...value, ...parts])])
    setDraft('')
  }
  return (
    <div className="stack" style={{ gap: 'var(--space-2xs)' }}>
      <input id={id} className="input" value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft) } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1)) }}
        onBlur={() => draft && add(draft)} onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/[,\n]/.test(t)) { e.preventDefault(); add(t) } }} />
      {value.length > 0 && <div className="chips">{value.map((s) => <span className="chip" key={s}>{s}<button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(value.filter((x) => x !== s))}><X size={12} /></button></span>)}</div>}
    </div>
  )
}

/* ---------- overlays ---------- */
function useEscape(onClose: () => void) {
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [onClose])
}
function useFocusIn(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => { const prev = document.activeElement as HTMLElement | null; const el = ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])') || ref.current; el?.focus(); return () => prev?.focus?.() }, [ref])
}
export function Dialog({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null); const id = useId()
  useEscape(onClose); useFocusIn(ref)
  return <>
    <div className="scrim" onClick={onClose} />
    <div ref={ref} className={`dialog stock ${wide ? 'dialog--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
      <div className="row" style={{ justifyContent: 'space-between' }}><h2 id={id}>{title}</h2><Button variant="ghost" icon size="sm" data-close aria-label="Close" onClick={onClose}><X size={16} /></Button></div>
      {children}
      {footer && <div className="row row--end">{footer}</div>}
    </div>
  </>
}
export function Drawer({ title, onClose, children, actions }: { title: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null); const id = useId()
  useEscape(onClose); useFocusIn(ref)
  return <>
    <div className="scrim" onClick={onClose} />
    <aside ref={ref} className="drawer" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
      <div className="drawer-head"><h2 id={id} style={{ flex: 1, minWidth: 0 }}>{title}</h2>{actions}<Button variant="ghost" icon size="sm" data-close aria-label="Close" onClick={onClose}><X size={16} /></Button></div>
      <div className="drawer-body">{children}</div>
    </aside>
  </>
}

/* ---------- toasts ---------- */
type Toast = { id: number; text: string; kind: 'info' | 'error'; action?: { label: string; run: () => void } }
const ToastCtx = createContext<(t: string, o?: { kind?: Toast['kind']; action?: Toast['action'] }) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastHost({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([])
  const push = useCallback((text: string, o: { kind?: Toast['kind']; action?: Toast['action'] } = {}) => {
    const id = Date.now() + Math.random()
    setList((l) => [...l.slice(-3), { id, text, kind: o.kind || 'info', action: o.action }])
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), o.kind === 'error' ? 8000 : 4500)
  }, [])
  return <ToastCtx.Provider value={push}>{children}
    <div className="toasts" role="status" aria-live="polite">{list.map((t) => (
      <div key={t.id} className={`toast ${t.kind === 'error' ? 'stock' : 'toast--ink'}`} data-kind={t.kind}>
        <span style={{ flex: 1 }}>{t.text}</span>
        {t.action && <button type="button" className="btn btn--sm btn--ghost" style={{ color: 'inherit' }} onClick={() => { t.action!.run(); setList((l) => l.filter((x) => x.id !== t.id)) }}>{t.action.label}</button>}
      </div>))}</div>
  </ToastCtx.Provider>
}

/* ---------- states ---------- */
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>
}
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return <div className="stack" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="skel" style={{ width: `${90 - i * 12}%` }} />)}</div>
}
export function ErrorBox({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return <div className="error-box row" role="alert"><span style={{ flex: 1 }}>{children}</span>{onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>}</div>
}

/* ---------- domain bits ---------- */
export function StageTag({ stage }: { stage: Stage }) { return <span className="stage-tag" data-stage={stage}>{stageLabel(stage)}</span> }

export function ScoreCell({ m }: { m?: Match }) {
  if (!m) return <span className="muted small">Not scored</span>
  return <span className="score-cell" title={`${bandLabel(m.score)} (${m.by === 'ai' ? 'AI read' : 'rules'})`}>
    <span className="meter" data-band={band(m.score)} aria-hidden><i style={{ transform: `scaleX(${m.score / 100})` }} /></span>
    <span className="score">{m.score}<small>%</small></span>
  </span>
}

const PART_LABEL: Record<keyof MatchBreakdown, string> = { skills: 'Skills', experience: 'Experience', location: 'Location', ctc: 'CTC fit', notice: 'Notice period' }
export function MatchCard({ m, weights, shortlisted, children }: { m?: Match; weights: MatchBreakdown; shortlisted?: boolean; children?: ReactNode }) {
  if (!m) return <div className="matchcard stock"><p className="muted">This profile has not been scored yet.</p>{children}</div>
  return (
    <div className="matchcard stock">
      {shortlisted && <span className="pressed" aria-label="Shortlisted">Shortlisted</span>}
      <div className="row" style={{ alignItems: 'end', gap: 'var(--space-md)' }}>
        <div className="big">{m.score}<small>%</small></div>
        <div className="stack" style={{ gap: 0 }}><b style={{ fontWeight: 500 }}>{bandLabel(m.score)}</b><span className="xs muted">{m.by === 'ai' ? 'Resume read by AI, scored by your weights' : 'Scored by keyword rules'}</span></div>
      </div>
      <div className="parts">
        {(Object.keys(PART_LABEL) as (keyof MatchBreakdown)[]).map((k) => (
          <div className="part" key={k}>
            <span>{PART_LABEL[k]}</span>
            <span className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(m.breakdown[k] * 100)} aria-label={`${PART_LABEL[k]} ${Math.round(m.breakdown[k] * 100)}%`}><i style={{ transform: `scaleX(${m.breakdown[k]})` }} /></span>
            <span className="w">{Math.round(m.breakdown[k] * 100)}% <span title="weight">×{Math.round(weights[k] * 100)}</span></span>
          </div>
        ))}
      </div>
      {m.verdict && <p className="small">{m.verdict}</p>}
      {children}
    </div>
  )
}

/** SVG filter that makes the pressed stamp read as ink pushed into cotton. */
export function PressFilter() {
  return <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
    <filter id="press" x="-10%" y="-20%" width="120%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" />
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.25" result="mask" />
      <feComposite in="SourceGraphic" in2="mask" operator="in" result="inked" />
      <feOffset in="SourceAlpha" dx="-0.6" dy="-0.8" result="o" />
      <feComposite in="o" in2="SourceAlpha" operator="out" result="wall" />
      <feFlood style={{ floodColor: "var(--color-print)", floodOpacity: 0.25 }} />
      <feComposite in2="wall" operator="in" result="shade" />
      <feMerge><feMergeNode in="inked" /><feMergeNode in="shade" /></feMerge>
    </filter>
  </svg>
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { id: T; label: string }[] }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>
}
