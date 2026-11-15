import { lookup, km } from './geo'
import { scoreCandidate } from './match'
import { put, getState, setConfig } from './store'
import type { Candidate, Employment, Interview, Job, Panelist, Remark, Stage, Template } from './types'
import { uid } from './util'

export const DEFAULT_TEMPLATES: Omit<Template, 'id'>[] = [
  { channel: 'whatsapp', name: 'First contact', body: 'Hi {{name}}, this is {{recruiter}} from {{company}}. Your profile fits a {{role}} opening in {{location}}. Open to a quick 10-minute call today? Reply with a good time.' },
  { channel: 'whatsapp', name: 'Interview invite', body: 'Hi {{name}}, your interview for {{role}} is on {{interviewTime}}.\nGoogle Meet: {{meetLink}}\nPlease join 5 minutes early. Reply here if you need to reschedule.' },
  { channel: 'whatsapp', name: 'Details needed', body: 'Hi {{name}}, to move your {{role}} application forward, please share: current CTC, expected CTC, notice period and current location.' },
  { channel: 'whatsapp', name: 'Interview reminder', body: 'Hi {{name}}, a reminder that your {{role}} interview is today at {{interviewTime}}. Meet link: {{meetLink}}. All the best!' },
  { channel: 'email', name: 'First contact', subject: '{{role}} opportunity at {{company}}', body: 'Hi {{name}},\n\nI came across your profile and think you would be a strong fit for our {{role}} opening in {{location}}.\n\nWould you have 15 minutes this week for a quick call? Please also share your current CTC, expected CTC and notice period.\n\nRegards,\n{{recruiter}}\n{{company}}' },
  { channel: 'email', name: 'Interview invite', subject: 'Interview scheduled: {{role}}', body: 'Hi {{name}},\n\nYour interview for {{role}} is scheduled for {{interviewTime}}.\n\nGoogle Meet: {{meetLink}}\n\nPlease keep your updated resume handy. Reply to this email if you need a different slot.\n\nRegards,\n{{recruiter}}\n{{company}}' },
  { channel: 'email', name: 'Interview reminder', subject: 'Reminder: your {{role}} interview today at {{interviewTime}}', body: 'Hi {{name}},\n\nA quick reminder that your interview for {{role}} is today at {{interviewTime}}.\n\nJoin here: {{meetLink}}\n\nPlease join 5 minutes early and keep your updated resume handy. Reply to this email if anything has changed.\n\nAll the best,\n{{recruiter}}\n{{company}}' },
  { channel: 'email', name: 'Not moving ahead', subject: 'Update on your {{role}} application', body: 'Hi {{name}},\n\nThank you for your time. We will not be moving ahead with your application for {{role}} at this stage. We will keep your profile on file for future roles that match.\n\nRegards,\n{{recruiter}}\n{{company}}' },
]

export async function ensureTemplates() {
  if (Object.keys(getState().templates).length) return
  for (const t of DEFAULT_TEMPLATES) await put('templates', { ...t, id: uid('t') })
}

const D = 864e5, H = 36e5

/* Fictional demo records (example.com addresses, dummy 98xxx numbers) so every
 * screen has rows to show before real resumes arrive. */
