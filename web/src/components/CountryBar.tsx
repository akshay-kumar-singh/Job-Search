import { useEffect, useId, useState } from 'react'
import type { CountrySummary } from '../types'

interface Props {
  all: CountrySummary
  countries: CountrySummary[]
  selected: string
  onSelect: (key: string) => void
}

// Regions in the order they are listed; config groups not named here go under "Other".
const REGIONS: [string, string[]][] = [
  ['India & remote', ['Home', 'Remote']],
  ['Middle East', ['Middle East']],
  ['Europe', ['Europe']],
  ['Asia-Pacific', ['Asia-Pacific']],
  ['North America', ['North America']],
]

const summary = (c: CountrySummary) =>
  [`${c.count} job${c.count === 1 ? '' : 's'}`, c.stretch ? `${c.stretch} stretch` : '', c.new ? `+${c.new} new today` : '']
    .filter(Boolean)
    .join(' · ')

/** The country picker, closed by default: one row with the chosen country that opens into every country by region. */
export default function CountryBar({ all, countries, selected, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const current = selected === 'all' ? all : (countries.find((c) => c.key === selected) ?? all)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const named = new Set(REGIONS.flatMap(([, groups]) => groups))
  const regions = [...REGIONS, ['Other', []] as [string, string[]]]
    .map(([label, groups]) => {
      const list = countries
        .filter((c) => (label === 'Other' ? !named.has(c.group) : groups.includes(c.group)))
        .sort((a, b) => b.count + b.stretch - (a.count + a.stretch) || a.name.localeCompare(b.name))
      return [label, label === 'India & remote' ? [all, ...list] : list] as const
    })
    .filter(([, list]) => list.length > 0)

  const pick = (key: string) => {
    onSelect(key)
    setOpen(false)
  }

  const chip = (c: CountrySummary) => {
    const active = c.key === selected
    const hasJobs = c.count + c.stretch > 0
    return (
      <button
        key={c.key}
        type="button"
        onClick={() => pick(c.key)}
        aria-pressed={active}
        title={summary(c)}
        className={`chip ${hasJobs || active ? '' : 'chip-empty'}`}
      >
        <span aria-hidden>{c.flag}</span>
        <span>{c.name}</span>
        <span className={`rounded-full px-1.5 text-xs font-semibold ${active ? 'bg-white/15 text-white' : 'bg-paper-subtle text-muted'}`}>
          {c.count}
        </span>
        {c.new > 0 && (
          <span className={`hidden text-xs font-bold sm:inline ${active ? 'text-gold-light' : 'text-accent'}`}>+{c.new} new</span>
        )}
      </button>
    )
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="text-2xl leading-none" aria-hidden>
            {current.flag}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-base font-bold text-ink">{current.name}</span>
            <span className="block truncate text-xs text-muted">
              {current.count} job{current.count === 1 ? '' : 's'}
              {current.stretch > 0 && <span className="hidden sm:inline"> · {current.stretch} stretch</span>}
              {current.new > 0 && <span className="font-semibold text-accent"> · +{current.new} new today</span>}
            </span>
          </span>
          <span className="shrink-0 rounded-full px-3 py-1.5 font-display text-sm font-bold text-ink shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]">
            {open ? 'Close ▴' : 'Country ▾'}
          </span>
        </button>
        {selected !== 'all' && !open && (
          <button
            type="button"
            onClick={() => onSelect('all')}
            aria-label="Show all countries"
            title="Show all countries"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-paper-subtle hover:text-ink"
          >
            ✕
          </button>
        )}
      </div>

      <div
        id={panelId}
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div inert={!open} className="space-y-4 border-t border-line px-4 py-4 sm:px-5">
            {regions.map(([label, list]) => (
              <div key={label}>
                <p className="mb-2 font-display text-xs font-bold uppercase tracking-[0.14em] text-faint">{label}</p>
                <div className="flex flex-wrap gap-2">{list.map(chip)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
