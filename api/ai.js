import { callModel } from './_lib/ai.js'
import { fail, route } from './_lib/http.js'
import { getSettings } from './_lib/settings.js'
import { countUsage, logUsage, requireUser, startOfUtcDay } from './_lib/supa.js'

// POST { action: 'complete', prompt, quick?, images?: [{ type, data(base64) }] } -> { text }
// Signed-in recruiters only; the platform's key, never one from the browser.
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
})
