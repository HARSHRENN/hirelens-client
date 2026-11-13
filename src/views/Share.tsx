import { Copy, Download, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, ErrorBox, Field, Groove, Input, LinkButton, Textarea, useToast } from '../components/ui'
import { complete } from '../lib/ai'
import { canServerSend, copy, fireWebhook, jobCreative, saveFile, shareLinks } from '../lib/integrations'
import { setConfig, useStore } from '../lib/store'
import type { Job } from '../lib/types'

export function Share({ job }: { job: Job }) {
  const cfg = useStore((s) => s.config)
  const webhook = useStore((s) => s.secrets.webhookUrl)
  const links = shareLinks(job, cfg.companyName, cfg.careersUrl)
  const [which, setWhich] = useState<'long' | 'short'>('long')
  const [text, setText] = useState(links.long)
  const [img, setImg] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const toast = useToast()

  useEffect(() => { setText(which === 'long' ? links.long : links.short) }, [which, job.updatedAt, cfg.careersUrl]) // eslint-disable-line
  useEffect(() => { let url = ''; jobCreative(job, cfg.companyName).then((b) => { url = URL.createObjectURL(b); setImg(url) }); return () => { if (url) URL.revokeObjectURL(url) } }, [job.updatedAt, cfg.companyName]) // eslint-disable-line

  async function polish() {
    setBusy(true); setErr('')
    try {
      const t = await complete(`Rewrite this job post for ${which === 'long' ? 'LinkedIn (under 1,200 characters, short lines, 3-5 hashtags at the end)' : 'X (under 270 characters including 2-3 hashtags)'}. Keep every fact. Plain, specific, no emoji, no hype words like "exciting" or "rockstar".\n\n${text}`)
      setText(t.trim())
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  const enc = encodeURIComponent(text)
  const shareUrl = {
    linkedin: `https://www.linkedin.com/feed/?shareActive=true&text=${enc}`,
    x: `https://x.com/intent/post?text=${enc}`,
    whatsapp: `https://wa.me/?text=${enc}`,
  }

  return <section className="section">
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <Groove label="Post length" value={which} onChange={setWhich} options={[{ value: 'long', label: 'LinkedIn, Facebook, Instagram' }, { value: 'short', label: 'X' }]} />
          <Button size="sm" busy={busy} onClick={polish}><Sparkles size={14} />Polish with AI</Button>
        </div>
        <Textarea aria-label="Post text" rows={14} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row"><span className="xs muted fig">{text.length} characters</span></div>
        {err && <ErrorBox>{err}</ErrorBox>}
        <Field label="Apply link" hint="Your careers page or a form. Goes into every post and the Facebook share.">
          <Input type="url" inputMode="url" placeholder="https://careers.example.com/java" defaultValue={cfg.careersUrl} onBlur={(e) => e.target.value !== cfg.careersUrl && setConfig({ careersUrl: e.target.value.trim() })} />
        </Field>
        <div className="stack">
          <span className="label">Post it</span>
          <div className="row">
            <LinkButton href={shareUrl.linkedin}>LinkedIn</LinkButton>
            <LinkButton href={shareUrl.x}>X</LinkButton>
            <LinkButton href={links.facebook} onClick={() => copy(text)}>Facebook</LinkButton>
            <LinkButton href={links.instagram} onClick={() => copy(text)}>Instagram</LinkButton>
            <LinkButton href={shareUrl.whatsapp}>WhatsApp</LinkButton>
            <Button variant="ghost" onClick={async () => toast((await copy(text)) ? 'Post copied' : 'Copy blocked here. Select the text and copy it.')}><Copy size={14} />Copy text</Button>
          </div>
          <p className="xs muted">LinkedIn, X and WhatsApp open with the text filled in. Facebook and Instagram copy the text for you to paste; Instagram also needs the image on the right.</p>
          {canServerSend() && webhook && <div><Button size="sm" onClick={async () => { try { await fireWebhook('job.publish', { job, text, channels: ['linkedin', 'x', 'facebook', 'instagram'] }); toast('Sent to your automation for auto-posting') } catch (e: any) { toast(e.message, { kind: 'error' }) } }}>Auto-post through automation</Button></div>}
        </div>
      </div>
      <div className="stack">
        <span className="label">Square creative, 1080 × 1080</span>
        {img ? <img src={img} alt={`Hiring creative for ${job.title}`} width={1080} height={1080} style={{ width: '100%', height: 'auto', aspectRatio: '1', borderRadius: 'var(--radius-card)' }} /> : <div className="skel" style={{ aspectRatio: '1', height: 'auto' }} />}
        <div className="row">
          <Button size="sm" onClick={async () => {
            const b = await jobCreative(job, cfg.companyName)
            const r = await saveFile(`${job.title.replace(/\W+/g, '-').toLowerCase()}-hiring.png`, b, 'image/png')
            toast(r === 'saved' ? 'Image saved' : r === 'declined' ? 'Save cancelled' : 'Downloads are blocked here. Right-click the image to save it.')
          }}><Download size={14} />Save image</Button>
        </div>
      </div>
    </div>
  </section>
}
