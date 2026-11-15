import { fail, isEmail, originOf, route } from './_lib/http.js'
import { sendMail } from './_lib/mail.js'
import { emailReady, getSettings } from './_lib/settings.js'
import { adminEmails, countUsage, db, logUsage } from './_lib/supa.js'

// Sign-up, verification and password reset. Supabase creates the user and the one-time
// token; the email itself goes out through the platform's Resend key, with a link back to
// this site (/verify or /reset), so no Supabase email or redirect settings are needed.
const USERNAME = /^[a-z0-9][a-z0-9-]{2,29}$/
const RESERVED = new Set(['admin', 'api', 'app', 'login', 'signup', 'demo', 'verify', 'reset', 'forgot', 'u', 'www', 'support', 'help', 'billing', 'settings'])

async function usernameFree(u) {
  if (!USERNAME.test(u) || RESERVED.has(u)) return false
  const { data } = await db().from('profiles').select('id').eq('username', u).maybeSingle()
  return !data
}

const verifyEmail = (name, link, product) => `Hi ${name},

Welcome to ${product}. Confirm your email to open your workspace:

${link}

The link works once and expires in 24 hours. If you did not sign up, ignore this email.`

async function throttle(kind, email) {
  // at most 5 verification or reset emails an hour per address
  const n = await countUsage({ kindLike: `auth:${kind}`, since: Date.now() - 36e5, owner: null })
  const { count } = await db().from('usage_log').select('id', { count: 'exact', head: true }).eq('kind', `auth:${kind}`).eq('detail', email).gte('at', new Date(Date.now() - 36e5).toISOString())
  if ((count || 0) >= 5 || n > 500) fail(429, 'Too many emails to this address. Wait an hour and try again.')
  await logUsage(null, `auth:${kind}`, email)
}

export default route({
  async 'check-username'(_req, b) {
    const u = String(b.username || '').toLowerCase()
    return { available: await usernameFree(u), valid: USERNAME.test(u) && !RESERVED.has(u) }
  },

  async signup(req, b) {
    const s = await getSettings()
    const email = String(b.email || '').trim().toLowerCase()
    const username = String(b.username || '').trim().toLowerCase()
    const fullName = String(b.fullName || '').trim().slice(0, 80)
    const company = String(b.company || '').trim().slice(0, 100)
    const phone = String(b.phone || '').trim().slice(0, 20)
    const password = String(b.password || '')
    if (!fullName) fail(400, 'Add your name.')
    if (!isEmail(email)) fail(400, 'Enter a valid work email.')
    if (!USERNAME.test(username) || RESERVED.has(username)) fail(400, 'Pick a username of 3 to 30 lowercase letters, numbers or hyphens.')
    if (password.length < 8) fail(400, 'Use a password of at least 8 characters.')
    if (!(await usernameFree(username))) fail(409, `The username "${username}" is taken. Try another.`)

    const meta = { full_name: fullName, username }
    let userId, link = null
    if (emailReady(s)) {
      const { data, error } = await db().auth.admin.generateLink({ type: 'signup', email, password, options: { data: meta } })
      if (error) fail(error.status === 422 || /registered|exists/i.test(error.message) ? 409 : 400, /registered|exists/i.test(error.message) ? 'An account with this email already exists. Log in, or reset your password.' : error.message)
      userId = data.user.id
      link = `${originOf(req)}/verify?type=signup&token_hash=${encodeURIComponent(data.properties.hashed_token)}`
    } else {
      // no email provider yet: confirm straight away so the platform still works
      const { data, error } = await db().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta })
      if (error) fail(/registered|exists/i.test(error.message) ? 409 : 400, /registered|exists/i.test(error.message) ? 'An account with this email already exists. Log in, or reset your password.' : error.message)
      userId = data.user.id
    }
    const role = adminEmails().includes(email) ? 'admin' : 'hr'
    const { error: pe } = await db().from('profiles').insert({ id: userId, username, full_name: fullName, company, phone, email, role, trial_days: s.trialDays, trial_start: new Date().toISOString() })
    if (pe) {
      await db().auth.admin.deleteUser(userId).catch(() => {})
      fail(pe.code === '23505' ? 409 : 500, pe.code === '23505' ? `The username "${username}" was just taken. Try another.` : pe.message)
    }
    await db().from('docs').insert({ owner: userId, coll: 'config', id: 'app', data: { id: 'app', companyName: company || fullName, recruiterName: fullName } })
    await logUsage(userId, 'signup', email)
    if (link) {
      await sendMail({ owner: userId, kind: 'email:auth', to: email, subject: `Confirm your ${s.productName} account`, text: verifyEmail(fullName.split(' ')[0], link, s.productName) })
      return { ok: true, verify: true }
    }
    return { ok: true, verify: false }
  },

  async 'resend-verification'(req, b) {
    const s = await getSettings()
    const email = String(b.email || '').trim().toLowerCase()
    if (!isEmail(email) || !emailReady(s)) return { ok: true }
    await throttle('verify', email)
    // a magic link also confirms the address; signup links need the password again
    const { data, error } = await db().auth.admin.generateLink({ type: 'magiclink', email })
    if (error || !data?.properties?.hashed_token) return { ok: true } // say nothing about whether the account exists
    const link = `${originOf(req)}/verify?type=magiclink&token_hash=${encodeURIComponent(data.properties.hashed_token)}`
    await sendMail({ kind: 'email:auth', to: email, subject: `Confirm your ${s.productName} account`, text: verifyEmail('there', link, s.productName) })
    return { ok: true }
  },

  async forgot(req, b) {
    const s = await getSettings()
    const email = String(b.email || '').trim().toLowerCase()
    if (!isEmail(email)) fail(400, 'Enter the email you signed up with.')
    if (!emailReady(s)) fail(503, 'Password reset emails are not set up yet. Ask the platform admin.')
    await throttle('reset', email)
    const { data, error } = await db().auth.admin.generateLink({ type: 'recovery', email })
    if (error || !data?.properties?.hashed_token) return { ok: true }
    const link = `${originOf(req)}/reset?type=recovery&token_hash=${encodeURIComponent(data.properties.hashed_token)}`
    await sendMail({ kind: 'email:auth', to: email, subject: `Reset your ${s.productName} password`, text: `Hi,\n\nSomeone asked to reset the password for this ${s.productName} account. Set a new one here:\n\n${link}\n\nThe link works once and expires in an hour. If it wasn't you, ignore this email; your password stays the same.` })
    return { ok: true }
  },
})
