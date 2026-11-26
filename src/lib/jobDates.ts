import type { Job } from './types'
export const calendarDate = (time: number) => {
  const d = new Date(time)
  return Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : ''
}
export const vacancyDate = (job: Job) => job.vacancyCreatedDate || calendarDate(job.createdAt)
export function turnaroundDays(job: Job): number | null {
  if (job.status !== 'closed' || !job.positionClosedDate) return null
  const days = (Date.parse(job.positionClosedDate) - Date.parse(vacancyDate(job))) / 864e5
  return Number.isFinite(days) && days >= 0 ? Math.round(days) : null
}
export function prepareJobDates(job: Job, previous?: Job, admin = false, now = Date.now()): Job {
  const createdAt = previous?.createdAt ?? now
  const created = previous ? vacancyDate(previous) : calendarDate(now)
  let closed = job.positionClosedDate
  if (job.status !== 'closed') closed = undefined
  else if (!previous || previous.status !== 'closed') closed = admin && closed ? closed : calendarDate(now)
  else if (!admin) closed = previous.positionClosedDate
  if (closed && (!/^\d{4}-\d{2}-\d{2}$/.test(closed) || !Number.isFinite(Date.parse(closed)) || closed < created)) throw new Error('Position close date must be on or after the vacancy creation date.')
  return { ...job, createdAt, vacancyCreatedDate: created, positionClosedDate: closed }
}
