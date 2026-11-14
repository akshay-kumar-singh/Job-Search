import { useQuery } from '@tanstack/react-query'
import { fetchJobs, fetchMeta } from './lib/api'
import { useApplications, usePref } from './lib/storage'
import { timeAgo } from './lib/format'
import CountryPicker from './components/CountryPicker'
import JobList from './components/JobList'
import Applications from './components/Applications'

type Tab = 'jobs' | 'stretch' | 'applied'

export default function App() {
  const meta = useQuery({ queryKey: ['meta'], queryFn: fetchMeta, refetchInterval: 15 * 60_000 })
  const [countryKey, setCountryKey] = usePref('country', 'in')
  const [tab, setTab] = usePref<Tab>('tab', 'jobs')
  const { apps, track, update, remove, importApps } = useApplications()

  const countries = meta.data?.countries ?? []
  const country = countries.find((c) => c.key === countryKey) ?? countries[0]
  const jobs = useQuery({
    queryKey: ['jobs', country?.key, meta.data?.updated],
    queryFn: () => fetchJobs(country!.key, meta.data!.updated),
    enabled: Boolean(country && meta.data),
  })

  const appliedCount = Object.values(apps).filter((a) => a.status !== 'Not interested').length
  const sources = meta.data?.sources ?? []
  const failed = sources.filter((s) => !s.ok)

  const tabButton = (value: Tab, label: string, count?: number) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      aria-pressed={tab === value}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
        tab === value ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      {label}
      {count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{count}</span>}
    </button>
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Job Search</h1>
          <p className="text-sm text-slate-500">
            Software engineer roles that fit my profile, from company career pages and job boards.
          </p>
        </div>
        {meta.data && (
          <details className="text-right text-sm text-slate-500">
            <summary className="cursor-pointer list-none hover:text-slate-800">
              Updated {timeAgo(meta.data.updated)} · {sources.length - failed.length}/{sources.length} sources OK ▾
            </summary>
            <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-left text-xs shadow-sm">
              <p className="mb-2 text-slate-600">
                Checked {meta.data.schedule}. Last run scanned {meta.data.scanned} possible matches.
              </p>
              <ul className="space-y-0.5">
                {sources.map((s) => (
                  <li key={s.name} className={s.ok ? 'text-slate-600' : 'text-red-600'}>
                    {s.ok ? '✓' : '✗'} {s.name} {s.ok ? `· ${s.matches} matching titles` : `· ${s.error}`}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
      </header>

      {meta.isPending && <p className="text-sm text-slate-500">Loading jobs…</p>}
      {meta.isError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">No job data yet.</p>
          <p className="mt-1">
            The collector publishes it to the repository's <code>data</code> branch every few hours. To run it now, open
            the repository on GitHub → Actions → “Collect jobs” → Run workflow.
          </p>
        </div>
      )}

      {country && (
        <>
          <CountryPicker countries={countries} selected={country.key} onSelect={setCountryKey} />

          <div className="mt-6 flex gap-1 border-b border-slate-200">
            {tabButton('jobs', 'Jobs', country.count)}
            {tabButton('stretch', 'Stretch', country.stretch)}
            {tabButton('applied', 'My applications', appliedCount)}
          </div>

          <main className="mt-5">
            {tab === 'applied' ? (
              <Applications
                apps={apps}
                countries={countries}
                onStatus={(id, status) => update(id, { status })}
                onNotes={(id, notes) => update(id, { notes })}
                onRemove={remove}
                onImport={importApps}
              />
            ) : jobs.isPending ? (
              <p className="text-sm text-slate-500">Loading {country.name}…</p>
            ) : jobs.isError ? (
              <p className="text-sm text-red-600">Could not load jobs for {country.name}: {jobs.error.message}</p>
            ) : (
              <JobList
                jobs={jobs.data}
                country={country}
                stretch={tab === 'stretch'}
                apps={apps}
                onTrack={(job, status) => track(job, country.key, status)}
                onStatus={(id, status) => update(id, { status })}
                onUntrack={remove}
              />
            )}
          </main>
        </>
      )}

      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
        Jobs come from company career pages and from{' '}
        <a className="underline" href="https://www.mycareersfuture.gov.sg" target="_blank" rel="noopener">MyCareersFuture</a>,{' '}
        <a className="underline" href="https://www.arbeitnow.com" target="_blank" rel="noopener">Arbeitnow</a>,{' '}
        <a className="underline" href="https://himalayas.app" target="_blank" rel="noopener">Himalayas</a>,{' '}
        <a className="underline" href="https://remotive.com" target="_blank" rel="noopener">Remotive</a>,{' '}
        <a className="underline" href="https://cutshort.io" target="_blank" rel="noopener">Cutshort</a> and{' '}
        <a className="underline" href="https://remoteok.com" target="_blank" rel="noopener">Remote OK</a>. Applying always
        happens on the employer's site.
      </footer>
    </div>
  )
}
