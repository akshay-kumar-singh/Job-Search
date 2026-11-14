import { useCallback, useMemo, useRef, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { CountrySummary, ListedJob, Status } from './types'
import { fetchJobs, fetchMeta } from './lib/api'
import { useApplications, usePref } from './lib/storage'
import { clock, nextRun, timeAgo } from './lib/format'
import CountryBar from './components/CountryBar'
import JobList from './components/JobList'
import Applications from './components/Applications'
import HowItWorks from './components/HowItWorks'
import FintechCompanies from './components/FintechCompanies'

type Tab = 'jobs' | 'stretch' | 'companies' | 'applied' | 'help'
type Mode = 'all' | 'fintech' // every matching job, or only jobs at fintech companies

const sum = (cs: CountrySummary[], pick: (c: CountrySummary) => number | undefined) => cs.reduce((n, c) => n + (pick(c) ?? 0), 0)

export default function App() {
  const meta = useQuery({ queryKey: ['meta'], queryFn: fetchMeta, refetchInterval: 15 * 60_000 })
  const [selected, setSelected] = usePref('view-country', 'all')
  const [savedTab, setTab] = usePref<Tab>('view-tab', 'jobs')
  const [mode, setModePref] = usePref<Mode>('mode', 'all')
  const [company, setCompany] = useState<string | null>(null) // set from the fintech company list
  const { apps, track, update, remove, importApps, sync, deviceLink } = useApplications()
  const [opened, setOpened] = useState<Set<string>>(() => new Set())
  const tabsRef = useRef<HTMLDivElement>(null)

  const fintech = mode === 'fintech'
  const tab: Tab = savedTab === 'companies' && !fintech ? 'jobs' : savedTab

  const summaries = useMemo(() => meta.data?.countries ?? [], [meta.data])
  // In the Fintech section every country count is its fintech count.
  const countries = useMemo(
    () =>
      fintech
        ? summaries.map((c) => ({ ...c, count: c.fintech ?? 0, stretch: c.fintech_stretch ?? 0, new: c.fintech_new ?? 0 }))
        : summaries,
    [summaries, fintech],
  )
  const byKey = useMemo(() => Object.fromEntries(countries.map((c) => [c.key, c])), [countries])
  const all: CountrySummary = useMemo(
    () => ({
      key: 'all',
      name: 'All countries',
      flag: '🌐',
      group: '',
      visa: true,
      count: sum(countries, (c) => c.count),
      stretch: sum(countries, (c) => c.stretch),
      new: sum(countries, (c) => c.new),
      boards: [],
    }),
    [countries],
  )
  const current = selected === 'all' ? all : (byKey[selected] ?? all)
  const directory = useMemo(() => meta.data?.fintech_companies ?? [], [meta.data])

  const results = useQueries({
    queries: countries.map((c) => ({
      queryKey: ['jobs', c.key, meta.data?.updated],
      queryFn: () => fetchJobs(c.key, meta.data!.updated),
      enabled: Boolean(meta.data) && (current.key === 'all' || current.key === c.key),
    })),
    combine: (rs) => ({
      data: rs.map((r) => r.data),
      loading: rs.some((r) => r.isLoading),
      error: rs.find((r) => r.error)?.error ?? null,
    }),
  })

  // One list for the selected view; a job listed for two countries ("Stockholm / London") appears once.
  const jobs = useMemo(() => {
    const merged = new Map<string, ListedJob>()
    countries.forEach((c, i) => {
      if (current.key !== 'all' && c.key !== current.key) return
      for (const job of results.data[i] ?? []) {
        if (fintech && !job.fintech) continue
        const seen = merged.get(job.id)
        if (seen) seen.countryKeys.push(c.key)
        else merged.set(job.id, { ...job, countryKeys: [c.key] })
      }
    })
    return [...merged.values()]
  }, [countries, current.key, results.data, fintech])

  const markOpened = useCallback((id: string) => setOpened((prev) => new Set(prev).add(id)), [])
  const clearOpened = useCallback(
    (id: string) =>
      setOpened((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      }),
    [],
  )
  const onTrack = useCallback(
    (job: ListedJob, status: Status) => {
      track(job, job.countryKeys[0], status)
      clearOpened(job.id)
    },
    [track, clearOpened],
  )

  function setMode(next: Mode) {
    setModePref(next)
    setCompany(null)
    if (next === 'all' && savedTab === 'companies') setTab('jobs')
  }

  // "3 roles for you" on a fintech company: that company's jobs, in every country.
  function showCompany(name: string, stretch: boolean) {
    setCompany(name)
    setSelected('all')
    setTab(stretch ? 'stretch' : 'jobs')
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const tracked = Object.values(apps).filter((a) => a.status !== 'Not interested').length
  const sources = meta.data?.sources ?? []
  const failed = sources.filter((s) => !s.ok)
  const followed = directory.filter((c) => c.followed).length

  const tabButton = (value: Tab, label: string, count?: number) => (
    <button
      key={value}
      type="button"
      onClick={() => setTab(value)}
      aria-pressed={tab === value}
      className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 font-display text-sm font-bold transition ${
        tab === value ? 'border-ink text-ink' : 'border-transparent text-faint hover:text-ink'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`ml-1.5 rounded-full px-1.5 text-xs ${tab === value ? 'bg-ink text-white' : 'bg-paper-subtle text-muted'}`}>
          {count}
        </span>
      )}
    </button>
  )

  const modeButton = (value: Mode, label: string, count: number) => (
    <button
      key={value}
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`flex items-center gap-2 rounded-full px-4 py-2 font-display text-sm font-bold transition ${
        mode === value ? 'bg-ink text-white shadow-[0_8px_18px_-10px_rgba(21,18,12,0.7)]' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
      <span className={`rounded-full px-1.5 text-xs ${mode === value ? 'bg-white/15 text-white' : 'bg-paper-subtle text-muted'}`}>
        {count}
      </span>
    </button>
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{fintech ? 'Job search · Fintech' : 'Job search'}</p>
            <h1 className="mt-2 text-3xl font-extrabold leading-[1.05] text-ink sm:text-[2.6rem]">
              {fintech ? 'Fintech jobs' : 'Fresh jobs'}, picked for <span className="serif-accent">you</span>.
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
              {fintech
                ? 'Software engineer roles at payments, banking, lending, investing, crypto and insurance companies — only from the last week, checked every 6 hours.'
                : 'Software engineer roles from company career pages and job boards — only from the last week, checked every 6 hours.'}
            </p>
          </div>
          <button type="button" onClick={() => setTab('help')} className="btn btn-secondary shrink-0">
            How it works
          </button>
        </div>

        {meta.data && (
          <>
            <div role="group" aria-label="Which jobs to show" className="mt-5 inline-flex rounded-full border border-line bg-surface p-1">
              {modeButton('all', 'All tech jobs', sum(summaries, (c) => c.count))}
              {modeButton('fintech', 'Fintech', sum(summaries, (c) => c.fintech))}
            </div>

            <div className="card mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 text-sm text-muted">
              <span>
                <span className="font-display text-base font-extrabold text-ink">{all.count}</span> {fintech ? 'fintech ' : ''}
                jobs this week
                {all.new > 0 && <span className="font-bold text-accent"> · {all.new} new today</span>}
              </span>
              {fintech && followed > 0 && (
                <button type="button" onClick={() => setTab('companies')} className="font-medium hover:text-ink hover:underline">
                  {followed} fintech companies followed
                </button>
              )}
              <span>Updated {timeAgo(meta.data.updated)}</span>
              <span>Next check around {clock(nextRun())}</span>
              <details className="relative">
                <summary className={`cursor-pointer list-none font-medium ${failed.length ? 'text-warn' : 'hover:text-ink'}`}>
                  {sources.length - failed.length}/{sources.length} sources OK ▾
                </summary>
                <div className="card absolute right-0 z-10 mt-2 max-h-72 w-[min(22rem,calc(100vw-2.5rem))] overflow-auto p-3 text-xs sm:left-0 sm:right-auto">
                  <ul className="space-y-0.5">
                    {[...failed, ...sources.filter((s) => s.ok)].map((s, i) => (
                      <li key={`${s.name}-${i}`} className={s.ok ? 'text-muted' : 'text-warn'}>
                        {s.ok ? '✓' : '✗'} {s.name} {s.ok ? `· ${s.matches} matching titles` : `· ${s.error}`}
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </div>
          </>
        )}
      </header>

      {meta.isPending && <p className="text-sm text-muted">Loading jobs…</p>}
      {meta.isError && (
        <div className="card p-6 text-sm text-muted">
          <p className="font-display text-base font-bold text-ink">No job data yet.</p>
          <p className="mt-1">
            The collector publishes it to the repository's <code>data</code> branch every 6 hours. To run it now, open the
            repository on GitHub → Actions → “Collect jobs” → Run workflow.
          </p>
        </div>
      )}

      {meta.data && (
        <>
          {(tab === 'jobs' || tab === 'stretch') && (
            <CountryBar all={all} countries={countries} selected={current.key} onSelect={setSelected} />
          )}

          <div ref={tabsRef} className="no-scrollbar mt-4 flex scroll-mt-4 gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)]">
            {tabButton('jobs', 'Jobs', current.count)}
            {tabButton('stretch', 'Stretch', current.stretch)}
            {fintech && tabButton('companies', 'Companies', directory.length)}
            {tabButton('applied', 'My applications', tracked)}
            {tabButton('help', 'How it works')}
          </div>

          <main className="mt-6">
            {tab === 'help' ? (
              <HowItWorks meta={meta.data} onBrowse={() => setTab('jobs')} />
            ) : tab === 'applied' ? (
              <Applications
                apps={apps}
                sync={sync}
                deviceLink={deviceLink}
                countries={summaries}
                onStatus={(id, status) => update(id, { status })}
                onNotes={(id, notes) => update(id, { notes })}
                onRemove={remove}
                onImport={importApps}
              />
            ) : tab === 'companies' ? (
              <FintechCompanies companies={directory} countries={byKey} onShowJobs={showCompany} />
            ) : results.loading ? (
              <p className="text-sm text-muted">Loading {current.name}…</p>
            ) : results.error ? (
              <p className="text-sm text-warn">Could not load the jobs: {results.error.message}</p>
            ) : (
              <JobList
                jobs={jobs}
                country={current}
                countries={byKey}
                stretch={tab === 'stretch'}
                fintech={fintech}
                company={company}
                onClearCompany={() => setCompany(null)}
                apps={apps}
                opened={opened}
                onOpen={markOpened}
                onNotYet={clearOpened}
                onTrack={onTrack}
                onStatus={(id, status) => update(id, { status })}
                onUntrack={remove}
              />
            )}
          </main>
        </>
      )}

      <footer className="mt-14 border-t border-line pt-5 text-xs leading-relaxed text-faint">
        Jobs come from company career pages (Greenhouse, Lever, Ashby, SmartRecruiters, Workable and Amazon), Workable's job
        search, and{' '}
        <a className="underline hover:text-accent" href="https://www.mycareersfuture.gov.sg" target="_blank" rel="noopener">MyCareersFuture</a>,{' '}
        <a className="underline hover:text-accent" href="https://www.arbeitnow.com" target="_blank" rel="noopener">Arbeitnow</a>,{' '}
        <a className="underline hover:text-accent" href="https://cutshort.io" target="_blank" rel="noopener">Cutshort</a>,{' '}
        <a className="underline hover:text-accent" href="https://himalayas.app" target="_blank" rel="noopener">Himalayas</a>,{' '}
        <a className="underline hover:text-accent" href="https://remotive.com" target="_blank" rel="noopener">Remotive</a> and{' '}
        <a className="underline hover:text-accent" href="https://remoteok.com" target="_blank" rel="noopener">Remote OK</a>. New
        companies are found in Hacker News' monthly “Who is hiring?” thread. You always apply on the employer's or the board's own
        page.
      </footer>
    </div>
  )
}
