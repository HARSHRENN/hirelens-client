import { buildIcs, icsAttachment } from './ics.js'

// Each panelist gets a separate event: never include private feedback links in
// the candidate's invitation or another panelist's message.
export function panelistInvitation({ candidate, job, interview, panelist, url, organizer, owner }) {
  const title = `${interview.round.toUpperCase()}: ${candidate.name} for ${job.title || 'the role'}`.replace(/[\r\n]/g,' ')
  const text = `Hi ${panelist.name},\n\nYou are on the panel for ${candidate.name}, ${job.title || 'the role'}.\nInterview: ${new Date(interview.at).toISOString()} (calendar attachment shows your local time).${interview.meetLink ? `\nJoin interview: ${interview.meetLink}` : ''}\n\nSubmit your screening outcome, rating and feedback here:\n${url}\n\nThis private link is for you only, accepts one response and expires in 7 days. No HireLens login is needed. Your response is saved against this candidate in the recruiter portal.\n\nRegards,\n${organizer}`
  return { owner, kind: 'email:invite', to: panelist.email, subject: `Interview and feedback: ${candidate.name} · ${job.title || 'Interview'}`, text, replyTo: organizer,
    attachments: [icsAttachment(buildIcs({ uid: `${interview.id}-${panelist.id}@hirelens`.replace(/[^a-z0-9@.-]/gi,''), start: interview.at, title, description: text.replace(/\r/g,''), location: interview.meetLink?.replace(/[\r\n]/g,''), organizer, attendees: [panelist.email] }))] }
}
