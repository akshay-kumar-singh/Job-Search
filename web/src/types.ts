export type VisaLevel = '' | 'good' | 'warn'

/** One job, as written by the collector to jobs/<country>.json on the data branch. */
export interface Job {
  id: string
  company: string
  title: string
  location: string
  url: string
  source: string
  posted: string
  salary: string
  target: boolean
  fit: number
  years: number | null
  stretch: boolean
  why: string
  visa: string[]
  visa_level: VisaLevel
  found: string
  closed: boolean
  closed_on?: string
}

export interface CountrySummary {
  key: string
  name: string
  flag: string
  group: string
  visa: boolean
  count: number
  stretch: number
  new: number
  boards: [string, string][]
}

export interface SourceStatus {
  name: string
  type: string
  ok: boolean
  matches: number
  error: string
}

export interface Meta {
  updated: string
  schedule: string
  scanned: number
  experience_years: number | null
  max_required_years: number
  stretch_years: number
  countries: CountrySummary[]
  sources: SourceStatus[]
}

export const STATUSES = ['Applied', 'Interview', 'Offer', 'Rejected', 'Not interested'] as const
export type Status = (typeof STATUSES)[number]

/** A job you acted on. Kept in this browser (localStorage) with a copy of the job's details,
 *  so it stays listed after the job leaves the data. */
export interface Application {
  id: string
  status: Status
  appliedOn: string
  notes: string
  job: { company: string; title: string; location: string; url: string; country: string }
}
