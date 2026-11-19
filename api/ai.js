import { createHash } from 'node:crypto'
import { callModel } from './_lib/ai.js'
import { fail, route } from './_lib/http.js'
import { getSettings } from './_lib/settings.js'
import { countUsage, logUsage, requireUser, startOfUtcDay } from './_lib/supa.js'

const DEMO_PER_VISITOR = 6 // per network address per day, inside the shared demo cap
const DEMO_PROMPT_MAX = 40000
const DEMO_IMAGES_MAX = 2

const visitor = (req) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim()
  return 'v:' + createHash('sha256').update('hirelens-demo|' + ip).digest('hex').slice(0, 24)
}

// POST { action: 'complete', prompt, quick?, images?: [{ type, data(base64) }] } -> { text }
// Signed-in recruiters only; the platform's key, never one from the browser.
// POST { action: 'demo', ... } -> { text }: the public demo, no sign-in, under a small shared daily cap.
export default route({
  async complete(req, b) {
    const { profile, isAdmin } = await requireUser(req)
    const s = await getSettings()
    if (!isAdmin && s.aiDailyLimit) {
      const used = await countUsage({ owner: profile.id, kindLike: 'ai', since: startOfUtcDay() })
      if (used >= s.aiDailyLimit) fail(429, `You have used today's ${s.aiDailyLimit} AI reads. They reset at 05:30 IST.`)
    }
    const text = await callModel(s, { prompt: b.prompt, quick: !!b.quick, images: b.images })
    await logUsage(profile.id, 'ai', b.quick ? 'quick' : 'full')
    return { text }
  },

  async demo(req, b) {
    const s = await getSettings()
    const limit = +s.demoAiDailyLimit || 0
    if (!limit || !(s.openaiKey || s.anthropicKey || s.geminiKey)) fail(403, 'AI reading is off in the demo. Sign up to use it.')
    const prompt = String(b.prompt || '')
    if (!prompt.trim()) fail(400, 'Nothing to read.')
    if (prompt.length > DEMO_PROMPT_MAX) fail(413, 'That is too long for the demo. Sign up to read longer files.')
    const images = Array.isArray(b.images) ? b.images.slice(0, DEMO_IMAGES_MAX) : undefined
    const since = startOfUtcDay()
    const who = visitor(req)
    const [all, mine] = await Promise.all([
      countUsage({ kindLike: 'demo-ai', since }),
      countUsage({ kindLike: 'demo-ai', since, detail: who }),
    ])
    if (all >= limit) fail(429, "The demo has used today's AI reads. Sign up for your own workspace to keep going.")
    if (mine >= DEMO_PER_VISITOR) fail(429, `You have used the ${DEMO_PER_VISITOR} AI reads the demo allows a day. Sign up to keep going.`)
    const text = await callModel(s, { prompt, quick: true, images })
    await logUsage(null, 'demo-ai', who)
    return { text }
  },
})
