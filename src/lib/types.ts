/* Stages are data: the fixed outcomes below plus any number of interview levels
 * (L1, L2, L3 by default) that the super admin can rename or extend in Admin. */
export type Stage = string
export interface Level { id: string; label: string }

export const DEFAULT_LEVELS: Level[] = [
  { id: 'l1', label: 'L1 screening' },
  { id: 'l2', label: 'L2 technical' },
  { id: 'l3', label: 'L3 manager / HR' },
]

export function buildStages(levels: Level[]): { id: Stage; label: string; kind: 'start' | 'level' | 'outcome' | 'park' }[] {
  return [
    { id: 'new', label: 'New', kind: 'start' },
    { id: 'contacted', label: 'Contacted', kind: 'start' },
    ...levels.map((l) => ({ ...l, kind: 'level' as const })),
    { id: 'selected', label: 'Selected', kind: 'outcome' },
    { id: 'offered', label: 'Offered', kind: 'outcome' },
    { id: 'joined', label: 'Joined', kind: 'outcome' },
    { id: 'declined', label: 'Declined', kind: 'outcome' },
    { id: 'hold', label: 'On hold', kind: 'park' },
    { id: 'rejected', label: 'Rejected', kind: 'park' },
  ]
}
let current = buildStages(DEFAULT_LEVELS)
export const setStageLevels = (levels: Level[]) => { current = buildStages(levels) }
export const getStages = () => current
export const stageLabel = (s: Stage) => current.find((x) => x.id === s)?.label ?? s

export interface Place { label: string; lat?: number; lng?: number }

export interface Job {
  vacancyCreatedDate?: string
  positionClosedDate?: string
  demoAssignmentReviews?: AssignmentReview[]
  demoAssignment?: { recruiter_id: string; assigned_at: string; version: number }
  id: string
  title: string
  client: string
  tech: string // technology bucket for bifurcation, e.g. "Java", "Data", "Frontend"
  location: Place
  workMode: 'onsite' | 'hybrid' | 'remote'
  expMin: number
  expMax: number
  ctcMinLpa?: number // budget range, lakhs per annum
  ctcMaxLpa: number
  noticeMaxDays: number
  openings: number
  mustSkills: string[]
  niceSkills: string[]
  description: string // full JD text
  status: 'open' | 'paused' | 'closed'
  ideal?: IdealProfile
  calibration?: Calibration
  createdAt: number
  updatedAt: number
}

export interface IdealProfile {
  referenceFileName?: string
  summary: string
  traits: string[]
  expRange: string
  ctcBand: string
  basedOn: string[] // candidate ids
  createdAt: number
}

export interface Calibration {
  notes: string
  summary?: string
  translation?: { lang: string; text: string }
  updatedAt: number
}

export interface MatchBreakdown {
  skills: number // 0..1
  experience: number
  location: number
  ctc: number
  notice: number
}

export interface Match {
  score: number // 0..100
  breakdown: MatchBreakdown
  matchedSkills: string[]
  missingSkills: string[]
  strengths: string[]
  gaps: string[]
  verdict: string
  by: 'ai' | 'rules'
  at: number
}

export interface Remark { id: string; at: number; text: string; by?: string; kind: 'note' | 'call' | 'whatsapp' | 'email' | 'meet' | 'stage' }

export interface Candidate {
  id: string
  jobId: string
  name: string
  email: string
  phone: string
  fileName: string
  fileKind: string
  resumeText: string
  currentRole: string
  currentCompany: string
  totalExp: number | null
  relevantExp: number | null
  currentCtcLpa: number | null
  expectedCtcLpa: number | null
  noticeDays: number | null
  currentLocation: Place
  distanceKm: number | null
  skills: string[]
  education: string
  summary: string
  match?: Match
  stage: Stage
  shortlisted: boolean
  remarks: Remark[]
  interviewAt?: number
  meetLink?: string
  employment?: Employment[]
  selfRatings?: Record<string, number> // JD skill -> 1..5, as the candidate rates themselves
  interviews?: Interview[]
  fileStorageVersion?: number
  hasOriginal?: boolean // original resume file kept in this browser
  createdAt: number
  updatedAt: number
}

export interface Employment { company: string; role: string; from: string; to: string } // YYYY-MM, to may be 'present'

export interface PanelFeedback {
  candidate_id: string; interview_id: string; panelist_id: string; panelist_name: string
  expires_at: string; requested_at: string; revoked_at: string | null; submitted_at: string | null
  rating: number | null; recommendation: 'select' | 'hold' | 'reject' | null; comments: string | null
}

export interface Interview {
  demoPanelFeedback?: PanelFeedback[]
  id: string
  round: Stage
  at: number
  panelistIds: string[]
  meetLink?: string
  result: 'pending' | 'select' | 'reject' | 'hold'
  rating?: number // 1..5
  feedback?: string
  feedbackBy?: string
  createdAt: number
  inviteSentAt?: number // the invite email went out
  reminderSentAt?: number // the morning reminder went out (set by the server)
}

export interface Panelist {
  id: string
  name: string
  email: string
  phone: string
  availability?: string
  availableFrom?: string
  availableTo?: string
  calendly: string // booking link only; no Calendly API calls
  expertise: string
  active: boolean
  createdAt: number
  updatedAt: number
}

export interface Template {
  purpose?: 'first' | 'followup' | 'invitation' | 'feedback' | 'other'
  link?: string
  id: string
  channel: 'whatsapp' | 'email'
  name: string
  subject?: string
  body: string
}

export interface AppConfig {
  productName: string
  companyName: string
  recruiterName: string
  careersUrl: string
  weights: MatchBreakdown // sum 1
  shortlistAt: number // score threshold
  bands: { potential: number; near: number } // >= potential green, >= near orange, below red
  levels: Level[]
  webhookUrl: string // Zapier / Make / n8n hook for auto-posting jobs
  timezone: string // IANA zone used for reminders, e.g. Asia/Kolkata
  autoInvites: boolean // email the candidate (and CC the panel) when a round is scheduled
  autoReminders: boolean // email the candidate on the morning of the interview
}


export interface AssignmentReview {
 id: string | number; job_id: string; assignment_version: number; recruiter_id: string; recruiter_name: string; recruiter_email: string; job_title: string; assigned_at: string;
 outcome: 'successful' | 'unsuccessful'; rating: number | null; feedback: string; revision: number; created_at: string; updated_at: string; updated_by: string;
 history: {revision:number;outcome:'successful'|'unsuccessful';rating:number|null;feedback:string;updated_at:string;updated_by:string}[];
}
