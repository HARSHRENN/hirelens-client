import { db } from './supa.js'

// Free geocoding with no key: OpenStreetMap's Nominatim first, Komoot's Photon as a fallback.
// Nominatim's usage policy asks for an identifying User-Agent and at most one request a second,
// so every answer (including "not found") is cached in the database and looked up there first.
const UA = 'HireLens/1.0 (recruitment app; https://hirelens-orpin.vercel.app)'

async function nominatim(q) {
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&addressdetails=0&q=${encodeURIComponent(q)}`
  const r = await fetch(u, { headers: { 'user-agent': UA, 'accept-language': 'en' } })
  if (!r.ok) throw new Error(`Nominatim ${r.status}`)
  const j = await r.json()
  return j[0] ? { lat: +j[0].lat, lng: +j[0].lon, label: j[0].display_name } : null
}

async function photon(q) {
  // bounding box of India keeps "Andheri" from resolving abroad
  const u = `https://photon.komoot.io/api/?limit=1&lang=en&bbox=68.1,6.5,97.4,35.7&q=${encodeURIComponent(q)}`
  const r = await fetch(u, { headers: { 'user-agent': UA } })
  if (!r.ok) throw new Error(`Photon ${r.status}`)
  const j = await r.json()
  const f = j.features?.[0]
  return f ? { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label: [f.properties.name, f.properties.city, f.properties.state].filter(Boolean).join(', ') } : null
}

export async function geocode(raw) {
  const q = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 200)
  if (q.length < 2) return null
  const key = q.toLowerCase()
  const { data: hit } = await db().from('geocache').select('lat, lng, label').eq('q', key).maybeSingle()
  if (hit) return hit.lat == null ? null : { lat: hit.lat, lng: hit.lng, label: hit.label }
  let found = null
  try { found = await nominatim(q) } catch { /* try the fallback */ }
  if (!found) { try { found = await photon(q) } catch { /* both down: don't cache a miss */ return null } }
  await db().from('geocache').upsert({ q: key, lat: found?.lat ?? null, lng: found?.lng ?? null, label: found?.label ?? null })
  return found
}
