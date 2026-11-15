import type { CountrySummary } from '../types'
import { usePref } from '../lib/storage'

interface Props {
  all: CountrySummary
  countries: CountrySummary[]
  selected: string
  onSelect: (key: string) => void
}

const HOME = ['in', 'remote']

/** One row of country chips: All, India, Remote, then countries with jobs (most first). Countries with no jobs right now
 *  fold behind a "+N more" chip. Scrolls sideways on a phone, wraps on a wider screen. */
export default function CountryBar({ all, countries, selected, onSelect }: Props) {
  const [showEmpty, setShowEmpty] = usePref('show-empty-countries', false)
  const home = HOME.map((k) => countries.find((c) => c.key === k)).filter((c): c is CountrySummary => Boolean(c))
  const rest = countries.filter((c) => !HOME.includes(c.key))
  const withJobs = rest.filter((c) => c.count + c.stretch > 0).sort((a, b) => b.count - a.count || b.stretch - a.stretch)
  const allEmpty = rest.filter((c) => c.count + c.stretch === 0)
  const empty = showEmpty ? allEmpty : allEmpty.filter((c) => c.key === selected) // the selected one always shows
  const folded = allEmpty.length - empty.length

  return (
    <nav aria-label="Countries" className="no-scrollbar -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:overflow-visible sm:px-0">
      <div className="flex gap-2 sm:flex-wrap">
        {[all, ...home, ...withJobs, ...empty].map((c) => {
          const active = c.key === selected
          const hasJobs = c.count + c.stretch > 0
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onSelect(c.key)}
              aria-pressed={active}
              title={`${c.count} jobs · ${c.stretch} stretch · ${c.new} new today`}
              className={`chip ${hasJobs || active ? '' : 'chip-empty'}`}
            >
              <span aria-hidden>{c.flag}</span>
              <span>{c.name}</span>
              <span
                className={`rounded-full px-1.5 text-xs font-semibold ${active ? 'bg-white/15 text-white' : 'bg-paper-subtle text-muted'}`}
              >
                {c.count}
              </span>
              {c.new > 0 && (
                <span className={`text-xs font-bold ${active ? 'text-gold-light' : 'text-accent'}`}>+{c.new} new</span>
              )}
            </button>
          )
        })}
        {(folded > 0 || (showEmpty && allEmpty.length > 0)) && (
          <button
            type="button"
            onClick={() => setShowEmpty(!showEmpty)}
            title="Countries with no fresh jobs right now"
            className="chip chip-empty"
          >
            {showEmpty ? 'Show fewer' : `+${folded} more`}
          </button>
        )}
      </div>
    </nav>
  )
}
