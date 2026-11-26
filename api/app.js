import { panelFeedbackHandlers } from './_lib/panelFeedback.js'
import { trialEndOf, ensureInvoices } from './_lib/billing.js'
import { geocode } from './_lib/geocode.js'
import { fail, isEmail, route } from './_lib/http.js'
import { buildIcs, icsAttachment } from './_lib/ics.js'
import { sendMail } from './_lib/mail.js'
import { emailReady, getSettings } from './_lib/settings.js'
import { db, isConfigured, requireUser, supaAnon, supaUrl } from './_lib/supa.js'

const BUCKET = 'resumes'
let bucketReady = false
async function ensureBucket() {
  if (bucketReady) return
  const { error } = await db().storage.createBucket(BUCKET, { public: false, fileSizeLimit: '20MB' })
  if (error && !/exist/i.test(error.message)) throw error
  bucketReady = true
}
const safeId = (s) => String(s || '').replace(/[^a-z0-9-]/gi, '').slice(0, 64)

// Authorize private resume access against the current assignment, including after reassignment.
async function resumeContext(req, b, uploading = false) {
  const { profile, isAdmin } = await requireUser(req)
  const id = safeId(b.candidateId)
  if (!id || id !== b.candidateId) fail(400, 'Invalid candidate')
  const { data: candidate, error } = await db().from('docs').select('owner,data').eq('coll','candidates').eq('id',id).maybeSingle()
  if (error) throw error
  const jobId = candidate?.data?.jobId || (uploading ? b.jobId : null)
  if (!jobId) fail(404, 'Candidate not found')
  const { data: job } = await db().from('docs').select('owner').eq('coll','jobs').eq('id',jobId).maybeSingle()
  const { data: assignment } = await db().from('job_assignments').select('recruiter_id,original_owner').eq('job_id',jobId).maybeSingle()
  if (!job || (!isAdmin && assignment?.recruiter_id !== profile.id)) fail(403, 'This job is not assigned to you')
  if (b.jobId && b.jobId !== jobId) fail(403, 'Candidate belongs to another job')
  return { path: `jobs/${jobId}/${id}`, legacyPath: `${assignment?.original_owner || job.owner}/${id}`, candidate }
}

