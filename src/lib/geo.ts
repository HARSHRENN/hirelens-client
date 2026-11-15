import { api } from './cloud'
import { MODE } from './runtime'
import type { Place } from './types'

// Offline gazetteer: Indian hiring hubs and Mumbai/Pune/Bengaluru/NCR localities.
// Used first; anything not listed is looked up on OpenStreetMap through the server (free, no key).
const P: Record<string, [number, number]> = {
  mumbai: [19.076, 72.8777], 'navi mumbai': [19.033, 73.0297], thane: [19.2183, 72.9781], andheri: [19.1136, 72.8697],
  malad: [19.1874, 72.8484], goregaon: [19.1663, 72.8526], powai: [19.1176, 72.906], bkc: [19.0662, 72.8656],
  'bandra kurla complex': [19.0662, 72.8656], bandra: [19.0596, 72.8295], 'lower parel': [18.9953, 72.8302], borivali: [19.2307, 72.8567],
  vashi: [19.0771, 72.9986], airoli: [19.1590, 72.9986], 'kalyan': [19.2403, 73.1305], dombivli: [19.2183, 73.0868], vikhroli: [19.1110, 72.9280],
  kurla: [19.0726, 72.8845], ghatkopar: [19.0856, 72.9081], chembur: [19.0522, 72.9005], dadar: [19.0178, 72.8478], worli: [19.0176, 72.8162], kandivali: [19.2047, 72.8524], mulund: [19.1726, 72.9565], bhandup: [19.1438, 72.9372], santacruz: [19.0806, 72.8411], 'vile parle': [19.0968, 72.8517], jogeshwari: [19.1365, 72.8486], 'mira road': [19.2813, 72.8686], bhayandar: [19.3005, 72.8512], vasai: [19.3919, 72.8397], virar: [19.4559, 72.8114], panvel: [18.9894, 73.1175], kharghar: [19.0473, 73.0699], belapur: [19.0235, 73.0398], colaba: [18.9067, 72.8147], churchgate: [18.9322, 72.8264], sion: [19.0390, 72.8619], wadala: [19.0169, 72.8644], 'nariman point': [18.9256, 72.8242], 'malad west': [19.1874, 72.8484],
  pune: [18.5204, 73.8567], hinjewadi: [18.5913, 73.7389], kharadi: [18.5515, 73.9348], 'magarpatta': [18.5158, 73.9272], baner: [18.559, 73.7868], 'pimpri chinchwad': [18.6298, 73.7997],
  bengaluru: [12.9716, 77.5946], bangalore: [12.9716, 77.5946], whitefield: [12.9698, 77.75], 'electronic city': [12.8452, 77.6602], koramangala: [12.9352, 77.6245], 'hsr layout': [12.9116, 77.6474], marathahalli: [12.9569, 77.7011], 'outer ring road': [12.9352, 77.6950], hebbal: [13.0358, 77.597],
  hyderabad: [17.385, 78.4867], 'hitech city': [17.4435, 78.3772], gachibowli: [17.4401, 78.3489], madhapur: [17.4483, 78.3915], secunderabad: [17.4399, 78.4983],
  chennai: [13.0827, 80.2707], 'omr': [12.9010, 80.2279], guindy: [13.0067, 80.2206], tambaram: [12.9249, 80.1],
  delhi: [28.7041, 77.1025], 'new delhi': [28.6139, 77.209], noida: [28.5355, 77.391], 'greater noida': [28.4744, 77.504], gurugram: [28.4595, 77.0266], gurgaon: [28.4595, 77.0266], faridabad: [28.4089, 77.3178], ghaziabad: [28.6692, 77.4538],
  kolkata: [22.5726, 88.3639], 'salt lake': [22.5867, 88.4171], ahmedabad: [23.0225, 72.5714], gandhinagar: [23.2156, 72.6369], surat: [21.1702, 72.8311], vadodara: [22.3072, 73.1812],
  jaipur: [26.9124, 75.7873], indore: [22.7196, 75.8577], bhopal: [23.2599, 77.4126], nagpur: [21.1458, 79.0882], nashik: [19.9975, 73.7898], aurangabad: [19.8762, 75.3433],
  lucknow: [26.8467, 80.9462], kanpur: [26.4499, 80.3319], chandigarh: [30.7333, 76.7794], mohali: [30.7046, 76.7179], dehradun: [30.3165, 78.0322],
  kochi: [9.9312, 76.2673], trivandrum: [8.5241, 76.9366], thiruvananthapuram: [8.5241, 76.9366], coimbatore: [11.0168, 76.9558], mysuru: [12.2958, 76.6394], mysore: [12.2958, 76.6394], mangaluru: [12.9141, 74.856], mangalore: [12.9141, 74.856],
  bhubaneswar: [20.2961, 85.8245], visakhapatnam: [17.6868, 83.2185], vijayawada: [16.5062, 80.648], patna: [25.5941, 85.1376], ranchi: [23.3441, 85.3096], guwahati: [26.1445, 91.7362], goa: [15.2993, 74.124], panaji: [15.4909, 73.8278],
  manipal: [13.3525, 74.7928], udaipur: [24.5854, 73.7125], jodhpur: [26.2389, 73.0243], amritsar: [31.634, 74.8723], ludhiana: [30.901, 75.8573], raipur: [21.2514, 81.6296], madurai: [9.9252, 78.1198], hubli: [15.3647, 75.124],
}

export function lookup(label: string): Place {
  const raw = (label || '').trim()
  const l = raw.toLowerCase()
  if (!l) return { label: '' }
  // prefer the most specific (longest) name contained in the label
  const hit = Object.keys(P).filter((k) => new RegExp(`(^|[^a-z])${k.replace(/ /g, '\\s*')}([^a-z]|$)`).test(l)).sort((a, b) => b.length - a.length)[0]
  return hit ? { label: raw, lat: P[hit]![0], lng: P[hit]![1] } : { label: raw }
}

export async function geocode(label: string): Promise<Place> {
  const local = lookup(label)
  if (local.lat != null || !label.trim()) return local
  if (MODE() !== 'cloud') return local
  try {
    const j = await api<{ lat: number | null; lng: number | null }>('app', 'geocode', { q: `${label}, India` })
    return j.lat != null ? { label, lat: j.lat, lng: j.lng! } : local
  } catch { return local }
}

export function km(a?: Place, b?: Place): number | null {
  if (!a || !b || a.lat == null || b.lat == null || a.lng == null || b.lng == null) return null
  const R = 6371, d2r = Math.PI / 180
  const dLat = (b.lat - a.lat) * d2r, dLng = (b.lng - a.lng) * d2r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * d2r) * Math.cos(b.lat * d2r) * Math.sin(dLng / 2) ** 2
  // straight-line distance x 1.25 approximates road distance inside Indian metros
  return 2 * R * Math.asin(Math.sqrt(h)) * 1.25
}

export const mapsLink = (from: string, to: string) =>
  `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}`
