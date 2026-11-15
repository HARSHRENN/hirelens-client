import { fail, isEmail } from './http.js'
import { emailReady, getSettings } from './settings.js'
import { countUsage, logUsage, startOfUtcDay, startOfUtcMonth } from './supa.js'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`)

/** A plain, readable HTML version of a text email: the product's mark, the text, a quiet footer. */
function htmlOf(text, product) {
  const paras = String(text).trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${linkify(p).replace(/\n/g, '<br>')}</p>`).join('')
  return `<!doctype html><html><body style="margin:0;background:#f5f8fc;padding:24px 12px;font-family:Helvetica,Arial,sans-serif;color:#06142e">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #dbe3ef"><tr><td style="padding:28px 28px 12px;font-size:15px;line-height:1.55">${paras}</td></tr>
<tr><td style="padding:0 28px 22px;font-size:12px;color:#5b6b85">Sent with ${esc(product)}</td></tr></table></body></html>`
}

/**
 * Send one email through Resend, inside the platform's caps.
 * kind: 'email:manual' | 'email:invite' | 'email:reminder' | 'email:invoice' | 'email:auth' | 'email:test'
 */
export async function sendMail({ owner = null, kind, to, cc = [], subject, text, attachments = [], replyTo, userCap = false }) {
  const s = await getSettings()
  if (!emailReady(s)) fail(503, 'Email is not set up yet. The platform admin adds a Resend key and sender address in /admin.')
  const toList = [].concat(to).map((x) => String(x || '').trim()).filter(isEmail)
  const ccList = [...new Set([].concat(cc).map((x) => String(x || '').trim()).filter(isEmail))].filter((x) => !toList.includes(x))
  if (!toList.length) fail(400, 'No valid recipient email address.')
  if (!subject) fail(400, 'The email needs a subject.')

  // the free Resend plan stops at 100 a day and 3,000 a month; stay under it so sign-ups and invoices still go out
  const today = await countUsage({ kindLike: 'email:%', since: startOfUtcDay() })
  if (s.emailDailyLimit && today >= s.emailDailyLimit) fail(429, `The platform has sent today's ${s.emailDailyLimit} emails. Try again tomorrow, or raise the limit in /admin.`)
  const month = await countUsage({ kindLike: 'email:%', since: startOfUtcMonth() })
  if (s.emailMonthlyLimit && month >= s.emailMonthlyLimit) fail(429, `The platform has sent this month's ${s.emailMonthlyLimit} emails.`)
  if (userCap && owner) {
    const mine = await countUsage({ owner, kindLike: 'email:manual', since: startOfUtcDay() })
    if (s.userEmailDailyLimit && mine >= s.userEmailDailyLimit) fail(429, `You have sent ${mine} emails today, the daily limit for a workspace. Try again tomorrow.`)
  }

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${s.resendKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: s.emailFrom, to: toList, ...(ccList.length ? { cc: ccList } : {}),
      ...(replyTo || s.replyTo ? { reply_to: replyTo || s.replyTo } : {}),
      subject: String(subject).slice(0, 250), text: String(text || ''), html: htmlOf(text || '', s.productName),
      ...(attachments.length ? { attachments: attachments.slice(0, 10).map((a) => ({ filename: String(a.filename), content: String(a.content), ...(a.contentType ? { content_type: a.contentType } : {}) })) } : {}),
    }),
  })
  const j = await r.json().catch(() => ({}))
  const detail = `${toList.join(', ')}${ccList.length ? ` (cc ${ccList.length})` : ''}: ${String(subject).slice(0, 120)}`
  if (!r.ok) {
    await logUsage(owner, kind, detail, false, j.message || `Resend ${r.status}`)
    fail(502, `Email not sent: ${j.message || `Resend answered ${r.status}`}`)
  }
  await logUsage(owner, kind, detail, true)
  return { id: j.id }
}

/** {{name}}-style template filling, shared by the server-side invite and reminder emails. */
export const fill = (tpl, vars) => String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] != null && vars[k] !== '' ? String(vars[k]) : `{{${k}}}`))
