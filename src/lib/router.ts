import { useEffect, useState } from 'react'

/* Plain-hash routing (#dashboard, #jobs, #job-<id>): the only form a claude.ai
 * artifact passes through, and it works the same on the deployed app. */
export type Route =
  | { name: 'dashboard' } | { name: 'jobs' } | { name: 'job'; id: string; tab?: string }
  | { name: 'candidates' } | { name: 'pipeline' } | { name: 'outreach' } | { name: 'settings' } | { name: 'panelists' } | { name: 'billing' }

export function parse(h: string): Route {
  const s = h.replace(/^#/, '')
  const job = s.match(/^job-([a-z0-9_]+?)(?:-(candidates|ideal|share|calibration|details))?$/i)
  if (job) return { name: 'job', id: job[1]!, tab: job[2] }
  if (['jobs', 'candidates', 'pipeline', 'outreach', 'settings', 'dashboard', 'panelists', 'billing'].includes(s)) return { name: s } as Route
  if (s === 'admin') return { name: 'settings' } // old links
  return { name: 'dashboard' }
}

export const href = (r: Route) => r.name === 'job' ? `#job-${r.id}${r.tab ? '-' + r.tab : ''}` : `#${r.name}`
export const go = (r: Route) => { location.hash = href(r).slice(1) }

export function useRoute() {
  const [r, setR] = useState(() => parse(location.hash))
  useEffect(() => {
    const f = () => { setR(parse(location.hash)); document.querySelector('.main')?.scrollTo?.(0, 0); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f)
  }, [])
  return r
}
