export const uid = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)

export const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n))

export const fmtLpa = (n: number | null | undefined) => (n == null ? '—' : `${+n.toFixed(2)} LPA`)
export const fmtYrs = (n: number | null | undefined) => (n == null ? '—' : `${+n.toFixed(1)} yrs`)
export const fmtDays = (n: number | null | undefined) => (n == null ? '—' : n === 0 ? 'Immediate' : `${n} days`)
export const fmtKm = (n: number | null | undefined) => (n == null ? '—' : n < 1 ? '< 1 km' : `${Math.round(n)} km`)

export function fmtDate(t?: number, withTime = false) {
  if (!t) return '—'
  return new Date(t).toLocaleString('en-IN', withTime
    ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ago(t: number) {
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#.]/g, '')

export function fill(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}

export function csv(rows: (string | number | null | undefined)[][]) {
  return rows.map((r) => r.map((c) => {
    const v = c == null ? '' : String(c)
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  }).join(',')).join('\n')
}

export function debounce<T extends (...a: any[]) => void>(fn: T, ms: number) {
  let t: any
  return (...a: Parameters<T>) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }
}

export const lsGet = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } : d } catch { return d } }
export const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage unavailable */ } }
