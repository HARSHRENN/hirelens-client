import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?raw'
import { complete } from './ai'

let workerReady = false
function ensureWorker() {
  if (workerReady) return
  const url = URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' }))
  pdfjs.GlobalWorkerOptions.workerSrc = url
  workerReady = true
}

export const ACCEPT = '.pdf,.docx,.doc,.txt,.rtf,.md,.png,.jpg,.jpeg,.webp'

export type Kind = 'pdf' | 'docx' | 'doc' | 'text' | 'image' | 'unknown'
export function kindOf(f: File): Kind {
  const n = f.name.toLowerCase()
  if (n.endsWith('.pdf') || f.type === 'application/pdf') return 'pdf'
  if (n.endsWith('.docx')) return 'docx'
  if (n.endsWith('.doc')) return 'doc'
  if (/\.(txt|md|rtf)$/.test(n) || f.type.startsWith('text/')) return 'text'
  if (/\.(png|jpe?g|webp)$/.test(n) || f.type.startsWith('image/')) return 'image'
  return 'unknown'
}

/** Returns the resume's plain text. Scanned PDFs and photos are read by the AI. */
export async function extractText(f: File): Promise<{ text: string; kind: Kind; via: string }> {
  const kind = kindOf(f)
  if (kind === 'pdf') {
    ensureWorker()
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise
    const pages: string[] = []
    for (let i = 1; i <= Math.min(doc.numPages, 12); i++) {
      const p = await doc.getPage(i)
      const tc = await p.getTextContent()
      let line = '', out = ''
      let lastY: number | null = null
      for (const it of tc.items as any[]) {
        const y = it.transform?.[5]
        if (lastY != null && Math.abs(y - lastY) > 2) { out += line.trim() + '\n'; line = '' }
        line += it.str + (it.hasEOL ? '\n' : ' ')
        lastY = y
      }
      pages.push(out + line)
    }
    const text = pages.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    if (text.length > 80) return { text, kind, via: 'pdf text' }
    // scanned: render first two pages to images and let the AI read them
    const imgs: Blob[] = []
    for (let i = 1; i <= Math.min(doc.numPages, 2); i++) {
      const p = await doc.getPage(i)
      const vp = p.getViewport({ scale: 1.6 })
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height
      await p.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c } as any).promise
      imgs.push(await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.85)))
    }
    return { text: await ocr(imgs), kind, via: 'AI read the scan' }
  }
  if (kind === 'docx') {
    const mammoth: any = await import('mammoth/mammoth.browser.min.js')
    const r = await (mammoth.default || mammoth).extractRawText({ arrayBuffer: await f.arrayBuffer() })
    return { text: r.value.trim(), kind, via: 'docx text' }
  }
  if (kind === 'text') return { text: (await f.text()).replace(/\{\\[^}]*\}|\\[a-z]+\d* ?/g, ' ').trim(), kind, via: 'plain text' }
  if (kind === 'image') return { text: await ocr([f]), kind, via: 'AI read the image' }
  if (kind === 'doc') {
    // legacy Word: pull printable runs out of the binary; good enough for names, skills and numbers
    const buf = new Uint8Array(await f.arrayBuffer())
    let s = '', run = ''
    for (const b of buf) {
      if ((b >= 32 && b < 127) || b === 10 || b === 13) run += String.fromCharCode(b)
      else { if (run.length >= 4) s += run + ' '; run = '' }
    }
    return { text: s.replace(/\s+/g, ' ').trim().slice(0, 30000), kind, via: 'legacy .doc (best effort)' }
  }
  throw new Error(`${f.name}: this file type is not supported. Use PDF, DOCX, DOC, TXT or an image.`)
}

async function ocr(images: Blob[]) {
  return complete('Transcribe all text in this resume image exactly, top to bottom, as plain text. Keep section headings. Output only the text.', { images })
}
