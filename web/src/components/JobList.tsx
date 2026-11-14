import { useMemo } from 'react'
import type { Application, CountrySummary, Job, Status } from '../types'
import { daysSince } from '../lib/format'
import { usePref } from '../lib/storage'
import JobCard from './JobCard'

interface Props {
  jobs: Job[]
  country: CountrySummary
  stretch: boolean
  apps: Record<string, Application>
  onTrack: (job: Job, status: Status) => void
  onStatus: (id: string, status: Status) => void
  onUntrack: (id: string) => void
}

type Sort = 'fit' | 'posted' | 'found'
type Visa = 'all' | 'good' | 'no-warn'

const input = 'rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none'

export default function JobList({ jobs, country, stretch, apps, onTrack, onStatus, onUntrack }: Props) {
  const [search, setSearch] = usePref('search', '')
  const [minFit, setMinFit] = usePref('minFit', 0)
  const [within, setWithin] = usePref('within', 0)
  const [visa, setVisa] = usePref<Visa>('visa', 'all')
  const [sort, setSort] = usePref<Sort>('sort', 'fit')
  const [hideTracked, setHideTracked] = usePref('hideTracked', true)

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = jobs.filter((j) => {
      if (j.closed || j.stretch !== stretch) return false
      if (hideTracked && apps[j.id]) return false
      if (j.fit < minFit) return false
      if (within && j.posted && (daysSince(j.posted) ?? 0) > within) return false
      if (country.visa && visa === 'good' && j.visa_level !== 'good') return false
      if (country.visa && visa === 'no-warn' && j.visa_level === 'warn') return false
      return !q || `${j.company} ${j.title} ${j.location} ${j.why}`.toLowerCase().includes(q)
    })
    const by = {
      fit: (a: Job, b: Job) => b.fit - a.fit || b.posted.localeCompare(a.posted),
      posted: (a: Job, b: Job) => b.posted.localeCompare(a.posted) || b.fit - a.fit,
      found: (a: Job, b: Job) => b.found.localeCompare(a.found) || b.fit - a.fit,
    }[sort]
    return list.sort(by)
  }, [jobs, stretch, hideTracked, apps, minFit, within, country.visa, visa, search, sort])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company, role, skill…"
          aria-label="Search"
          className={`${input} w-full sm:w-64`}
        />
        <select value={minFit} onChange={(e) => setMinFit(Number(e.target.value))} aria-label="Minimum fit" className={input}>
          <option value={0}>Any fit</option>
          <option value={50}>Fit 50+</option>
          <option value={70}>Fit 70+</option>
        </select>
        <select value={within} onChange={(e) => setWithin(Number(e.target.value))} aria-label="Posted within" className={input}>
          <option value={0}>Posted any time</option>
          <option value={3}>Last 3 days</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
        {country.visa && (
          <select value={visa} onChange={(e) => setVisa(e.target.value as Visa)} aria-label="Visa" className={input}>
            <option value="all">Any visa note</option>
            <option value="good">Mentions sponsorship</option>
            <option value="no-warn">Hide visa warnings</option>
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className={input}>
          <option value="fit">Best match</option>
          <option value="posted">Newest posting</option>
          <option value="found">Recently found</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={hideTracked} onChange={(e) => setHideTracked(e.target.checked)} />
          Hide applied
        </label>
      </div>

      <p className="text-sm text-slate-500">
        {shown.length} {stretch ? 'stretch ' : ''}job{shown.length === 1 ? '' : 's'} in {country.flag} {country.name}
        {stretch && ' — these ask for a bit more experience than you have, worth a try'}
      </p>

      {shown.length ? (
        <div className="space-y-3">
          {shown.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              showVisa={country.visa}
              tracked={apps[job.id]}
              onTrack={(status) => onTrack(job, status)}
              onStatus={(status) => onStatus(job.id, status)}
              onUntrack={() => onUntrack(job.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No jobs here right now{search || minFit || within || visa !== 'all' ? ' with these filters' : ''}. New ones are
          collected automatically — or search by hand using the links below.
        </div>
      )}

      {country.boards.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">Search by hand in {country.name}</h3>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {country.boards.map(([label, url]) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener" className="text-indigo-700 hover:underline">
                  {label} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
