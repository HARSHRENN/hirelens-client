// One rendering path for editor previews, individual/bulk messages and scheduled emails.
export const TEMPLATE_FIELDS = {
 name: 'First name', fullName: 'Candidate name', role: 'Job title', company: 'Our company', client: 'Client company', location: 'Job location', recruiter: 'Recruiter name', interviewTime: 'Interview time', round: 'Interview round'
}
export const TEMPLATE_PURPOSES = { first: 'First contact', followup: 'Follow-up', invitation: 'Interview invitation / intimation', feedback: 'Interview feedback', other: 'Other' }
export function editableTemplate(template) {
 const t = { ...template }
 // Move the original invitation's link out of the message into the optional link field.
 if (/\{\{\s*meetLink\s*\}\}/.test(t.body || '')) {
  t.body = t.body.replace(/(?:Google\s+Meet|Meet\s+link|Join\s+here|Meeting\s+link|Link)\s*:\s*\{\{\s*meetLink\s*\}\}[.]?/gi,'').replace(/\{\{\s*meetLink\s*\}\}/g,'').replace(/[ \t]{2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim()
  if (t.link === undefined) t.link = '{{meetLink}}'
 }
 return t
}
export function interpolate(text, vars = {}) {
 return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => String(vars[key] ?? '')).replace(/[ \t]+\n/g,'\n').trim()
}
export function validMessageLink(link) {
 if (!link || link === '{{meetLink}}') return true
 try { return ['http:', 'https:'].includes(new URL(link).protocol) } catch { return false }
}
export function renderTemplate(template, vars = {}) {
 const t = editableTemplate(template || {})
 const link = interpolate(t.link || '', vars)
 const body = interpolate(t.body, vars)
 return { subject: interpolate(t.subject, vars), body: [body, link && validMessageLink(link) ? link : ''].filter(Boolean).join('\n\n'), link }
}
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function trackerHtml(rows) {
 return '<table style="border-collapse:collapse;width:100%;font:13px Arial,sans-serif">'+rows.map((row,i)=>'<tr>'+row.map(value=>`<${i?'td':'th'} style="border:1px solid #ccd6e5;padding:8px;text-align:left;${i?'':'background:#eef2f8;'}">${escapeHtml(value)}</${i?'td':'th'}>`).join('')+'</tr>').join('')+'</table>'
}
export const trackerText = rows => rows.map(row=>row.map(value=>String(value??'').replace(/[\t\r\n]+/g,' ')).join('\t')).join('\n')
