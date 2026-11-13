import { Plus, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { Button, Dialog, Empty, ErrorBox, Field, Groove, Input, Skeleton, Textarea, useToast } from '../components/ui'
import { complete } from '../lib/ai'
import { put, remove, useStore } from '../lib/store'
import type { Template } from '../lib/types'
import { useUi } from '../lib/uictx'
import { ago, fill, uid } from '../lib/util'

const VARS = ['name', 'fullName', 'role', 'company', 'client', 'location', 'recruiter', 'interviewTime', 'meetLink']
const SAMPLE = { name: 'Asha', fullName: 'Asha Example', role: 'Senior Java Developer', company: 'AlphacodeAI', client: 'Example Fintech', location: 'Malad, Mumbai', recruiter: 'Riya', interviewTime: 'Tue, 18 Nov, 11:00 am', meetLink: 'https://meet.google.com/abc-defg-hij' }

export function Outreach() {
  const ready = useStore((s) => s.ready)
  const templates = useStore((s) => s.templates)
  const cands = useStore((s) => s.candidates)
  const [channel, setChannel] = useState<Template['channel']>('whatsapp')
  const [editing, setEditing] = useState<Template | null>(null)
  const { openCandidate } = useUi()

  const list = Object.values(templates).filter((t) => t.channel === channel).sort((a, b) => a.name.localeCompare(b.name))
  const log = useMemo(() => Object.values(cands).flatMap((c) => c.remarks.filter((r) => ['whatsapp', 'email', 'call', 'meet'].includes(r.kind)).map((r) => ({ ...r, c }))).sort((a, b) => b.at - a.at).slice(0, 30), [cands])

  return <>
    <TopBar title="Outreach" actions={<Button variant="ink" onClick={() => setEditing({ id: uid('t'), channel, name: '', body: '', subject: channel === 'email' ? '' : undefined })}><Plus size={16} />New template</Button>} />
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <section className="section">
        <div className="section-head"><h2>Templates</h2><Groove label="Channel" value={channel} onChange={setChannel} options={[{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'Email' }]} /></div>
        {!ready ? <Skeleton /> : !list.length ? <Empty title={`No ${channel === 'email' ? 'email' : 'WhatsApp'} templates`} action={<Button onClick={() => setEditing({ id: uid('t'), channel, name: '', body: '' })}>Write one</Button>}>Templates fill in the candidate's name, the role and the interview link for you.</Empty> : (
          <div className="stack">{list.map((t) => (
            <button key={t.id} type="button" className="stock" onClick={() => setEditing(t)} style={{ all: 'unset', cursor: 'pointer', display: 'grid', gap: 'var(--space-xs)', padding: 'var(--space-lg)', background: 'var(--color-cotton)', borderRadius: 'var(--radius-card)', boxShadow: '0 0 0 1px var(--color-rule)' }}>
              <b style={{ fontWeight: 500 }}>{t.name}</b>
              {t.subject && <span className="small">{fill(t.subject, SAMPLE)}</span>}
              <span className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-wrap' }}>{fill(t.body, SAMPLE)}</span>
            </button>))}</div>
        )}
      </section>
      <section className="section">
        <div className="section-head"><h2>Contact log</h2><p>Messages, calls and interviews across every job</p></div>
        {log.length ? <ul className="feed">{log.map((l) => (
          <li key={l.id}><span><button className="linkbtn" onClick={() => openCandidate(l.c.id)}>{l.c.name}</button> <span className="kind">{l.text}</span></span><time>{ago(l.at)}</time></li>))}</ul>
          : <p className="small muted">Nothing yet. Open a candidate, then Message, to send the first one.</p>}
      </section>
    </div>
    {editing && <TemplateEditor t={editing} onClose={() => setEditing(null)} isNew={!templates[editing.id]} />}
  </>
}

function TemplateEditor({ t, onClose, isNew }: { t: Template; onClose: () => void; isNew: boolean }) {
  const [x, setX] = useState(t)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const toast = useToast()
  const save = async () => { if (!x.name.trim() || !x.body.trim()) { setErr('Give the template a name and a message.'); return } await put('templates', x); toast('Template saved'); onClose() }
  async function draft() {
    setBusy(true); setErr('')
    try {
      const out = await complete(`Write a ${x.channel === 'whatsapp' ? 'WhatsApp message (under 400 characters, warm, no emoji)' : 'recruiting email body (under 120 words)'} for an Indian recruiter. Purpose: ${x.name || 'first contact with a candidate'}. Use these placeholders exactly where they fit: ${VARS.map((v) => `{{${v}}}`).join(', ')}. Output only the message.`)
      setX({ ...x, body: out.trim() })
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return <Dialog title={isNew ? 'New template' : 'Edit template'} onClose={onClose} wide footer={<>
    {!isNew && <Button variant="danger" onClick={async () => { await remove('templates', x.id); toast('Template deleted'); onClose() }}><Trash2 size={14} />Delete</Button>}
    <span style={{ flex: 1 }} />
    <Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="ink" onClick={save}>Save template</Button>
  </>}>
    <div className="grid-2" style={{ gap: 'var(--space-lg)' }}>
      <div className="stack">
        <Field label="Name"><Input value={x.name} onChange={(e) => setX({ ...x, name: e.target.value })} placeholder="Interview reminder" /></Field>
        {x.channel === 'email' && <Field label="Subject"><Input value={x.subject || ''} onChange={(e) => setX({ ...x, subject: e.target.value })} /></Field>}
        <Field label="Message" hint={<>Placeholders: {VARS.map((v) => <code key={v} className="kbd" style={{ marginRight: 4 }}>{`{{${v}}}`}</code>)}</>}>
          <Textarea rows={10} value={x.body} onChange={(e) => setX({ ...x, body: e.target.value })} />
        </Field>
        <div><Button size="sm" busy={busy} onClick={draft}><Sparkles size={14} />Draft with AI</Button></div>
        {err && <ErrorBox>{err}</ErrorBox>}
      </div>
      <div className="stack"><span className="label">Preview with sample values</span>
        {x.subject && <b style={{ fontWeight: 500 }}>{fill(x.subject, SAMPLE)}</b>}
        <div className="preview-msg stock">{fill(x.body, SAMPLE) || 'Your message appears here.'}</div>
      </div>
    </div>
  </Dialog>
}
