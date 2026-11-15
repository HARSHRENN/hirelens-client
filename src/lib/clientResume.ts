import { jsPDF } from 'jspdf'
import type { Candidate, Job } from './types'

/* Client-format resume: the agency's own layout, the candidate's email and phone
 * removed everywhere, and the agency name watermarked across every page. */

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g
const PHONE = /(?:\+?\d[\d\s-]{8,}\d)/g
export const redact = (t: string) => t.replace(EMAIL, '[email hidden]').replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 10 ? '[phone hidden]' : m))

const fmt = (n: number | null | undefined, unit: string) => (n == null ? 'Not stated' : `${+n.toFixed(1)} ${unit}`)

export function clientResumePdf(c: Candidate, job: Job | undefined, agency: string): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48
  let y = 0

  const watermark = () => {
    doc.saveGraphicsState()
    doc.setGState(new (doc as any).GState({ opacity: 0.07 }))
    doc.setFont('helvetica', 'bold'); doc.setFontSize(54); doc.setTextColor(10, 77, 166)
    for (let yy = 140; yy < H; yy += 220) doc.text(agency.toUpperCase(), W / 2, yy, { angle: 30, align: 'center' })
    doc.restoreGraphicsState()
  }
  const header = () => {
    doc.setFillColor(6, 20, 46); doc.rect(0, 0, W, 54, 'F')
    doc.setFillColor(221, 245, 69); doc.rect(M, 22, 10, 10, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(agency, M + 18, 31)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    doc.text(`Candidate profile${job ? ` for ${job.title}` : ''}`, W - M, 31, { align: 'right' })
    y = 92
  }
  const page = () => { doc.addPage(); watermark(); header() }
  const need = (h: number) => { if (y + h > H - 56) page() }
  const heading = (t: string) => {
    need(40); y += 8
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(6, 20, 46); doc.text(t.toUpperCase(), M, y)
    doc.setDrawColor(159, 179, 209); doc.setLineDashPattern([2, 1], 0); doc.line(M, y + 6, W - M, y + 6); doc.setLineDashPattern([], 0)
    y += 22
  }
  const para = (t: string, size = 10, color: [number, number, number] = [51, 51, 51]) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...color)
    for (const line of doc.splitTextToSize(t, W - 2 * M) as string[]) { need(size + 4); doc.text(line, M, y); y += size + 4 }
  }

  watermark(); header()
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(6, 20, 46); doc.text(c.name || 'Candidate', M, y); y += 20
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(47, 116, 208)
  doc.text([c.currentRole, c.currentCompany].filter(Boolean).join(', ') || 'Profile', M, y); y += 10

  heading('Snapshot')
  const facts: [string, string][] = [
    ['Total experience', fmt(c.totalExp, 'years')], ['Relevant experience', fmt(c.relevantExp, 'years')],
    ['Current location', c.currentLocation.label || 'Not stated'], ['Notice period', c.noticeDays == null ? 'Not stated' : c.noticeDays === 0 ? 'Immediate' : `${c.noticeDays} days`],
    ['Expected CTC', fmt(c.expectedCtcLpa, 'LPA')], ['Companies worked', String(new Set((c.employment || []).map((e) => e.company)).size || 'Not stated')],
  ]
  doc.setFontSize(10)
  facts.forEach(([k, v], i) => {
    const x = M + (i % 2) * ((W - 2 * M) / 2)
    if (i % 2 === 0) need(18)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 130, 150); doc.text(k, x, y)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(6, 20, 46); doc.text(v, x + 120, y)
    if (i % 2 === 1) y += 18
  })
  if (c.match) { y += 4; para(`Match against the requirement: ${c.match.score}%. ${c.match.verdict || ''}`, 10, [6, 20, 46]) }

  if (c.summary) { heading('Summary'); para(redact(c.summary)) }
  if (c.skills.length) { heading('Skills'); para(c.skills.join('  ·  ')) }
  if (c.employment?.length) {
    heading('Employment')
    for (const e of c.employment) {
      need(30)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(6, 20, 46); doc.text(`${e.role || 'Role'}, ${e.company}`, M, y)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 130, 150); doc.text(`${e.from} to ${e.to}`, W - M, y, { align: 'right' }); y += 16
    }
  }
  if (c.education) { heading('Education'); para(redact(c.education)) }
  if (c.resumeText) { heading('Resume'); para(redact(c.resumeText).replace(/\n{2,}/g, '\n').slice(0, 9000), 9, [70, 70, 70]) }

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140, 150, 165)
    doc.text(`Shared by ${agency}. Contact details are held by the agency.`, M, H - 28)
    doc.text(`${i} / ${pages}`, W - M, H - 28, { align: 'right' })
  }
  return doc.output('blob')
}
