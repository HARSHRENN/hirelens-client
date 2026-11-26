import { useState } from 'react'
import { Button, Dialog, ErrorBox, Field, Input, useToast } from '../components/ui'
import { api } from '../lib/cloud'

export function AddRecruiter({ onCreated }: { onCreated?: () => void | Promise<void> }) {
  const [open,setOpen]=useState(false)
  return <><Button onClick={()=>setOpen(true)}>Add recruiter</Button>{open && <RecruiterForm onClose={()=>setOpen(false)} onCreated={onCreated}/>}</>
}
function RecruiterForm({onClose,onCreated}:{onClose:()=>void;onCreated?:()=>void|Promise<void>}) {
  const [form,setForm]=useState({fullName:'',email:'',username:'',company:'',password:''})
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const toast=useToast()
  async function submit(e:React.FormEvent) {
    e.preventDefault();setBusy(true);setError('')
    try {
      await api('admin','create-recruiter',form)
      toast('Recruiter created. Share the login details privately; assign jobs from Jobs → Assign recruiter.')
      onClose()
      await onCreated?.()
    } catch(e) {setError((e as Error).message)} finally {setBusy(false)}
  }
  return <Dialog title="Add recruiter" onClose={()=>{if(!busy)onClose()}}><form className="stack" onSubmit={submit}>
    <p className="small muted">Create a recruiter login, then assign jobs to them. Recruiters can access only their assigned jobs and candidates.</p>
    {error && <ErrorBox>{error}</ErrorBox>}
    <Field label="Recruiter name"><Input required maxLength={80} value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/></Field>
    <Field label="Recruiter email"><Input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></Field>
    <Field label="Username" hint="3–30 lowercase letters, numbers or hyphens. Used in their workspace URL."><Input required pattern="[a-z0-9][a-z0-9-]{2,29}" value={form.username} onChange={e=>setForm({...form,username:e.target.value.toLowerCase()})}/></Field>
    <Field label="Company (optional)"><Input maxLength={100} value={form.company} onChange={e=>setForm({...form,company:e.target.value})}/></Field>
    <Field label="Login password" hint="Share the email and password privately. The recruiter can use Forgot password to choose a new password."><Input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></Field>
    <p className="xs muted">This creates an active account. It does not send an email automatically.</p>
    <div className="row row--end"><Button disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="ink" busy={busy}>Create recruiter</Button></div>
  </form></Dialog>
}
