import { Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Button, ChipInput, Dialog, ErrorBox, Field, Groove, Input, Select, Textarea, useToast } from '../components/ui'
import { completeJson } from '../lib/ai'
import { geocode } from '../lib/geo'
import { put, useStore } from '../lib/store'
import type { Job } from '../lib/types'
import { useMe } from '../lib/me'
import { MODE } from '../lib/runtime'
import { calendarDate, vacancyDate, turnaroundDays, prepareJobDates } from '../lib/jobDates'
import { uid } from '../lib/util'

const TECHS = ['Java', 'Frontend', 'Full stack', 'Mobile', 'Data', 'AI / ML', 'DevOps / Cloud', 'QA / Testing', '.NET', 'Python', 'SAP / ERP', 'Design', 'Non-tech', 'Others']

const blank = (): Job => ({
  id: uid('j'), title: '', client: '', tech: 'Java', location: { label: '' }, workMode: 'onsite',
  expMin: 2, expMax: 6, ctcMaxLpa: 12, noticeMaxDays: 30, openings: 1, mustSkills: [], niceSkills: [],
  description: '', status: 'open', createdAt: Date.now(), updatedAt: Date.now(),
})

export function JobForm({ job, onClose, onSaved }: { job?: Job; onClose: () => void; onSaved?: (j: Job) => void }) {
  const { me } = useMe()
  const canEditCloseDate = MODE() !== 'cloud' || !!me?.isAdmin
  const [j, setJ] = useState<Job>(job ? structuredClone(job) : blank())
  const [useCustomCategory, setUseCustomCategory] = useState(() => !!job && !TECHS.includes(job.tech))
  const [busy, setBusy] = useState<'' | 'write' | 'read' | 'save'>('')
  const [err, setErr] = useState('')
  const [touched, setTouched] = useState(false)
  const company = useStore((s) => s.config.companyName)
  const toast = useToast()
  const set = (p: Partial<Job>) => setJ((x) => ({ ...x, ...p }))

  async function aiWrite() {
    if (!j.title.trim()) { setTouched(true); return }
    setBusy('write'); setErr('')
    try {
      const r = await completeJson<{ description: string; mustSkills: string[]; niceSkills: string[]; expMin: number; expMax: number; tech: string }>(
        `Write a crisp job description for an Indian hiring market.
Role: ${j.title}. Hiring company: ${j.client || company}. Location: ${j.location.label || 'not given'} (${j.workMode}).
Experience ${j.expMin}-${j.expMax} years, budget ${j.ctcMinLpa ? j.ctcMinLpa + '-' : 'up to '}${j.ctcMaxLpa} LPA, notice up to ${j.noticeMaxDays} days.
Recruiter notes: ${j.description || 'none'}
Return {"description": string (plain text, 5-8 short lines: what they will do, then what they need; no headings, no emoji, no marketing fluff),
"mustSkills": string[] (4-6), "niceSkills": string[] (2-4), "expMin": number, "expMax": number,
"tech": string (technical or non-technical category; examples: ${JSON.stringify(TECHS)}, custom categories allowed)}`)
      set({ description: r.description, mustSkills: r.mustSkills?.length ? r.mustSkills : j.mustSkills, niceSkills: r.niceSkills || j.niceSkills, expMin: r.expMin ?? j.expMin, expMax: r.expMax ?? j.expMax, tech: r.tech?.trim() || j.tech })
    } catch (e: any) { setErr(e.message) } finally { setBusy('') }
  }

  async function aiRead() {
    if (j.description.trim().length < 40) { setErr('Paste the job description first, then let the AI read it.'); return }
    setBusy('read'); setErr('')
    try {
      const r = await completeJson<Partial<Job> & { location?: string }>(
        `Read this job description and extract fields. Use null where not stated.
${j.description.slice(0, 8000)}
Return {"title": string, "client": string|null, "location": string|null, "workMode": "onsite"|"hybrid"|"remote"|null, "expMin": number|null, "expMax": number|null, "ctcMaxLpa": number|null, "noticeMaxDays": number|null, "mustSkills": string[], "niceSkills": string[], "tech": string (technical or non-technical category; examples: ${JSON.stringify(TECHS)}, custom categories allowed)}`)
      const loc = r.location ? await geocode(r.location as any) : j.location
      set({
        title: r.title || j.title, client: r.client || j.client, location: loc, workMode: (r.workMode as any) || j.workMode,
        expMin: r.expMin ?? j.expMin, expMax: r.expMax ?? j.expMax, ctcMaxLpa: r.ctcMaxLpa ?? j.ctcMaxLpa, noticeMaxDays: r.noticeMaxDays ?? j.noticeMaxDays,
        mustSkills: r.mustSkills?.length ? r.mustSkills : j.mustSkills, niceSkills: r.niceSkills || j.niceSkills, tech: r.tech?.trim() || j.tech,
      })
    } catch (e: any) { setErr(e.message) } finally { setBusy('') }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setTouched(true)
    if (!j.title.trim() || !j.location.label.trim() || !j.mustSkills.length) {
      (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus(); return
    }
    setBusy('save'); setErr('')
    try {
      const loc = j.location.lat != null ? j.location : await geocode(j.location.label)
      const saved = prepareJobDates({ ...j, tech: j.tech.trim() || 'Others', location: loc, expMax: Math.max(j.expMax, j.expMin) }, job, canEditCloseDate)
      await put('jobs', saved)
      toast(job ? 'Job updated' : 'Job created')
      if (loc.lat == null && j.workMode !== 'remote') toast(`Could not place “${loc.label}” on the map, so distances show as unknown.`, { kind: 'error' })
      onSaved?.(saved); onClose()
    } catch (e) { setErr((e as Error).message) }
    finally { setBusy('') }
  }

  const inv = (b: boolean) => (touched && b ? 'true' : undefined)
  const customCategory = useCustomCategory || !TECHS.includes(j.tech)

  return (
    <Dialog title={job ? 'Edit job' : 'New job'} onClose={onClose} wide>
      <form className="form-grid" onSubmit={save} noValidate>
        <Field label="Job title" error={inv(!j.title.trim()) && 'Add a title, for example Senior Java Developer.'}>
          <Input name="title" autoComplete="off" value={j.title} onChange={(e) => set({ title: e.target.value })} aria-invalid={inv(!j.title.trim())} placeholder="Senior Java Developer" />
        </Field>
        <Field label="Client or team" hint="Shown on the tracker and in messages">
          <Input name="client" autoComplete="organization" value={j.client} onChange={(e) => set({ client: e.target.value })} placeholder="Example Fintech" />
        </Field>
        <Field label="Job location" error={inv(!j.location.label.trim()) && 'Add the city or area, used for distance.'} hint="City or area, for example Malad, Mumbai">
          <Input name="location" autoComplete="off" value={j.location.label} onChange={(e) => set({ location: { label: e.target.value } })} aria-invalid={inv(!j.location.label.trim())} />
        </Field>
        <Field label="Work mode">
          <Groove label="Work mode" value={j.workMode} onChange={(v) => set({ workMode: v })} options={[{ value: 'onsite', label: 'Onsite' }, { value: 'hybrid', label: 'Hybrid' }, { value: 'remote', label: 'Remote' }]} />
        </Field>
        <div className="row span-2" style={{ gap: 'var(--space-md)', alignItems: 'start' }}>
          <Field label="Min exp (yrs)"><Input type="number" inputMode="decimal" min={0} step={0.5} value={j.expMin} onChange={(e) => set({ expMin: +e.target.value })} /></Field>
          <Field label="Max exp (yrs)"><Input type="number" inputMode="decimal" min={0} step={0.5} value={j.expMax} onChange={(e) => set({ expMax: +e.target.value })} /></Field>
          <Field label="Budget from (LPA)" hint="Lowest CTC the client will pay"><Input type="number" inputMode="decimal" min={0} step={0.5} value={j.ctcMinLpa ?? ''} onChange={(e) => set({ ctcMinLpa: e.target.value === '' ? undefined : +e.target.value })} /></Field>
          <Field label="Budget up to (LPA)" hint="Expected CTC above this lowers the match"><Input type="number" inputMode="decimal" min={0} step={0.5} value={j.ctcMaxLpa} onChange={(e) => set({ ctcMaxLpa: +e.target.value })} /></Field>
          <Field label="Max notice (days)"><Input type="number" inputMode="numeric" min={0} step={15} value={j.noticeMaxDays} onChange={(e) => set({ noticeMaxDays: +e.target.value })} /></Field>
          <Field label="Openings"><Input type="number" inputMode="numeric" min={1} value={j.openings} onChange={(e) => set({ openings: +e.target.value })} /></Field>
        </div>
        <Field label="Skill / requirement category" hint="Open the dropdown to see all categories, or choose Custom category to type your own.">
          <Select value={customCategory ? '__custom__' : j.tech} options={[...TECHS.map(t => ({ value: t, label: t })), { value: '__custom__', label: 'Custom category (type your own)' }]} onChange={e => {
            const custom = e.target.value === '__custom__'
            setUseCustomCategory(custom)
            set({ tech: custom ? (TECHS.includes(j.tech) ? '' : j.tech) : e.target.value })
          }} />
        </Field>
        <Field label="Status">
          <Select value={j.status} onChange={(e) => { const status = e.target.value as Job['status']; set({ status, positionClosedDate: status === 'closed' ? j.positionClosedDate || calendarDate(Date.now()) : undefined }) }} options={[{ value: 'open', label: 'Open' }, { value: 'paused', label: 'Paused' }, { value: 'closed', label: 'Closed' }]} />
        </Field>
        {customCategory && <Field className="span-2" label="Custom skill / requirement category" hint="Technical or non-technical, for example Finance, Sales or Microsoft Fabric.">
          <Input value={j.tech} onChange={e => { setUseCustomCategory(true); set({ tech: e.target.value }) }} placeholder="Type your category" />
        </Field>}
        <Field label="Vacancy creation date" hint="Recorded automatically when the job is created.">
          <Input type="date" value={vacancyDate(j)} readOnly />
        </Field>
        <Field label="Position close date (PCD)" hint={canEditCloseDate ? 'Recorded when closed. An admin can correct or postpone this date.' : 'Recorded automatically when closed. Contact the admin for date corrections.'}>
          <Input type="date" min={vacancyDate(j)} value={j.positionClosedDate || ''} disabled={j.status !== 'closed'} readOnly={!canEditCloseDate} onChange={e => set({ positionClosedDate: e.target.value || undefined })} />
        </Field>
        <p className="small muted span-2">Turnaround time (TAT): <b>{turnaroundDays(j) == null ? '—' : `${turnaroundDays(j)} days`}</b>. Calendar days from vacancy creation to position close. Reopening clears the close date.</p>
        <Field label="Must-have skills" error={inv(!j.mustSkills.length) && 'Add at least one, matching scores against these.'} hint="Press Enter or comma after each">
          <ChipInput value={j.mustSkills} onChange={(v) => set({ mustSkills: v })} placeholder="Java, Spring Boot" />
        </Field>
        <Field label="Nice-to-have skills" hint="Worth 20% of the skills score">
          <ChipInput value={j.niceSkills} onChange={(v) => set({ niceSkills: v })} placeholder="Kafka, AWS" />
        </Field>
        <div className="span-2 stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="label">Job description</span>
            <div className="row">
              <Button size="sm" busy={busy === 'read'} onClick={aiRead}>Read pasted JD</Button>
              <Button size="sm" busy={busy === 'write'} onClick={aiWrite}><Sparkles size={14} />Write with AI</Button>
            </div>
          </div>
          <Textarea aria-label="Job description" rows={8} value={j.description} onChange={(e) => set({ description: e.target.value })} placeholder="Paste the client's JD and press Read pasted JD to fill the fields. Or type a few notes and press Write with AI." />
        </div>
        {err && <div className="span-2"><ErrorBox>{err}</ErrorBox></div>}
        <div className="span-2 row row--end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="ink" type="submit" busy={busy === 'save'}>{job ? 'Save changes' : 'Create job'}</Button>
        </div>
      </form>
    </Dialog>
  )
}
