// A calendar invite (.ics) attached to interview emails, so Gmail and Outlook offer "Add to calendar".
const stamp = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`)
// lines longer than 75 octets are folded with CRLF + space (RFC 5545)
const fold = (line) => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74) } out.push(s); return out.join('\r\n') }

export function buildIcs({ uid, start, minutes = 45, title, description, location, organizer, attendees = [] }) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HireLens//Interview//EN', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(start + minutes * 60000)}`,
    `SUMMARY:${esc(title)}`,
    description ? `DESCRIPTION:${esc(description)}` : '',
    location ? `LOCATION:${esc(location)}` : '',
    organizer ? `ORGANIZER:mailto:${organizer}` : '',
    ...attendees.filter(Boolean).map((a) => `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${a}`),
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Interview in 30 minutes', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean)
  return lines.map(fold).join('\r\n') + '\r\n'
}

export const icsAttachment = (ics) => ({ filename: 'interview.ics', content: Buffer.from(ics, 'utf8').toString('base64'), contentType: 'text/calendar; method=REQUEST' })