// Everything a signed-in recruiter's workspace asks the server for.
export default route({
  ...panelFeedbackHandlers,
  async 'job-assignments'(req) {
    const { profile, isAdmin } = await requireUser(req)
    let query = db().from('job_assignments').select('*')
    if (!isAdmin) query = query.eq('recruiter_id', profile.id)
    const { data: assignments, error } = await query
    if (error && ['PGRST205', '42P01'].includes(error.code)) return { enabled: false, assignments: [], recruiters: [] }
    if (error) throw error
    const ids = [...new Set(assignments.map(a => a.recruiter_id))]
    let people = db().from('profiles').select('id,full_name,email,status,role')
    people = isAdmin ? people.eq('role', 'hr') : people.in('id', ids.length ? ids : [profile.id])
    const { data: recruiters, error: peopleError } = await people
    if (peopleError) throw peopleError
    return { enabled: true, assignments, recruiters }
  },
  async 'assign-job'(req, b) {
    const { profile } = await requireUser(req, { admin: true })
    if (!b.jobId || typeof b.jobId !== 'string' || !b.recruiterId || !Number.isInteger(b.version) || b.version < 0) fail(400, 'Choose a job and recruiter and refresh the assignment.')
    const { data, error } = await db().rpc('assign_job', { p_job: b.jobId, p_recruiter: b.recruiterId, p_admin: profile.id, p_version: b.version })
    if (error) fail(409, error.message)
    return { assignment: data }
  },
  // public: lets the browser find the database and know what is switched on
  async config() {
    if (!isConfigured()) return { configured: false }
    let s = null
    try { s = await getSettings() } catch { /* tables not created yet */ }
    return { configured: true, supabaseUrl: supaUrl(), supabaseAnonKey: supaAnon(), productName: s?.productName || 'HireLens', emailReady: !!(s && emailReady(s)), aiReady: !!s && !!(s.openaiKey || s.anthropicKey || s.geminiKey), demoAi: !!s && !!(s.openaiKey || s.anthropicKey || s.geminiKey) && s.demoAiDailyLimit > 0, schemaReady: !!s }
  },

  async me(req) {
    const { profile, isAdmin } = await requireUser(req)
    db().from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', profile.id).then(() => {}, () => {})
    const s = await getSettings()
    return { profile, isAdmin, trialEnd: trialEndOf(profile), emailReady: emailReady(s), aiReady: !!(s.openaiKey || s.anthropicKey || s.geminiKey), productName: s.productName }
  },

  async 'update-profile'(req, b) {
    const { profile } = await requireUser(req)
    const patch = {}
    for (const k of ['full_name', 'company', 'phone']) if (typeof b[k] === 'string') patch[k] = b[k].trim().slice(0, 100)
    if (b.buyer && typeof b.buyer === 'object') {
      const x = b.buyer
      if (x.email && !isEmail(x.email)) fail(400, 'Enter a valid billing email.')
      patch.buyer = { name: String(x.name || '').slice(0, 120), address: String(x.address || '').slice(0, 300), gstin: String(x.gstin || '').toUpperCase().slice(0, 15), email: String(x.email || '').trim() }
    }
    const { data, error } = await db().from('profiles').update(patch).eq('id', profile.id).select().single()
    if (error) throw error
    return { profile: data }
  },

  async geocode(req, b) {
    await requireUser(req)
    return (await geocode(b.q)) || { lat: null, lng: null }
  },

  // hand-written emails: one candidate, the tracker, a client pack
  async 'send-email'(req, b) {
    const { profile } = await requireUser(req)
    const table=b.table
    if(table!=null && (!Array.isArray(table)||table.length>2001||table.some(row=>!Array.isArray(row)||row.length>25||row.some(value=>typeof value!=='string'||value.length>5000)))) fail(400,'The tracker table is too large or invalid.')
    return sendMail({ owner: profile.id, kind: 'email:manual', userCap: true, to: b.to, cc: b.cc, subject: b.subject, text: b.text, table, attachments: Array.isArray(b.attachments) ? b.attachments : [], replyTo: profile.email })
  },

  // sent automatically when a recruiter schedules a round; carries a calendar invite
  async 'interview-invite'(req, b) {
    const { profile } = await requireUser(req)
    const start = Number(b.start)
    if (!start || start < Date.now() - 36e5) fail(400, 'The interview time is in the past.')
    const cc = (Array.isArray(b.cc) ? b.cc : []).filter(isEmail)
    const ics = buildIcs({ uid: `${safeId(b.interviewId) || Date.now()}@hirelens`, start, minutes: Math.min(240, Math.max(15, +b.minutes || 45)), title: b.title || b.subject, description: b.text, location: b.location, organizer: profile.email, attendees: [b.to, ...cc] })
    return sendMail({ owner: profile.id, kind: 'email:invite', to: b.to, cc, subject: b.subject, text: b.text, attachments: [icsAttachment(ics)], replyTo: profile.email })
  },

  async billing(req) {
    const { profile } = await requireUser(req)
    const { rows, trialEnd, settings: s } = await ensureInvoices(profile)
    return { trialStart: profile.trial_start, trialDays: profile.trial_days, trialEnd, buyer: profile.buyer || {}, plan: { name: s.planName, price: s.price, taxPct: s.taxPct }, seller: s.seller, invoices: rows, account: { name: profile.full_name, company: profile.company, email: profile.email } }
  },

  async webhook(req, b) {
    await requireUser(req)
    if (!/^https:\/\//.test(b.url || '')) fail(400, 'Webhook URL must start with https://')
    const r = await fetch(b.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: b.event, payload: b.payload, sentAt: new Date().toISOString() }) })
    if (!r.ok) fail(502, `Webhook answered ${r.status}`)
    return { ok: true }
  },

  // original resumes live in private storage under the owner's id
  async 'upload-url'(req, b) {
    const { path } = await resumeContext(req, b, true)
    await ensureBucket()
    const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })
    if (error) throw error
    return { path, token: data.token }
  },
  async 'file-url'(req, b) {
    const { path, legacyPath, candidate } = await resumeContext(req, b)
    // Older uploads use the original owner's folder. New uploads use a stable job folder.
    const storedPath = candidate.data.fileStorageVersion === 2 ? path : legacyPath
    const { data, error } = await db().storage.from(BUCKET).createSignedUrl(storedPath, 60, b.filename ? { download: String(b.filename).slice(0, 120) } : undefined)
    if (error) fail(404, 'No original file is stored for this candidate.')
    return { url: data.signedUrl }
  },
  async 'delete-file'(req, b) {
    const { path, legacyPath } = await resumeContext(req, b)
    const { error } = await db().storage.from(BUCKET).remove([path, legacyPath])
    if (error) throw error
    return { ok: true }
  },
})
