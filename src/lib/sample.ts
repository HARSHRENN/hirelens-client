import { lookup, km } from './geo'
import { scoreCandidate } from './match'
import { put, getState } from './store'
import type { Candidate, Job, Stage, Template } from './types'
import { uid } from './util'

export const DEFAULT_TEMPLATES: Omit<Template, 'id'>[] = [
  { channel: 'whatsapp', name: 'First contact', body: 'Hi {{name}}, this is {{recruiter}} from {{company}}. Your profile fits a {{role}} opening in {{location}}. Open to a quick 10-minute call today? Reply with a good time.' },
  { channel: 'whatsapp', name: 'Interview invite', body: 'Hi {{name}}, your interview for {{role}} is on {{interviewTime}}.\nGoogle Meet: {{meetLink}}\nPlease join 5 minutes early. Reply here if you need to reschedule.' },
  { channel: 'whatsapp', name: 'Details needed', body: 'Hi {{name}}, to move your {{role}} application forward, please share: current CTC, expected CTC, notice period and current location.' },
  { channel: 'email', name: 'First contact', subject: '{{role}} opportunity at {{company}}', body: 'Hi {{name}},\n\nI came across your profile and think you would be a strong fit for our {{role}} opening in {{location}}.\n\nWould you have 15 minutes this week for a quick call? Please also share your current CTC, expected CTC and notice period.\n\nRegards,\n{{recruiter}}\n{{company}}' },
  { channel: 'email', name: 'Interview invite', subject: 'Interview scheduled: {{role}}', body: 'Hi {{name}},\n\nYour interview for {{role}} is scheduled for {{interviewTime}}.\n\nGoogle Meet: {{meetLink}}\n\nPlease keep your updated resume handy. Reply to this email if you need a different slot.\n\nRegards,\n{{recruiter}}\n{{company}}' },
  { channel: 'email', name: 'Not moving ahead', subject: 'Update on your {{role}} application', body: 'Hi {{name}},\n\nThank you for your time. We will not be moving ahead with your application for {{role}} at this stage. We will keep your profile on file for future roles that match.\n\nRegards,\n{{recruiter}}\n{{company}}' },
]

export async function ensureTemplates() {
  if (Object.keys(getState().templates).length) return
  for (const t of DEFAULT_TEMPLATES) await put('templates', { ...t, id: uid('t') })
}

