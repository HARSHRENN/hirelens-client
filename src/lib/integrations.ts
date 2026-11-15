import { api } from './cloud'
import { cap, MODE, TARGET } from './runtime'
import { getState } from './store'
import type { Candidate, Job } from './types'

/* Everything that leaves the app.
 *  - WhatsApp: wa.me links only (the recruiter presses send); there is no WhatsApp API.
 *  - Email: Gmail compose links everywhere, plus server sends through the platform's
 *    Resend account for a signed-in workspace (manual sends, invites, reminders, invoices).
 *  - Calendar and social: template and share-intent links. */

export const canServerSend = () => MODE() === 'cloud'

export function phoneE164(p: string) {
  const d = (p || '').replace(/\D/g, '')
  if (d.length === 10) return '91' + d
  if (d.length === 12 && d.startsWith('91')) return d
  if (d.length === 11 && d.startsWith('0')) return '91' + d.slice(1)
  return d
}

export const waLink = (phone: string, text: string) => `https://wa.me/${phoneE164(phone)}?text=${encodeURIComponent(text)}`
export const gmailLink = (to: string, subject: string, body: string) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
export const mailtoLink = (to: string, subject: string, body: string) =>
  `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

const gcal = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
export function calendarLink(o: { title: string; start: Date; minutes: number; details: string; guests: string[] }) {
  const end = new Date(o.start.getTime() + o.minutes * 60000)
  const q = new URLSearchParams({ action: 'TEMPLATE', text: o.title, dates: `${gcal(o.start)}/${gcal(end)}`, details: o.details, add: o.guests.filter(Boolean).join(',') })
  return `https://calendar.google.com/calendar/render?${q}`
}

export async function sendEmail(to: string, subject: string, body: string, cc: string[] = []) {
  return api('app', 'send-email', { to, cc, subject, text: body })
}

export async function sendEmailWithFiles(to: string, subject: string, body: string, attachments: { filename: string; content: string }[]) {
  return api('app', 'send-email', { to, subject, text: body, attachments })
}

/** The automatic invite when a round is scheduled: the email plus a calendar file. */
export async function sendInterviewInvite(o: { to: string; cc: string[]; subject: string; text: string; start: number; minutes: number; title: string; location?: string; interviewId: string }) {
  return api('app', 'interview-invite', o)
}

export async function fireWebhook(event: string, payload: unknown) {
  const url = getState().config.webhookUrl
  if (!url || MODE() !== 'cloud') return false
  await api('app', 'webhook', { url, event, payload })
  return true
}

/* ---------- job sharing ---------- */

export function jobPost(job: Job, company: string, careersUrl: string) {
  const exp = `${job.expMin}–${job.expMax} yrs`
  const skills = job.mustSkills.slice(0, 6).join(' · ')
  const tags = [...job.mustSkills.slice(0, 4), 'hiring', job.location.label.split(',')[0] || ''].map((t) => '#' + t.replace(/[^a-z0-9]/gi, '')).filter((t) => t.length > 1).join(' ')
  const long = `We're hiring: ${job.title} at ${company}\n\nLocation: ${job.location.label} (${job.workMode})\nExperience: ${exp}, notice up to ${job.noticeMaxDays} days\nSkills: ${skills}\n\n${job.description.split('\n').filter(Boolean).slice(0, 4).join('\n')}\n\n${careersUrl ? `Apply: ${careersUrl}\n\n` : 'DM us or reply with your resume.\n\n'}${tags}`
  const short = `Hiring: ${job.title}, ${job.location.label} (${job.workMode}), ${exp}. Skills: ${job.mustSkills.slice(0, 4).join(', ')}.${careersUrl ? ' Apply: ' + careersUrl : ' DM to apply.'} ${tags}`.slice(0, 280)
  return { long, short }
}

export function shareLinks(job: Job, company: string, careersUrl: string) {
  const { long, short } = jobPost(job, company, careersUrl)
  return {
    linkedin: `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(long)}`,
    x: `https://x.com/intent/post?text=${encodeURIComponent(short)}`,
    facebook: careersUrl ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(careersUrl)}` : 'https://www.facebook.com/',
    instagram: 'https://www.instagram.com/',
    whatsapp: `https://wa.me/?text=${encodeURIComponent(long)}`,
    long, short,
  }
}

