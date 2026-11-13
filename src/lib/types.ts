export type Stage = 'new' | 'contacted' | 'l1' | 'l2' | 'selected' | 'rejected' | 'hold'

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'l1', label: 'L1 screening' },
  { id: 'l2', label: 'L2 screening' },
  { id: 'selected', label: 'Selected' },
  { id: 'hold', label: 'On hold' },
  { id: 'rejected', label: 'Rejected' },
]

export const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)?.label ?? s

export interface Place { label: string; lat?: number; lng?: number }

export interface Job {
  id: string
  title: string
  client: string
  tech: string // technology bucket for bifurcation, e.g. "Java", "Data", "Frontend"
  location: Place
  workMode: 'onsite' | 'hybrid' | 'remote'
  expMin: number
  expMax: number
  ctcMaxLpa: number // budget, lakhs per annum
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
  createdAt: number
  updatedAt: number
}

export interface Template {
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
}

export interface Secrets {
  aiProvider: 'builtin' | 'anthropic' | 'openai' | 'gemini'
  anthropicKey: string
  openaiKey: string
  geminiKey: string
  aiModel: string
  googleMapsKey: string
  waPhoneNumberId: string
  waToken: string
  resendKey: string
  emailFrom: string
  webhookUrl: string
  apiBase: string // where /api lives on the deployed build
}
