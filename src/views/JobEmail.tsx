import { useState } from 'react'
import { Button, Field, Input, LinkButton, Textarea, useToast } from '../components/ui'
import { canServerSend, gmailLink, mailtoLink, saveFile, sendEmail } from '../lib/integrations'
import type { Job } from '../lib/types'
import { useStore } from '../lib/store'
function jobBrief(job: Job) {
 return `${job.title}${job.client?' — '+job.client:''}\n\nLocation: ${job.location.label} (${job.workMode})\nExperience: ${job.expMin}–${job.expMax} years\nBudget: ${job.ctcMinLpa ? job.ctcMinLpa+'–' : 'up to '}${job.ctcMaxLpa} LPA\nNotice: up to ${job.noticeMaxDays} days\nOpenings: ${job.openings}\nMust-have: ${job.mustSkills.join(', ')}\nNice-to-have: ${job.niceSkills.join(', ') || '—'}\n\n${job.description}`
}
export function JobEmail({job,to:initialTo='',recipient='external recruiter or freelancer'}:{job:Job;to?:string;recipient?:string}) {
 const cfg=useStore(s=>s.config)
 const [to,setTo]=useState(initialTo),[subject,setSubject]=useState(`Job requirements: ${job.title}`),[text,setText]=useState(()=>`Hi,\n\nPlease review the job requirements below.\n\n${jobBrief(job)}\n\nRegards,\n${cfg.recruiterName||cfg.companyName}`),[busy,setBusy]=useState(false)
 const toast=useToast(),valid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim()) && !!subject.trim() && !!text.trim()
 return <div className="stack" aria-label="Email job requirements">
  <h3>Email job requirements</h3><p className="small muted">Send these details to the {recipient}. They can read the full brief without a HireLens account.</p>
  <Field label="Recipient email"><Input type="email" value={to} onChange={e=>setTo(e.target.value)}/></Field>
  <Field label="Email subject"><Input value={subject} onChange={e=>setSubject(e.target.value)}/></Field>
  <Field label="Job requirements message"><Textarea rows={10} value={text} onChange={e=>setText(e.target.value)}/></Field>
  <div className="row"><LinkButton href={valid?gmailLink(to,subject,text):undefined} aria-disabled={!valid}>Open Gmail draft</LinkButton><LinkButton href={valid?mailtoLink(to,subject,text):undefined} aria-disabled={!valid}>Open email app</LinkButton>
  <Button onClick={()=>saveFile(`${job.title.replace(/\W+/g,'-')}-requirements.txt`,text,'text/plain')}>Download job brief</Button>
  {canServerSend() && <Button variant="ink" busy={busy} disabled={!valid} onClick={async()=>{setBusy(true);try{await sendEmail(to.trim(),subject,text);toast('Job requirements emailed')}catch(e){toast((e as Error).message,{kind:'error'})}finally{setBusy(false)}}}>Send email</Button>}</div>
 </div>
}
