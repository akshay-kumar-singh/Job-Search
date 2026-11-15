import { useMemo, useRef, useState } from 'react'
import type { Application, CountrySummary, ListedJob, Status } from '../types'
import { companyKey, daysSince, isNew } from '../lib/format'
import { scrollToTop, usePaged } from '../lib/paging'
import { usePref } from '../lib/storage'
import JobCard from './JobCard'
import Pagination from './Pagination'

interface Props {
  jobs: ListedJob[]
  country: CountrySummary // a real country, or the "All countries" view
  countries: Record<string, CountrySummary>
  stretch: boolean
  fintech: boolean // the Fintech section: wording only, the jobs are already filtered
  company: string | null // only this company's roles (picked in the fintech company list)
  onClearCompany: () => void
  apps: Record<string, Application>
  opened: Set<string>
  onOpen: (id: string) => void
  onNotYet: (id: string) => void
  onTrack: (job: ListedJob, status: Status) => void
  onStatus: (id: string, status: Status) => void
  onUntrack: (id: string) => void
}

type Sort = 'newest' | 'fit'
type Visa = 'all' | 'good' | 'no-warn'

const day = (j: ListedJob) => j.posted || j.found.slice(0, 10)

export default function JobList(props: Props) {
  const { jobs, country, countries, stretch, fintech, company, onClearCompany, apps, opened, onOpen, onNotYet, onTrack, onStatus, onUntrack } =
    props
  const [search, setSearch] = usePref('search', '')
  const [minFit, setMinFit] = usePref('min-fit', 0)
  const [within, setWithin] = usePref('posted-within', 0)
  const [newOnly, setNewOnly] = usePref('new-only', false)
  const [visa, setVisa] = usePref<Visa>('visa-filter', 'all')
  const [sort, setSort] = usePref<Sort>('sort-order', 'newest')
  const [hideTracked, setHideTracked] = usePref('hide-applied', true)
  const [showFilters, setShowFilters] = useState(false) // on a phone the extra filters fold away
  const listTop = useRef<HTMLDivElement>(null)
  const isAll = country.key === 'all'
  const activeFilters = [within > 0, minFit > 0, newOnly, country.visa && visa !== 'all'].filter(Boolean).length
  const filtered = Boolean(search || minFit || within || newOnly || visa !== 'all' || company)
  const kind = `${stretch ? 'stretch ' : ''}${fintech ? 'fintech ' : ''}`

  const pool = useMemo(() => {
    const only = company ? companyKey(company) : ''
    return jobs.filter((j) => !j.closed && j.stretch === stretch && (!only || companyKey(j.company) === only))
  }, [jobs, stretch, company])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = pool.filter((j) => {
      if (hideTracked && apps[j.id]) return false
      if (j.fit < minFit) return false
      if (within && (daysSince(day(j)) ?? 0) >= within) return false
      if (newOnly && !isNew(j.found)) return false
      if (country.visa && visa === 'good' && j.visa_level !== 'good') return false
      if (country.visa && visa === 'no-warn' && j.visa_level === 'warn') return false
      return !q || `${j.company} ${j.title} ${j.location} ${j.why}`.toLowerCase().includes(q)
    })
    return list.sort((a, b) =>
      sort === 'newest'
        ? day(b).localeCompare(day(a)) || b.fit - a.fit
        : b.fit - a.fit || day(b).localeCompare(day(a)),
    )
  }, [pool, hideTracked, apps, minFit, within, newOnly, country.visa, visa, search, sort])

  const paged = usePaged(shown, [country.key, stretch, fintech, company, search, minFit, within, newOnly, visa, sort, hideTracked].join('|'))
  const goToPage = (page: number) => {
    paged.setPage(page)
    scrollToTop(listTop.current)
  }

  function clearFilters() {
    setSearch('')
    setMinFit(0)
    setWithin(0)
    setNewOnly(false)
    setVisa('all')
    onClearCompany()
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company, role, skill…"
          aria-label="Search"
          className="field w-full sm:w-64"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="field flex-1 sm:flex-none">
          <option value="newest">Newest first</option>
          <option value="fit">Best match first</option>
        </select>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className={`field flex-1 font-medium sm:hidden ${activeFilters ? 'border-accent text-accent' : ''}`}
        >
          Filters{activeFilters ? ` · ${activeFilters}` : ''} {showFilters ? '▴' : '▾'}
        </button>
        <div className={`${showFilters ? 'flex' : 'hidden'} w-full flex-wrap items-center gap-2 sm:flex sm:w-auto`}>
          <select value={within} onChange={(e) => setWithin(Number(e.target.value))} aria-label="Posted" className="field">
            <option value={0}>Posted this week</option>
            <option value={3}>Last 3 days</option>
            <option value={1}>Today</option>
          </select>
          <select value={minFit} onChange={(e) => setMinFit(Number(e.target.value))} aria-label="Minimum fit" className="field">
            <option value={0}>Any match</option>
            <option value={50}>Good match (50+)</option>
            <option value={70}>Great match (70+)</option>
          </select>
          {country.visa && (
            <select value={visa} onChange={(e) => setVisa(e.target.value as Visa)} aria-label="Visa" className="field">
              <option value="all">Any visa note</option>
              <option value="good">Mentions sponsorship</option>
              <option value="no-warn">Hide visa warnings</option>
            </select>
          )}
          <label className="flex items-center gap-1.5 px-1 text-sm text-muted">
            <input type="checkbox" className="accent-ink" checked={newOnly} onChange={(e) => setNewOnly(e.target.checked)} />
            New today
          </label>
          <label className="flex items-center gap-1.5 px-1 text-sm text-muted">
            <input type="checkbox" className="accent-ink" checked={hideTracked} onChange={(e) => setHideTracked(e.target.checked)} />
            Hide applied
          </label>
        </div>
      </div>

      {company && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-accent-soft px-4 py-2.5 text-sm text-ink">
          <span className="mr-auto">
            Only roles at <b className="font-semibold">{company}</b>
          </span>
          <button type="button" onClick={onClearCompany} className="font-semibold text-accent hover:underline">
            Show all companies
          </button>
        </div>
      )}

      <div ref={listTop} className="flex scroll-mt-4 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span>
          {shown.length > 0 && (
            <>
              Showing{' '}
              <span className="font-display font-extrabold text-ink">
                {paged.from === paged.to ? paged.from : `${paged.from}–${paged.to}`}
              </span>{' '}
              of{' '}
            </>
          )}
          {shown.length} {kind}job{shown.length === 1 ? '' : 's'} in {country.flag} {country.name}
          {shown.length !== pool.length && <span className="text-faint"> ({pool.length} before filters)</span>}
        </span>
        {filtered && (
          <button type="button" onClick={clearFilters} className="font-semibold text-accent hover:underline">
            Clear filters
          </button>
        )}
      </div>
      {stretch && (
        <p className="rounded-2xl bg-accent-soft px-4 py-2.5 text-sm text-ink">
          Stretch roles ask for a bit more experience than you have. Worth applying when the rest of the role fits well.
        </p>
      )}

      {shown.length ? (
        <div className="space-y-4">
          {paged.items.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              places={isAll ? job.countryKeys.map((k) => countries[k]).filter(Boolean) : []}
              showVisa={job.countryKeys.some((k) => countries[k]?.visa)}
              tracked={apps[job.id]}
              opened={opened.has(job.id)}
              onOpen={() => onOpen(job.id)}
              onNotYet={() => onNotYet(job.id)}
              onTrack={(status) => onTrack(job, status)}
              onStatus={(status) => onStatus(job.id, status)}
              onUntrack={() => onUntrack(job.id)}
            />
          ))}
          <Pagination page={paged.page} pages={paged.pages} onPage={goToPage} />
        </div>
      ) : (
        <div className="card border-dashed border-line-strong p-10 text-center text-sm text-muted">
          {pool.length && filtered ? (
            <>
              No jobs match these filters.{' '}
              <button type="button" onClick={clearFilters} className="font-semibold text-accent hover:underline">
                Clear filters
              </button>
            </>
          ) : pool.length ? (
            'You have acted on every job here. New ones arrive with the next update.'
          ) : (
            `No fresh ${kind}jobs${company ? ` at ${company}` : ''} in ${country.name} this week. New ones are checked every 6 hours${
              isAll || company ? '.' : ' — meanwhile, try the search links below.'
            }`
          )}
        </div>
      )}

      {!isAll && country.boards.length > 0 && (
        <div className="card p-5">
          <p className="eyebrow">Search by hand</p>
          <h3 className="mt-1 text-lg font-bold text-ink">More {country.name} jobs on other sites</h3>
          <p className="mt-0.5 text-xs text-muted">These sites don't let bots read their listings, so check them yourself.</p>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {country.boards.map(([label, url]) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener" className="font-semibold text-accent hover:text-accent-hover hover:underline">
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
