import { completeJson } from './ai'
import { geocode, km } from './geo'
import { getState } from './store'
import type { Candidate, Employment, Job, Match, MatchBreakdown } from './types'
import { clamp, norm } from './util'

/* Matching = AI reads the resume into fields, then a transparent formula scores it.
 * The AI never invents the score: every percentage traces to five weighted parts
 * the recruiter can see and re-weight in Admin. */

export interface Extracted {
  name: string; email: string; phone: string
  currentRole: string; currentCompany: string
  totalExp: number | null; relevantExp: number | null
  currentCtcLpa: number | null; expectedCtcLpa: number | null; noticeDays: number | null
  currentLocation: string; skills: string[]; education: string; summary: string
  matchedSkills?: string[]; strengths?: string[]; gaps?: string[]; verdict?: string
  employment?: Employment[]
}

const COMMON = ['java', 'spring', 'spring boot', 'python', 'django', 'flask', 'fastapi', 'javascript', 'typescript', 'react', 'next.js', 'angular', 'vue', 'node.js', 'express', 'go', 'golang', 'rust', 'c++', 'c#', '.net', 'php', 'laravel', 'ruby', 'rails', 'kotlin', 'swift', 'flutter', 'react native', 'android', 'ios', 'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'kafka', 'rabbitmq', 'elasticsearch', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'jenkins', 'ci/cd', 'linux', 'microservices', 'rest', 'graphql', 'machine learning', 'deep learning', 'nlp', 'pytorch', 'tensorflow', 'pandas', 'spark', 'hadoop', 'airflow', 'power bi', 'tableau', 'excel', 'selenium', 'cypress', 'jmeter', 'sap', 'salesforce', 'figma', 'html', 'css', 'tailwind', 'llm', 'langchain', 'devops', 'sre', 'agile', 'scrum', 'jira', 'manual testing', 'automation testing', 'data engineering', 'etl', 'snowflake', 'databricks', 'hibernate', 'jpa']

const num = (s?: string | null) => (s == null ? null : parseFloat(s.replace(/,/g, '')))

export function rulesExtract(text: string, job?: Job): Extracted {
  const t = text.replace(/\r/g, '')
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean)
  const email = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] || ''
  const phone = (t.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/)?.[0] || '').replace(/[^\d+]/g, '')
  const name = lines.find((l) => /^[A-Za-z][A-Za-z .'-]{2,40}$/.test(l) && l.split(' ').length <= 4 && !/resume|curriculum|vitae|profile/i.test(l)) || ''
  const lc = t.toLowerCase()
  const yrs = [...lc.matchAll(/(\d{1,2}(?:\.\d)?)\+?\s*(?:years|yrs|year)/g)].map((m) => num(m[1])!).filter((n) => n < 45)
  const totalExp = yrs.length ? Math.max(...yrs) : null
  const lpa = (re: RegExp) => { const m = lc.match(re); if (!m) return null; let v = num(m[1])!; if (/cr/.test(m[0])) v *= 100; if (v > 1000) v = v / 100000; return v }
  const currentCtcLpa = lpa(/(?:current|present)\s*(?:ctc|salary|package)[^\d]{0,12}([\d.,]+)\s*(?:lpa|lakhs?|l\b|cr)?/)
  const expectedCtcLpa = lpa(/(?:expected|expectation)\s*(?:ctc|salary|package)?[^\d]{0,12}([\d.,]+)\s*(?:lpa|lakhs?|l\b|cr)?/)
  let noticeDays: number | null = null
  if (/notice[^.\n]{0,25}(immediate|serving|\b0 days)/.test(lc) || /immediate joiner/.test(lc)) noticeDays = 0
  else { const m = lc.match(/notice\s*(?:period)?[^\d]{0,12}(\d{1,3})\s*(days?|months?)/); if (m) noticeDays = num(m[1])! * (m[2]!.startsWith('month') ? 30 : 1) }
  const loc = t.match(/(?:location|current location|based in|address)\s*[:\-–]\s*([^\n|,]{2,40})/i)?.[1]?.trim() || ''
  const vocab = [...new Set([...COMMON, ...(job ? [...job.mustSkills, ...job.niceSkills].map((s) => s.toLowerCase()) : [])])]
  const skills = vocab.filter((s) => new RegExp(`(^|[^a-z0-9])${s.replace(/[.+#/]/g, (c) => '\\' + c)}([^a-z0-9]|$)`, 'i').test(lc))
  const employment = rulesEmployment(lines)
  return {
    employment, name, email, phone, currentRole: employment[0]?.role || '', currentCompany: employment[0]?.company || '', totalExp, relevantExp: totalExp,
    currentCtcLpa, expectedCtcLpa, noticeDays, currentLocation: loc, skills, education: '',
    summary: lines.slice(0, 3).join(' ').slice(0, 220),
  }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const ym = (m: string | undefined, y: string) => `${y}-${String(m ? MONTHS.indexOf(m.slice(0, 3).toLowerCase()) + 1 || 1 : 1).padStart(2, '0')}`

/** "Senior Engineer, Example Pay (Jun 2021 - Present)" and similar lines -> employment rows */
export function rulesEmployment(lines: string[]): Employment[] {
  const out: Employment[] = []
  const re = /(?:([A-Za-z]{3,9})\s+)?((?:19|20)\d{2})\s*(?:-|–|to)\s*(?:(present|current|now|till date)|(?:([A-Za-z]{3,9})\s+)?((?:19|20)\d{2}))/i
  for (const l of lines) {
    const m = l.match(re)
    if (!m || /education|b\.?e\.?|b\.?tech|university|college|school/i.test(l)) continue
    const head = l.slice(0, m.index).replace(/[(|·•\-–\s]+$/, '').trim()
    if (!head || head.length > 90) continue
    const parts = head.split(/\s*(?:,| at | - | – | \| )\s*/).filter(Boolean)
    const roleFirst = /engineer|developer|lead|manager|analyst|intern|consultant|architect|designer|tester|sdet|associate|specialist|executive|officer/i.test(parts[0] || '')
    const role = (roleFirst ? parts[0] : parts[1]) || ''
    const company = (roleFirst ? parts.slice(1).join(', ') : parts[0]) || ''
    if (!company) continue
    out.push({ company, role, from: ym(m[1], m[2]!), to: m[3] ? 'present' : ym(m[4], m[5]!) })
  }
  return out
}

export async function aiExtract(text: string, job: Job): Promise<Extracted> {
  const prompt = `You are a senior technical recruiter in India. Read the resume and the job, and extract facts. Do not guess numbers that are not written; use null.

JOB
Title: ${job.title}
Location: ${job.location.label} (${job.workMode})
Experience: ${job.expMin}-${job.expMax} years
Budget: up to ${job.ctcMaxLpa} LPA, notice up to ${job.noticeMaxDays} days
Must-have skills: ${job.mustSkills.join(', ')}
Nice-to-have: ${job.niceSkills.join(', ')}
Description: ${job.description.slice(0, 2500)}

RESUME
${text.slice(0, 14000)}

Return JSON with exactly these keys:
{"name":string,"email":string,"phone":string,"currentRole":string,"currentCompany":string,
"totalExp":number|null (years),"relevantExp":number|null (years relevant to THIS job's stack),
"currentCtcLpa":number|null (lakhs per annum),"expectedCtcLpa":number|null,"noticeDays":number|null (0 = immediate),
"currentLocation":string (city/area),"skills":string[] (max 20, canonical names),"education":string (highest, one line),
"summary":string (two plain sentences on who they are),
"matchedSkills":string[] (which of the job's must-have AND nice-to-have skills the resume genuinely shows, using the job's exact spelling),
"strengths":string[] (max 3, each under 12 words, specific to this job),
"gaps":string[] (max 3, each under 12 words),
"verdict":string (one sentence a hiring manager can act on),
"employment":[{"company":string,"role":string,"from":"YYYY-MM","to":"YYYY-MM" or "present"}] (every job in the resume, most recent first; estimate the month as 01 when only a year is given)}`
  return completeJson<Extracted>(prompt)
}

export function scoreCandidate(c: Pick<Candidate, 'skills' | 'relevantExp' | 'totalExp' | 'expectedCtcLpa' | 'noticeDays' | 'distanceKm'>, job: Job, w: MatchBreakdown, matched?: string[]) {
  const have = new Set((matched?.length ? matched : c.skills).map(norm))
  const hit = (s: string) => have.has(norm(s)) || [...have].some((h) => h.length > 2 && (h.includes(norm(s)) || norm(s).includes(h)))
  const mustHit = job.mustSkills.filter(hit), niceHit = job.niceSkills.filter(hit)
  const mustPart = job.mustSkills.length ? mustHit.length / job.mustSkills.length : 1
  const nicePart = job.niceSkills.length ? niceHit.length / job.niceSkills.length : 1
  const skills = job.niceSkills.length ? mustPart * 0.8 + nicePart * 0.2 : mustPart

  const exp = c.relevantExp ?? c.totalExp
  const experience = exp == null ? 0.5 : exp < job.expMin ? clamp(exp / Math.max(job.expMin, 0.5)) ** 1.4 : exp <= job.expMax ? 1 : clamp(1 - (exp - job.expMax) / Math.max(job.expMax, 1) * 0.5, 0.5)

  const d = c.distanceKm
  const location = job.workMode === 'remote' ? 1 : d == null ? 0.5 : d <= 15 ? 1 : d <= 40 ? 0.85 : d <= 120 ? 0.55 : 0.3

  const e = c.expectedCtcLpa
  const ctc = e == null || !job.ctcMaxLpa ? 0.5 : e <= job.ctcMaxLpa ? 1 : clamp(1 - ((e - job.ctcMaxLpa) / job.ctcMaxLpa) * 2.5)

  const n = c.noticeDays
  const notice = n == null ? 0.5 : n <= job.noticeMaxDays ? 1 : clamp(job.noticeMaxDays / n)

  const breakdown = { skills, experience, location, ctc, notice }
  // the four practical parts only count as far as the must-have skills are met: a nearby, affordable,
  // available profile without the core skills is still not a match (it used to score ~65%)
  const practical = w.experience * experience + w.location * location + w.ctc * ctc + w.notice * notice
  const score = Math.round((w.skills * skills + practical * mustPart) * 100)
  const missing = job.mustSkills.filter((s) => !hit(s))
  return { score, breakdown, matchedSkills: [...mustHit, ...niceHit], missingSkills: missing }
}

export async function analyse(text: string, job: Job, w: MatchBreakdown, useAi: boolean): Promise<{ ex: Extracted; match: Match; distanceKm: number | null; place: Awaited<ReturnType<typeof geocode>> }> {
  let ex: Extracted
  let by: Match['by'] = 'rules'
  if (useAi) {
    try { ex = await aiExtract(text, job); by = 'ai' }
    catch (e) { console.warn('AI extract failed, using rules', e); ex = rulesExtract(text, job) }
  } else ex = rulesExtract(text, job)
  const place = await geocode(ex.currentLocation || '')
  const distanceKm = km(place, job.location)
  const s = scoreCandidate({ ...ex, distanceKm }, job, w, ex.matchedSkills)
  const match: Match = {
    ...s,
    strengths: ex.strengths || (s.matchedSkills.length ? [`Shows ${s.matchedSkills.slice(0, 3).join(', ')}`] : []),
    gaps: ex.gaps || (s.missingSkills.length ? [`No sign of ${s.missingSkills.slice(0, 3).join(', ')}`] : []),
    verdict: ex.verdict || '',
    by, at: Date.now(),
  }
  return { ex, match, distanceKm, place }
}

export function rescore(c: Candidate, job: Job, w: MatchBreakdown): Candidate {
  const s = scoreCandidate(c, job, w, [...c.skills, ...(c.match?.matchedSkills || [])])
  return { ...c, match: { ...(c.match || { strengths: [], gaps: [], verdict: '', by: 'rules', at: Date.now() }), ...s, at: Date.now() } as Match }
}

// colour bands set by the super admin (defaults: 70+ potential, 40-69 near, under 40 not a match)
export const band = (score?: number): 'good' | 'near' | 'low' | 'none' => {
  if (score == null) return 'none'
  const b = getState().config.bands
  return score >= b.potential ? 'good' : score >= b.near ? 'near' : 'low'
}
export const bandLabel = (score?: number) => ({ good: 'Potential match', near: 'Near match', low: 'Not a match', none: 'Not scored' })[band(score)]

/** The candidate's own 1-5 ratings against the JD skills, as a percentage (must-haves count 80%). */
export function selfMatch(c: Candidate, job?: Job): number | null {
  if (!job || !c.selfRatings) return null
  const r = (s: string) => c.selfRatings![s]
  const rated = [...job.mustSkills, ...job.niceSkills].filter((s) => r(s) != null)
  if (!rated.length) return null
  const avg = (list: string[]) => list.length ? list.reduce((a, s) => a + (r(s) ?? 0) / 5, 0) / list.length : null
  const m = avg(job.mustSkills), n = avg(job.niceSkills)
  return Math.round(((m ?? n ?? 0) * (n == null || m == null ? 1 : 0.8) + (m != null && n != null ? n * 0.2 : 0)) * 100)
}

/** Years worked per company, merged from employment rows. */
export const yearsAt = (e: Employment) => {
  const toN = (s: string) => s === 'present' ? new Date().getFullYear() + new Date().getMonth() / 12 : +s.slice(0, 4) + (+s.slice(5, 7) - 1) / 12
  return Math.max(0, toN(e.to) - toN(e.from))
}
export const companiesCount = (c: Candidate) => new Set((c.employment || []).map((e) => e.company.toLowerCase())).size || null
