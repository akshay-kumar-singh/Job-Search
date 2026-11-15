import { useMemo } from 'react'
import type { CountrySummary, FintechCompany } from '../types'
import { usePref } from '../lib/storage'

interface Props {
  companies: FintechCompany[]
  countries: Record<string, CountrySummary>
  onShowJobs: (company: string, stretch: boolean) => void
}

// Links to a hiring system's board are careers pages; anything else is the company's website.
const CAREERS_HOSTS = /greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com/

/** Every fintech company the bot follows (plus others that posted a fintech role this week), with a link to its careers page. */
export default function FintechCompanies({ companies, countries, onShowJobs }: Props) {
  const [search, setSearch] = usePref('fintech-search', '')
  const [sector, setSector] = usePref('fintech-sector', 'all')
  const [hiringOnly, setHiringOnly] = usePref('fintech-hiring-only', false)

  const sectors = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of companies) counts.set(c.sector, (counts.get(c.sector) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [companies])
  const followed = companies.filter((c) => c.followed).length
  const hiring = companies.filter((c) => c.open + c.stretch > 0).length
  const q = search.trim().toLowerCase()
  const shown = companies.filter(
    (c) =>
      (sector === 'all' || c.sector === sector) &&
      (!hiringOnly || c.open + c.stretch > 0) &&
      (!q || `${c.name} ${c.sector}`.toLowerCase().includes(q)),
  )

  const sectorChip = (value: string, label: string, count: number) => (
    <button key={value} type="button" onClick={() => setSector(value)} aria-pressed={sector === value} className="chip">
      {label} <span className={sector === value ? 'text-white/70' : 'text-faint'}>{count}</span>
    </button>
  )

  return (
    <section className="space-y-4">
      <div className="card p-5">
        <p className="eyebrow">Fintech companies</p>
        <h2 className="mt-1 text-xl font-bold text-ink">
          {followed} fintechs followed · <span className="serif-accent">{hiring}</span> hiring for you this week
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          The bot reads these companies' careers pages every 6 hours: payments, neobanks, lending, investing, crypto, cards,
          insurance and the infrastructure behind them, in India, the Gulf, Singapore, Europe, Australia and North America. Ones
          marked <i>found this week</i> aren't on the list, but posted a fintech role for you this week. No matching role at a
          company you like? Its careers page shows everything else it has open.
        </p>
      </div>

      <nav aria-label="Sectors" className="no-scrollbar -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0">
        <div className="flex gap-2 sm:flex-wrap">
          {sectorChip('all', 'All sectors', companies.length)}
          {sectors.map(([name, count]) => sectorChip(name, name, count))}
        </div>
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search a company…"
          aria-label="Search companies"
          className="field w-full sm:w-64"
        />
        <label className="flex items-center gap-1.5 px-1 text-sm text-muted">
          <input type="checkbox" className="accent-ink" checked={hiringOnly} onChange={(e) => setHiringOnly(e.target.checked)} />
          Hiring for me now
        </label>
        <span className="text-sm text-faint">
          {shown.length} compan{shown.length === 1 ? 'y' : 'ies'}
        </span>
      </div>

      {shown.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((c) => (
            <li key={c.name} className="card flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-display text-base font-bold text-ink">{c.name}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className="tag tag-accent">{c.sector}</span>
                  {!c.followed && (
                    <span className="tag" title="Not on the followed list: it posted a fintech role for you this week">
                      Found this week
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted">
                  {c.open > 0 && (
                    <button type="button" onClick={() => onShowJobs(c.name, false)} className="font-semibold text-good hover:underline">
                      {c.open} role{c.open === 1 ? '' : 's'} for you →
                    </button>
                  )}
                  {c.open > 0 && c.stretch > 0 && <span className="text-faint"> · </span>}
                  {c.stretch > 0 && (
                    <button type="button" onClick={() => onShowJobs(c.name, true)} className="font-semibold text-accent hover:underline">
                      {c.stretch} stretch →
                    </button>
                  )}
                  {c.open + c.stretch === 0 && 'No matching roles this week'}
                  {c.countries.length > 0 && (
                    <span className="ml-2" title={c.countries.map((k) => countries[k]?.name ?? k).join(', ')}>
                      {c.countries.map((k) => countries[k]?.flag ?? '').join(' ')}
                    </span>
                  )}
                </p>
              </div>
              {c.url && (
                <a href={c.url} target="_blank" rel="noopener" className="btn btn-secondary shrink-0">
                  {CAREERS_HOSTS.test(c.url) ? 'Careers' : 'Website'} ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="card border-dashed border-line-strong p-8 text-center text-sm text-muted">
          No companies match.{' '}
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setSector('all')
              setHiringOnly(false)
            }}
            className="font-semibold text-accent hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </section>
  )
}
