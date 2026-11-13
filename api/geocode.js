import { allow, body, json, pick } from './_util.js'

// POST { address } -> { lat, lng } via the Google Geocoding API.
export default async function handler(req, res) {
  if (!allow(req, res)) return
  const b = await body(req)
  const key = pick(req, 'x-maps-key', 'GOOGLE_MAPS_API_KEY')
  if (!key) return json(res, 400, { error: 'No Google Maps key' })
  const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?region=in&address=${encodeURIComponent(b.address || '')}&key=${encodeURIComponent(key)}`)
  const j = await r.json()
  const loc = j.results?.[0]?.geometry?.location
  if (!loc) return json(res, 404, { error: j.status || 'Not found' })
  json(res, 200, { lat: loc.lat, lng: loc.lng, formatted: j.results[0].formatted_address })
}