export async function loadSample() {
  const now = Date.now()
  const job = (p: Partial<Job> & Pick<Job, 'title' | 'client' | 'tech' | 'mustSkills' | 'niceSkills' | 'description'>, loc: string, ageDays: number): Job => ({
    id: uid('j'), location: lookup(loc), workMode: 'hybrid', expMin: 3, expMax: 6, ctcMaxLpa: 18, noticeMaxDays: 30, openings: 1,
    status: 'open', createdAt: now - ageDays * D, updatedAt: now, ...p,
  })
  const jobs: Job[] = [
    job({ title: 'Senior Java Developer', client: 'Example Fintech', tech: 'Java', expMin: 5, expMax: 8, ctcMaxLpa: 24, openings: 2,
      mustSkills: ['Java', 'Spring Boot', 'Microservices', 'SQL'], niceSkills: ['Kafka', 'AWS', 'Docker'],
      description: 'Build and own payment microservices in Java and Spring Boot.\nDesign REST APIs used by partner banks.\nWork with SQL at high volume and tune queries.\nMentor two junior developers.' }, 'Malad West, Mumbai', 9),
    job({ title: 'React Frontend Engineer', client: 'Example Retail', tech: 'Frontend', workMode: 'onsite', expMin: 2, expMax: 5, ctcMaxLpa: 14, noticeMaxDays: 45,
      mustSkills: ['React', 'TypeScript', 'CSS'], niceSkills: ['Next.js', 'Figma'],
      description: 'Ship customer-facing screens in React and TypeScript.\nTurn Figma designs into accessible components.\nOwn page performance.' }, 'Hinjewadi, Pune', 6),
    job({ title: 'Data Engineer', client: 'Example Analytics', tech: 'Data', workMode: 'remote', expMin: 3, expMax: 6, ctcMaxLpa: 20, noticeMaxDays: 60,
      mustSkills: ['Python', 'SQL', 'Spark', 'Airflow'], niceSkills: ['Snowflake', 'AWS'],
      description: 'Build batch and streaming pipelines.\nModel data in the warehouse.\nKeep jobs observable and cheap.' }, 'Bengaluru', 4),
    job({ title: 'QA Automation Engineer', client: 'Example Health', tech: 'QA / Testing', expMin: 2, expMax: 5, ctcMaxLpa: 12, noticeMaxDays: 30,
      mustSkills: ['Selenium', 'Java', 'Automation Testing'], niceSkills: ['Cypress', 'JMeter', 'Jenkins'],
      description: 'Automate regression suites for a patient app.\nOwn the CI test pipeline.\nWork with developers on testability.' }, 'Andheri East, Mumbai', 2),
  ]

  // job, name, role, company, total, relevant, current CTC, expected CTC, notice, location, skills, stage, history
  type Row = [number, string, string, string, number, number, number, number, number, string, string[], Stage, string[]]
  const rows: Row[] = [
    [0, 'Rohan Mehta', 'Senior Backend Engineer', 'Example Pay', 6.5, 6, 18, 23, 30, 'Goregaon East, Mumbai', ['Java', 'Spring Boot', 'Microservices', 'SQL', 'Kafka', 'Docker', 'AWS'], 'l3', ['wa', 'call', 'l1', 'l2', 'l3', 'meet']],
    [0, 'Priya Nair', 'Java Developer', 'Example Insure Tech', 5, 5, 15, 21, 15, 'Andheri West, Mumbai', ['Java', 'Spring Boot', 'Microservices', 'SQL', 'AWS'], 'joined', ['wa', 'call', 'l1', 'l2', 'l3', 'sel', 'off', 'join']],
    [0, 'Vikram Singh', 'Senior Java Engineer', 'Example Commerce', 7, 7, 20, 24, 30, 'Vashi, Navi Mumbai', ['Java', 'Spring Boot', 'Microservices', 'SQL', 'Kafka', 'Docker'], 'l1', ['email', 'call', 'l1', 'meet']],
    [0, 'Karan Desai', 'Lead Java Developer', 'Example Lending', 8, 8, 26, 30, 60, 'Borivali West, Mumbai', ['Java', 'Spring Boot', 'Microservices', 'SQL', 'Kafka', 'AWS', 'Kubernetes'], 'hold', ['wa', 'call', 'hold']],
    [0, 'Arjun Kulkarni', 'Technical Lead', 'Example Global Services', 9, 8, 28, 36, 90, 'Hinjewadi, Pune', ['Java', 'Spring Boot', 'Microservices', 'Kafka', 'AWS'], 'rejected', ['email', 'call', 'rej']],
    [0, 'Sneha Iyer', 'Software Engineer', 'Example IT Solutions', 3, 3, 9, 13, 30, 'Thane West', ['Java', 'Spring Boot', 'SQL', 'Hibernate'], 'contacted', ['wa']],
    [1, 'Aisha Khan', 'Frontend Developer', 'Example Studio', 3, 3, 9, 13, 30, 'Kharadi, Pune', ['React', 'TypeScript', 'CSS', 'Next.js'], 'offered', ['wa', 'call', 'l1', 'l2', 'sel', 'off']],
    [1, 'Nikhil Joshi', 'UI Engineer', 'Example Media', 4.5, 4, 12, 17, 60, 'Mumbai', ['React', 'JavaScript', 'CSS', 'Figma'], 'hold', ['email', 'call', 'hold']],
    [1, 'Meera Patil', 'Web Developer', 'Example Agency', 1.5, 1.5, 4.5, 7, 0, 'Baner, Pune', ['React', 'CSS', 'HTML'], 'new', []],
    [1, 'Siddharth Rao', 'Frontend Engineer', 'Example SaaS', 4, 4, 13, 15, 30, 'Hinjewadi, Pune', ['React', 'TypeScript', 'CSS', 'Next.js', 'Figma'], 'selected', ['wa', 'call', 'l1', 'l2', 'sel']],
    [2, 'Fatima Shaikh', 'Data Engineer', 'Example Analytics Co', 4, 4, 14, 19, 30, 'Hyderabad', ['Python', 'SQL', 'Spark', 'Airflow', 'Snowflake'], 'declined', ['email', 'call', 'l1', 'l2', 'sel', 'off', 'dec']],
    [2, 'Rahul Verma', 'BI Developer', 'Example Retail Data', 5, 2, 12, 16, 30, 'Chennai', ['SQL', 'Power BI', 'Python'], 'new', []],
    [2, 'Ananya Ghosh', 'Data Engineer', 'Example Logistics', 3.5, 3.5, 11, 15, 45, 'Kolkata', ['Python', 'SQL', 'Spark', 'AWS'], 'contacted', ['email']],
    [3, 'Pooja Shetty', 'QA Engineer', 'Example Insurance', 3, 3, 7, 10, 30, 'Kurla, Mumbai', ['Selenium', 'Java', 'Automation Testing', 'Jenkins'], 'l1', ['wa', 'call', 'l1', 'meet']],
    [3, 'Amit Yadav', 'Test Engineer', 'Example Telecom', 2.5, 1.5, 5, 8, 15, 'Thane', ['Manual Testing', 'Selenium', 'JMeter'], 'contacted', ['wa']],
    [3, 'Neha Gupta', 'SDET', 'Example Health Tech', 4, 4, 10, 13, 30, 'Powai, Mumbai', ['Selenium', 'Java', 'Automation Testing', 'Cypress', 'Jenkins'], 'new', []],
  ]

  const cfg = getState().config
  const w = cfg.weights
  jobs.forEach((j) => { j.ctcMinLpa = Math.round(j.ctcMaxLpa * 0.7) })
  for (const j of jobs) await put('jobs', j)
  const pids: string[] = []
  for (const [n, [name, expertise, cal]] of PANEL.entries()) {
    const id = uid('p'); pids.push(id)
    const [a, b] = name.toLowerCase().split(' ') as [string, string]
    const pn: Panelist = { id, name, expertise, email: `${a}.${b}.demo@example.com`, phone: `97${String(30222000 + n * 11).padStart(8, '0')}`, calendly: `https://calendly.com/${a}-${b}-demo/${cal}`, active: true, createdAt: now - 20 * D, updatedAt: now }
    await put('panelists', pn)
  }
  const made: Candidate[] = []
  const nextHour = Math.ceil(now / H) * H
  let i = 0
  for (const [ji, name, role, company, tot, rel, cur, exp, notice, loc, skills, stage, hist] of rows) {
    const j = jobs[ji]!
    const place = lookup(loc)
    const distanceKm = km(place, j.location)
    const s = scoreCandidate({ skills, relevantExp: rel, totalExp: tot, expectedCtcLpa: exp, noticeDays: notice, distanceKm }, j, w)
    const [first, last] = name.toLowerCase().split(' ') as [string, string]
    const created = now - (8 - (i % 8)) * D + i * H
    let t = created
    const remarks: Remark[] = [{ id: uid('r'), at: created, kind: 'note', text: `Resume added (${first}-${last}.pdf), ${s.score}% match` }]
    const LOG: Record<string, [Remark['kind'], string]> = {
      wa: ['whatsapp', 'WhatsApp opened: First contact'], email: ['email', 'Email drafted in Gmail: First contact'],
      call: ['call', ['Spoke on call. Interested, shared CTC and notice.', 'Call done. Open to hybrid, wants role details on mail.', 'Spoke at 4pm. Available for interview this week.'][i % 3]!],
      l1: ['stage', 'Moved to L1 screening'], l2: ['stage', 'Moved to L2 screening'], sel: ['stage', 'Moved to Selected'],
      hold: ['stage', 'Moved to On hold'], rej: ['stage', 'Moved to Rejected'], meet: ['meet', 'Interview set on Google Meet'],
      l3: ['stage', 'Moved to L3 manager / HR'], off: ['stage', 'Offer released'], join: ['stage', 'Joined on the agreed date'],
      dec: ['stage', 'Offer declined: accepted a counter-offer from current employer'],
    }
    for (const h of hist) {
      t = Math.min(t + (6 + (i % 5)) * H, now - H)
      remarks.push({ id: uid('r'), at: t, kind: LOG[h]![0], text: LOG[h]![1] })
    }
    const slot = new Date(nextHour); slot.setDate(slot.getDate() + 1 + (i % 3)); slot.setHours(i % 2 ? 15 : 11, 0, 0, 0)
    const interviewAt = hist.includes('meet') ? slot.getTime() : undefined
    const interviews = makeInterviews(name, created, interviewAt, pids)
    const gaps = [
      ...(s.missingSkills.length ? [`No ${s.missingSkills.slice(0, 2).join(' or ')} on record`] : []),
      ...(notice > j.noticeMaxDays ? [`Notice ${notice} days, above the ${j.noticeMaxDays}-day limit`] : []),
      ...(exp > j.ctcMaxLpa ? [`Expects ${exp} LPA against a ${j.ctcMaxLpa} LPA budget`] : []),
    ]
    const c: Candidate = {
      id: uid('c'), jobId: j.id, name, email: `${first}.${last}.demo@example.com`, phone: `98${String(20111000 + i * 7).padStart(8, '0')}`,
      fileName: `${first}-${last}.pdf`, fileKind: 'sample',
      resumeText: `${name}\n${role}, ${company}\n${tot} years experience (${rel} relevant). Skills: ${skills.join(', ')}.\nLocation: ${loc}. Current CTC ${cur} LPA, expected ${exp} LPA. Notice period ${notice} days.`,
      currentRole: role, currentCompany: company, totalExp: tot, relevantExp: rel, currentCtcLpa: cur, expectedCtcLpa: exp,
      noticeDays: notice, currentLocation: place, distanceKm, skills, education: 'B.E. / B.Tech, Computer Science',
      summary: `${role} at ${company} with ${tot} years, mostly ${skills.slice(0, 2).join(' and ')}.`,
      match: {
        ...s,
        strengths: s.matchedSkills.length ? [`Hands-on ${s.matchedSkills.slice(0, 3).join(', ')}`, exp <= j.ctcMaxLpa ? 'Expectation within budget' : 'Strong seniority'] : [],
        gaps,
        verdict: s.score >= 85 ? 'Call first: fits on skills, budget and joining time.' : s.score >= 70 ? 'Worth a screening call; check the gaps.' : 'Keep as a backup unless the requirement changes.',
        by: 'rules', at: now,
      },
      stage, shortlisted: s.score >= cfg.shortlistAt, remarks,
      interviewAt, meetLink: interviewAt ? 'https://meet.google.com/abc-defg-hij' : undefined,
      employment: makeEmployment(company, role, tot, i, now), interviews,
      selfRatings: RATED.has(name) ? Object.fromEntries([...j.mustSkills, ...j.niceSkills].map((k, n) => [k, skills.includes(k) ? 4 + ((i + n) % 2) : 2])) : undefined,
      createdAt: created, updatedAt: now,
    }
    made.push(c)
    await put('candidates', c); i++
  }

  // the Java job carries an ideal profile and a calibration call, so those tabs are filled too
  const java = jobs[0]!
  await put('jobs', {
    ...java,
    ideal: {
      summary: 'A backend engineer with five to seven years in Java and Spring Boot, mostly in payments or lending. Has split a monolith into microservices and run them on AWS with Kafka for events. Lives within a 30-minute commute of Malad and can join within a month.',
      traits: ['Java 11+', 'Spring Boot', 'Microservices', 'Kafka', 'AWS', 'Fintech or lending domain', 'Mentored juniors'],
      expRange: '5–7', ctcBand: '21–24', basedOn: made.filter((c) => c.jobId === java.id && c.shortlisted).map((c) => c.id), createdAt: now - 6 * H,
    },
    calibration: {
      notes: 'Call with hiring manager, Example Fintech\n- Kafka ab must-have hai, settlement Kafka pe shift ho raha hai.\n- Budget max 26 LPA tak for a strong profile.\n- Notice 30 days hi chahiye, buyout nahi.\n- L1 technical 45 min, L2 system design with CTO, then HR.',
      summary: '- Kafka is now a must-have; settlement is moving to Kafka.\n- Budget can stretch to 26 LPA for a strong candidate.\n- Notice must be 30 days or less; no buyout.\n- Process: L1 technical (45 min), L2 system design with the CTO, then HR.',
      translation: { lang: 'Hindi', text: '- Kafka अब ज़रूरी है; सेटलमेंट Kafka पर जा रहा है।\n- मज़बूत उम्मीदवार के लिए बजट 26 LPA तक बढ़ सकता है।\n- नोटिस 30 दिन या कम होना चाहिए; बायआउट नहीं।\n- प्रक्रिया: L1 तकनीकी (45 मिनट), L2 CTO के साथ सिस्टम डिज़ाइन, फिर HR।' },
      updatedAt: now - 3 * H,
    },
  })
  if (!getState().config.recruiterName) await setConfig({ recruiterName: 'Riya Sharma' })
  if (!getState().config.companyName) await setConfig({ companyName: 'Example Staffing' })
}

