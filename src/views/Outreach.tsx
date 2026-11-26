import { Plus, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { TopBar } from '../components/TopBar'
import { Button, Dialog, Empty, ErrorBox, Field, Groove, Input, Select, Skeleton, useToast } from '../components/ui'
import { complete } from '../lib/ai'
import { put, remove, useStore } from '../lib/store'
import type { Template } from '../lib/types'
import { useUi } from '../lib/uictx'
import { ago, uid } from '../lib/util'

import { TemplateText } from '../components/TemplateText'
import { editableTemplate, renderTemplate, validMessageLink, TEMPLATE_PURPOSES } from '../../shared/communication.js'

const VARS = ['name', 'fullName', 'role', 'company', 'client', 'location', 'recruiter', 'interviewTime', 'round']
const SAMPLE = { round: 'L1 screening', name: 'Asha', fullName: 'Asha Example', role: 'Senior Java Developer', company: 'Example Staffing', client: 'Example Fintech', location: 'Malad, Mumbai', recruiter: 'Riya', interviewTime: 'Tue, 18 Nov, 11:00 am', meetLink: 'https://meet.google.com/abc-defg-hij' }

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
              {t.subject && <span className="small">{renderTemplate(t, SAMPLE).subject}</span>}
              <span className="small muted" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'pre-wrap' }}>{renderTemplate(t, SAMPLE).body}</span>
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
  const [x, setX] = useState<Template>(() => editableTemplate(t))
  const [previous, setPrevious] = useState('')
  const [saving,setSaving]=useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const toast = useToast()
  const save = async () => {
    if (!x.name.trim() || !x.body.trim()) { setErr('Give the template a name and a message.'); return }
    if (!validMessageLink(x.link)) { setErr('Use a full http:// or https:// link, or leave it empty.'); return }
    setSaving(true);setErr('')
    try {await put('templates',{...x,name:x.name.trim()});toast('Template saved');onClose()}
    catch(e){setErr((e as Error).message)}finally{setSaving(false)}
  }
  async function draft(rephrase = false) {
    setBusy(true); setErr('')
    try {
      const out = await complete(`${rephrase ? 'Rephrase the following message, preserving all facts and personalisation fields' : 'Draft a recruiting message'}. Channel: ${x.channel}. Purpose: ${TEMPLATE_PURPOSES[x.purpose || 'other']}: ${x.name}. ${x.channel === 'whatsapp' ? 'Under 400 characters.' : 'Under 120 words.'} Plain, warm language. No invented details or links. Existing personalisation fields must remain unchanged. Available internal fields: ${VARS.map(v => `{{${v}}}`).join(', ')}. Return only the message body.\n\n${x.body}`)
      setPrevious(x.body); setX(current => ({ ...current, body: out.trim() }))
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return <Dialog title={isNew ? 'New template' : 'Edit template'} onClose={onClose} wide footer={<>
    {!isNew && <Button variant="danger" onClick={async () => { await remove('templates', x.id); toast('Template deleted'); onClose() }}><Trash2 size={14} />Delete</Button>}
    <span style={{ flex: 1 }} />
    <Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="ink" busy={saving} disabled={busy} onClick={save}>Save template</Button>
  </>}>
    <div className="grid-2" style={{ gap: 'var(--space-lg)' }}>
      <div className="stack">
        <Field label="Name"><Input value={x.name} onChange={(e) => setX({ ...x, name: e.target.value })} placeholder="Interview reminder" /></Field>
        {x.channel === 'email' && <Field label="Subject"><TemplateText label="Template subject" value={x.subject || ''} disabled={busy} onChange={subject=>setX({...x,subject})} /></Field>}
        <Field label="Purpose"><Select disabled={busy} value={x.purpose || 'other'} onChange={e=>setX({...x,purpose:e.target.value as Template['purpose']})} options={Object.entries(TEMPLATE_PURPOSES).map(([value,label])=>({value,label:String(label)}))} /></Field>
        <div className="field"><span>Message</span><TemplateText label="Template message" value={x.body} disabled={busy} onChange={body=>setX({...x,body})} /></div>
        <Field label="Optional link" hint="Leave empty to send without a link."><Input disabled={busy || x.link === '{{meetLink}}'} type="url" value={x.link === '{{meetLink}}' ? '' : x.link || ''} placeholder={x.link === '{{meetLink}}' ? 'Uses the scheduled interview link' : 'https://example.com (optional)'} onChange={e=>setX({...x,link:e.target.value})} /></Field>
        <label className="check"><input type="checkbox" disabled={busy} checked={x.link === '{{meetLink}}'} onChange={e=>setX({...x,link:e.target.checked?'{{meetLink}}':''})} />Use the candidate’s scheduled interview link</label>
        <div className="row"><Button size="sm" busy={busy} onClick={()=>draft()}><Sparkles size={14} />Draft with AI</Button><Button size="sm" disabled={busy || !x.body.trim()} onClick={()=>draft(true)}>Rephrase with AI</Button>{previous && <Button size="sm" disabled={busy} onClick={()=>{setX({...x,body:previous});setPrevious('')}}>Undo AI edit</Button>}</div>
        {err && <ErrorBox>{err}</ErrorBox>}
      </div>
      <div className="stack"><span className="label">Preview with sample values</span>
        {x.subject && <b style={{ fontWeight: 500 }}>{renderTemplate(x, SAMPLE).subject}</b>}
        <div className="preview-msg stock">{renderTemplate(x, SAMPLE).body || 'Your message appears here.'}</div>
      </div>
    </div>
  </Dialog>
}
