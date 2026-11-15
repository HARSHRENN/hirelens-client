// Runs during every Vercel build: creates or updates the database schema.
// Skips quietly when Supabase isn't connected yet, and never fails the build,
// so a paused database can't take the site down. Admin → Platform can rerun it.
import { migrate } from '../api/_lib/migrate.js'
try {
  const r = await migrate()
  console.log(r.ok ? 'database schema up to date' : `database setup skipped: ${r.skipped}`)
} catch (e) {
  console.warn(`database setup failed (the app will still build): ${e.message}`)
}
