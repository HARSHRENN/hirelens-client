import { lookup, km } from './geo'
import { scoreCandidate } from './match'
import { put, getState, setConfig } from './store'
import type { Candidate, Job, Remark, Stage, Template } from './types'
import { uid } from './util'

export const DEFAULT_TEMPLATES: Omit<Template, 'id'>[] = [
  { channel: 'whatsapp', name: 'First contact', body: 'Hi {{name}}, this is {{recruiter}} from {{company}}. Your profile fits a {{role}} opening in {{location}}. Open to a quick 10-minute call today? Reply with a good time.' },
  { channel: 'whatsapp', name: 'Interview invite', body: 'Hi {{name}}, your interview for {{role}} is on {{interviewTime}}.\nGoogle Meet: {{meetLink}}\nPlease join 5 minutes early. Reply here if you need to reschedule.' },
  { channel: 'whatsapp', name: 'Details needed', body: 'Hi {{name}}, to move your {{role}} application forward, please share: current CTC, expected CTC, notice period and current location.' },
  { channel: 'whatsapp', name: 'Interview reminder', body: 'Hi {{name}}, a reminder that your {{role}} interview is today at {{interviewTime}}. Meet link: {{meetLink}}. All the best!' },
  { channel: 'email', name: 'First contact', subject: '{{role}} opportunity at {{company}}', body: 'Hi {{name}},\n\nI came across your profile and think you would be a strong fit for our {{role}} opening in {{location}}.\n\nWould you have 15 minutes this week for a quick call? Please also share your current CTC, expected CTC and notice period.\n\nRegards,\n{{recruiter}}\n{{company}}' },
  { channel: 'email', name: 'Interview invite', subject: 'Interview scheduled: {{role}}', body: 'Hi {{name}},\n\nYour interview for {{role}} is scheduled for {{interviewTime}}.\n\nGoogle Meet: {{meetLink}}\n\nPlease keep your updated resume handy. Reply to this email if you need a different slot.\n\nRegards,\n{{recruiter}}\n{{company}}' },
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
    [0, 'Rohan Mehta', 'Senior Backend Engineer', 'Example Pay', 6.5, 6, 18, 23, 30, 'Goregaon East, Mumbai', ['Java', 'Spring Boot', 'Microservices', 'SQL', 'Kafka', 'Docker', 'AWS'], 'l2', ['wa', 'call', 'l1', 'l2', 'meet']],
    [0, 'Priya Nair', 'Java Developer', 'Example Insure Tech', 5, 5, 15, 21, 15, 'Andheri West, Mumbai', ['Java', 'Spring Boot', 'Microservices', 'SQL', 'AWS'], 'selected', ['wa', 'call', 'l1', 'l2', 'sel']],
    [0, 'Vikram Singh', 'Senior Java Engineer', 'Example Commerce', 7, 7, 20, 24, 30, 'Vashi, Navi Mumbai', ['Java', 'Spring Boot', 'Microservices', 'SQL', 'Kafka', 'Docker'], 'l1', ['email', 'call', 'l1', 'meet']],
    [0, 'Karan Desai', 'Lead Java Developer', 'Example Lending', 8, 8, 26, 30, 60, 'Borivali West, Mumbai', ['Java', 'Spring Boot', 'Microservices', 'SQL', 'Kafka', 'AWS', 'Kubernetes'], 'hold', ['wa', 'call', 'hold']],
    [0, 'Arjun Kulkarni', 'Technical Lead', 'Example Global Services', 9, 8, 28, 36, 90, 'Hinjewadi, Pune', ['Java', 'Spring Boot', 'Microservices', 'Kafka', 'AWS'], 'rejected', ['email', 'call', 'rej']],
    [0, 'Sneha Iyer', 'Software Engineer', 'Example IT Solutions', 3, 3, 9, 13, 30, 'Thane West', ['Java', 'Spring Boot', 'SQL', 'Hibernate'], 'contacted', ['wa']],
    [1, 'Aisha Khan', 'Frontend Developer', 'Example Studio', 3, 3, 9, 13, 30, 'Kharadi, Pune', ['React', 'TypeScript', 'CSS', 'Next.js'], 'l1', ['wa', 'call', 'l1', 'meet']],
    [1, 'Nikhil Joshi', 'UI Engineer', 'Example Media', 4.5, 4, 12, 17, 60, 'Mumbai', ['React', 'JavaScript', 'CSS', 'Figma'], 'hold', ['email', 'call', 'hold']],
    [1, 'Meera Patil', 'Web Developer', 'Example Agency', 1.5, 1.5, 4.5, 7, 0, 'Baner, Pune', ['React', 'CSS', 'HTML'], 'new', []],
    [1, 'Siddharth Rao', 'Frontend Engineer', 'Example SaaS', 4, 4, 13, 15, 30, 'Hinjewadi, Pune', ['React', 'TypeScript', 'CSS', 'Next.js', 'Figma'], 'contacted', ['wa', 'call']],
    [2, 'Fatima Shaikh', 'Data Engineer', 'Example Analytics Co', 4, 4, 14, 19, 30, 'Hyderabad', ['Python', 'SQL', 'Spark', 'Airflow', 'Snowflake'], 'l2', ['email', 'call', 'l1', 'l2', 'meet']],
    [2, 'Rahul Verma', 'BI Developer', 'Example Retail Data', 5, 2, 12, 16, 30, 'Chennai', ['SQL', 'Power BI', 'Python'], 'new', []],
    [2, 'Ananya Ghosh', 'Data Engineer', 'Example Logistics', 3.5, 3.5, 11, 15, 45, 'Kolkata', ['Python', 'SQL', 'Spark', 'AWS'], 'contacted', ['email']],
    [3, 'Pooja Shetty', 'QA Engineer', 'Example Insurance', 3, 3, 7, 10, 30, 'Kurla, Mumbai', ['Selenium', 'Java', 'Automation Testing', 'Jenkins'], 'l1', ['wa', 'call', 'l1']],
    [3, 'Amit Yadav', 'Test Engineer', 'Example Telecom', 2.5, 1.5, 5, 8, 15, 'Thane', ['Manual Testing', 'Selenium', 'JMeter'], 'contacted', ['wa']],
    [3, 'Neha Gupta', 'SDET', 'Example Health Tech', 4, 4, 10, 13, 30, 'Powai, Mumbai', ['Selenium', 'Java', 'Automation Testing', 'Cypress', 'Jenkins'], 'new', []],
  ]

  const cfg = getState().config
  const w = cfg.weights
  for (const j of jobs) await put('jobs', j)
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
    }
    for (const h of hist) {
      t = Math.min(t + (6 + (i % 5)) * H, now - H)
      remarks.push({ id: uid('r'), at: t, kind: LOG[h]![0], text: LOG[h]![1] })
    }
    const slot = new Date(nextHour); slot.setDate(slot.getDate() + 1 + (i % 3)); slot.setHours(i % 2 ? 15 : 11, 0, 0, 0)
    const interviewAt = hist.includes('meet') && stage !== 'selected' ? slot.getTime() : undefined
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
}
