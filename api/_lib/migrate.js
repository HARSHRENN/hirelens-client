import postgres from 'postgres'
import { SCHEMA_SQL } from './schema.js'
import { pgUrl } from './supa.js'

/** Creates or updates every table, policy and view. Safe to run any number of times. */
export async function migrate() {
  const url = pgUrl()
  if (!url) return { ok: false, skipped: 'No POSTGRES_URL. Connect Supabase to the Vercel project first.' }
  const sql = postgres(url, { ssl: 'require', max: 1, prepare: false, idle_timeout: 5, connect_timeout: 15, onnotice: () => {} })
  try { await sql.unsafe(SCHEMA_SQL); return { ok: true } }
  finally { await sql.end({ timeout: 5 }) }
}