/* Clearly fictional sample records so the screens can be explored before real resumes arrive. */
export async function loadSample() {
  const now = Date.now()
  const jobs: Job[] = [
    {
      id: uid('j'), title: 'Senior Java Developer', client: 'Example Fintech', tech: 'Java', location: { ...lookup('Malad, Mumbai') }, workMode: 'hybrid',
      expMin: 5, expMax: 8, ctcMaxLpa: 24, noticeMaxDays: 30, openings: 2,
      mustSkills: ['Java', 'Spring Boot', 'Microservices', 'SQL'], niceSkills: ['Kafka', 'AWS', 'Docker'],
      description: 'Build and own payment microservices in Java and Spring Boot.\nDesign REST APIs used by partner banks.\nWork with SQL at high volume and tune queries.\nMentor two junior developers.',
      status: 'open', createdAt: now - 6 * 864e5, updatedAt: now,
    },
    {
      id: uid('j'), title: 'React Frontend Engineer', client: 'Example Retail', tech: 'Frontend', location: { ...lookup('Pune') }, workMode: 'onsite',
      expMin: 2, expMax: 5, ctcMaxLpa: 14, noticeMaxDays: 45, openings: 1,
      mustSkills: ['React', 'TypeScript', 'CSS'], niceSkills: ['Next.js', 'Figma'],
      description: 'Ship customer-facing screens in React and TypeScript.\nTurn Figma designs into accessible components.\nOwn page performance.',
      status: 'open', createdAt: now - 3 * 864e5, updatedAt: now,
    },
    {
      id: uid('j'), title: 'Data Engineer', client: 'Example Analytics', tech: 'Data', location: { ...lookup('Bengaluru') }, workMode: 'remote',
      expMin: 3, expMax: 6, ctcMaxLpa: 20, noticeMaxDays: 60, openings: 1,
      mustSkills: ['Python', 'SQL', 'Spark', 'Airflow'], niceSkills: ['Snowflake', 'AWS'],
      description: 'Build batch and streaming pipelines.\nModel data in the warehouse.\nKeep jobs observable and cheap.',
      status: 'open', createdAt: now - 1 * 864e5, updatedAt: now,
    },
  ]
  const ppl: [number, string, string, number, number, number, number, number, string, string[], Stage][] = [
    [0, 'Sample Candidate A', 'Backend Engineer', 6.5, 6, 18, 23, 30, 'Goregaon, Mumbai', ['Java', 'Spring Boot', 'Microservices', 'SQL', 'Kafka', 'Docker'], 'l2'],
    [0, 'Sample Candidate B', 'Software Engineer', 4, 3.5, 11, 16, 60, 'Thane', ['Java', 'Spring Boot', 'SQL', 'Hibernate'], 'l1'],
    [0, 'Sample Candidate C', 'Lead Developer', 9, 8, 26, 32, 90, 'Pune', ['Java', 'Spring Boot', 'Microservices', 'AWS', 'Kafka'], 'contacted'],
    [0, 'Sample Candidate D', 'Java Developer', 5.5, 5, 15, 21, 15, 'Andheri, Mumbai', ['Java', 'Spring Boot', 'Microservices', 'SQL', 'AWS'], 'selected'],
    [0, 'Sample Candidate E', 'Developer', 3, 2, 7, 10, 30, 'Nagpur', ['Java', 'SQL'], 'rejected'],
    [1, 'Sample Candidate F', 'Frontend Developer', 3, 3, 9, 13, 30, 'Hinjewadi, Pune', ['React', 'TypeScript', 'CSS', 'Next.js'], 'l1'],
    [1, 'Sample Candidate G', 'UI Engineer', 4.5, 4, 12, 17, 60, 'Mumbai', ['React', 'JavaScript', 'CSS', 'Figma'], 'hold'],
    [1, 'Sample Candidate H', 'Web Developer', 1.5, 1.5, 4.5, 7, 0, 'Kharadi, Pune', ['React', 'CSS', 'HTML'], 'new'],
    [2, 'Sample Candidate I', 'Data Engineer', 4, 4, 14, 19, 60, 'Hyderabad', ['Python', 'SQL', 'Spark', 'Airflow', 'Snowflake'], 'contacted'],
    [2, 'Sample Candidate J', 'BI Developer', 5, 2, 12, 16, 30, 'Chennai', ['SQL', 'Power BI', 'Python'], 'new'],
  ]
  const w = getState().config.weights
  for (const j of jobs) await put('jobs', j)
  let i = 0
  for (const [ji, name, role, tot, rel, cur, exp, notice, loc, skills, stage] of ppl) {
    const job = jobs[ji]!
    const place = lookup(loc)
    const distanceKm = km(place, job.location)
    const base = { skills, relevantExp: rel, totalExp: tot, expectedCtcLpa: exp, noticeDays: notice, distanceKm }
    const s = scoreCandidate(base, job, w)
    const slug = name.split(' ').pop()!.toLowerCase()
    const c: Candidate = {
      id: uid('c'), jobId: job.id, name, email: `candidate.${slug}@example.com`, phone: `98000000${String(10 + i).padStart(2, '0')}`,
      fileName: `sample-${slug}.pdf`, fileKind: 'sample', resumeText: `${name}\n${role}\n${tot} years experience. Skills: ${skills.join(', ')}. Location: ${loc}. Current CTC ${cur} LPA, expected ${exp} LPA. Notice period ${notice} days.`,
      currentRole: role, currentCompany: 'Example Co', totalExp: tot, relevantExp: rel, currentCtcLpa: cur, expectedCtcLpa: exp,
      noticeDays: notice, currentLocation: place, distanceKm, skills, education: 'B.E. Computer Engineering',
      summary: `Sample profile: ${role.toLowerCase()} with ${tot} years, mostly ${skills.slice(0, 2).join(' and ')}.`,
      match: { ...s, strengths: s.matchedSkills.length ? [`Hands-on ${s.matchedSkills.slice(0, 3).join(', ')}`] : [], gaps: s.missingSkills.length ? [`No ${s.missingSkills.slice(0, 2).join(' or ')} on record`] : [], verdict: 'Sample record for exploring the app.', by: 'rules', at: now },
      stage, shortlisted: s.score >= getState().config.shortlistAt, remarks: [{ id: uid('r'), at: now - (i + 1) * 36e5, text: 'Sample record created.', kind: 'note' }],
      createdAt: now - (10 - i) * 6 * 36e5, updatedAt: now,
    }
    await put('candidates', c); i++
  }
}