/** A square hiring creative for Instagram/LinkedIn, drawn on canvas in the brand's deep blue. */
export async function jobCreative(job: Job, company: string): Promise<Blob> {
  const S = 1080, c = document.createElement('canvas'); c.width = S; c.height = S
  const g = c.getContext('2d')!
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, d: string) => css.getPropertyValue(name).trim() || d
  const font = v('--font-display', 'system-ui')
  try { await (document as any).fonts?.load?.(`300 100px ${font}`); await (document as any).fonts?.load?.(`500 40px ${font}`) } catch { /* use fallback */ }
  // ground: deep blue with a light bloom top-left
  const lg = g.createLinearGradient(0, 0, S, S); lg.addColorStop(0, '#0e459a'); lg.addColorStop(1, '#082a62')
  g.fillStyle = lg; g.fillRect(0, 0, S, S)
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.9); rg.addColorStop(0, 'rgba(141,186,240,.45)'); rg.addColorStop(1, 'rgba(141,186,240,0)')
  g.fillStyle = rg; g.fillRect(0, 0, S, S)
  // halftone ring, bottom-right
  for (let y = 24; y < S; y += 28) for (let x = 24; x < S; x += 28) {
    const d = Math.hypot(x - S * 0.92, y - S * 0.95), ring = Math.exp(-(((d - 360) / 150) ** 2))
    if (ring < 0.05) continue
    g.globalAlpha = 0.15 + 0.55 * ring; g.fillStyle = '#ffffff'
    g.beginPath(); g.arc(x, y, 1.2 + 4.5 * ring, 0, Math.PI * 2); g.fill()
  }
  g.globalAlpha = 1
  // seal
  g.fillStyle = v('--color-accent', '#ddf545'); roundRect(g, 96, 96, 300, 64, 32); g.fill()
  g.fillStyle = '#06142e'; roundRect(g, 120, 116, 24, 24, 6); g.fill()
  g.font = `500 32px ${font}`; g.fillText('We are hiring', 160, 140)
  g.fillStyle = '#ffffff'; g.font = `400 34px ${font}`; g.globalAlpha = 0.8; g.fillText(company, 96, 236); g.globalAlpha = 1
  g.font = `300 104px ${font}`
  const lines = wrap(g, job.title, 96, 380, S - 192, 104, 3)
  let y = 380 + lines * 104 + 40
  g.font = `400 36px ${font}`; g.fillStyle = '#d0e1f8'
  g.fillText(`${job.location.label}, ${job.workMode}`, 96, y); y += 52
  g.fillText(`${job.expMin} to ${job.expMax} years, notice up to ${job.noticeMaxDays} days`, 96, y); y += 80
  // skill pills
  g.font = `400 30px ${font}`
  let x = 96
  for (const s of job.mustSkills.slice(0, 6)) {
    const w = g.measureText(s).width + 48
    if (x + w > S - 96) { x = 96; y += 70 }
    if (y > S - 120) break
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; roundRect(g, x, y - 40, w, 56, 28); g.stroke()
    g.fillStyle = '#ffffff'; g.fillText(s, x + 24, y - 2); x += w + 14
  }
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/png'))
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
}
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, maxLines: number) {
  const words = text.split(' '); let line = '', n = 0
  for (const w of words) {
    const t = line ? line + ' ' + w : w
    if (g.measureText(t).width > max && line) { g.fillText(line, x, y + n * lh); line = w; if (++n >= maxLines) return n } else line = t
  }
  if (line) { g.fillText(line, x, y + n * lh); n++ }
  return n
}

/* ---------- files out ---------- */

export async function saveFile(filename: string, data: Blob | string, mime = 'text/plain') {
  const dl: any = await cap('downloads')
  if (dl) {
    try { await dl.save({ filename, data: typeof data === 'string' ? new Blob([data], { type: mime }) : data }); return 'saved' }
    catch (e: any) {
      if (e?.code === 'declined' || e?.code === 'cancelled') return 'declined'
      try { await dl.save({ filename, data: typeof data === 'string' ? data : await data.text() }); return 'saved' } catch { /* fall back */ }
    }
  }
  if (TARGET === 'artifact') return 'unavailable'
  const url = URL.createObjectURL(typeof data === 'string' ? new Blob([data], { type: mime }) : data)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'saved'
}

export async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

export const candidateVars = (c: Candidate, job: Job | undefined, cfg: { companyName: string; recruiterName: string }) => ({
  name: c.name.split(' ')[0] || c.name, fullName: c.name, role: job?.title || '', company: cfg.companyName,
  client: job?.client || '', location: job?.location.label || '', recruiter: cfg.recruiterName || 'the hiring team',
  meetLink: c.meetLink || '', interviewTime: c.interviewAt ? new Date(c.interviewAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '',
})