const PANEL: [string, string, string][] = [
  ['Deepak Menon', 'Java, Spring Boot, system design', '45min'],
  ['Shalini Rao', 'Engineering manager, final rounds', '30min'],
  ['Imran Sheikh', 'React, TypeScript, frontend', '45min'],
  ['Kavya Reddy', 'Data engineering, QA automation', '45min'],
]
const RATED = new Set(['Rohan Mehta', 'Priya Nair', 'Aisha Khan', 'Fatima Shaikh', 'Neha Gupta', 'Vikram Singh'])

/* [round, panelist indexes, result, rating, feedback]; a round with result 'next' is the upcoming one */
type IvSpec = [Stage, number[], Interview['result'] | 'next', number, string]
const IVS: Record<string, IvSpec[]> = {
  'Rohan Mehta': [['l1', [0], 'select', 4, 'Strong on Spring Boot and Kafka consumers. Explained idempotent payment retries well.'], ['l2', [0, 1], 'select', 4, 'Good service boundaries; a little light on database sharding.'], ['l3', [1], 'next', 0, '']],
  'Priya Nair': [['l1', [0], 'select', 5, 'Clean code, solid SQL tuning answers.'], ['l2', [0], 'select', 4, 'Designed a rate limiter correctly; good trade-off discussion.'], ['l3', [1], 'select', 5, 'Clear communicator; fits the team. Recommend offer.']],
  'Vikram Singh': [['l1', [0], 'next', 0, '']],
  'Karan Desai': [['l1', [0], 'hold', 3, 'Technically strong but expects 30 LPA and has a 60-day notice. Hold until budget is confirmed.']],
  'Arjun Kulkarni': [['l1', [0], 'reject', 2, 'Mostly people management for two years; hands-on Java is rusty. 90-day notice.']],
  'Aisha Khan': [['l1', [2], 'select', 4, 'Good React hooks and state handling. Accessible markup.'], ['l2', [2, 1], 'select', 4, 'Solid on performance profiling. Ready for offer.']],
  'Siddharth Rao': [['l1', [2], 'select', 5, 'Excellent TypeScript, built a design system before.'], ['l2', [1], 'select', 4, 'Good ownership mindset.']],
  'Nikhil Joshi': [['l1', [2], 'hold', 3, 'JavaScript is fine but little TypeScript. Keep as backup.']],
  'Fatima Shaikh': [['l1', [3], 'select', 4, 'Strong Spark and Airflow; wrote a clean DAG live.'], ['l2', [3, 1], 'select', 5, 'Great data modelling depth.']],
  'Pooja Shetty': [['l1', [3], 'next', 0, '']],
}
function makeInterviews(name: string, created: number, upcoming: number | undefined, pids: string[]): Interview[] | undefined {
  const spec = IVS[name]
  if (!spec) return undefined
  return spec.map(([round, who, result, rating, feedback], k) => {
    const at = result === 'next' ? (upcoming ?? Date.now() + D) : created + (k + 1) * 1.2 * D
    return {
      id: uid('iv'), round, at, panelistIds: who.map((n) => pids[n]!).filter(Boolean), meetLink: 'https://meet.google.com/abc-defg-hij',
      result: result === 'next' ? 'pending' : result, rating: rating || undefined, feedback: feedback || undefined,
      feedbackBy: result === 'next' ? undefined : pids[who[0]!], createdAt: created,
    }
  })
}

const PAST = ['Example Infotech', 'Example Systems', 'Example Consulting', 'Example Software Labs', 'Example Digital']
const ym = (t: number) => new Date(t).toISOString().slice(0, 7)
/* Current job plus earlier ones going back to the first, adding up to the stated total experience. */
function makeEmployment(company: string, role: string, total: number, i: number, now: number): Employment[] {
  const Y = 365.25 * D
  const spans: number[] = []
  let left = total
  for (let k = 0; left > 0.2 && k < 4; k++) { const take = Math.min(left, k === 0 ? 1.5 + (i % 3) : 1 + ((i + k) % 3)); spans.push(take); left -= take }
  const out: Employment[] = []
  let end = now
  spans.forEach((yrs, k) => {
    const start = end - yrs * Y
    out.push({ company: k === 0 ? company : PAST[(i + k) % PAST.length]!, role: k === 0 ? role : k === spans.length - 1 && spans.length > 1 ? 'Trainee / Associate Engineer' : 'Software Engineer', from: ym(start), to: k === 0 ? 'present' : ym(end) })
    end = start - 0.08 * Y
  })
  return out
}
