import type { CountrySummary } from '../types'

interface Props {
  countries: CountrySummary[]
  selected: string
  onSelect: (key: string) => void
}

export default function CountryPicker({ countries, selected, onSelect }: Props) {
  const groups = [...new Set(countries.map((c) => c.group))]
  return (
    <nav aria-label="Countries" className="space-y-3">
      {groups.map((group) => (
        <div key={group}>
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{group}</h2>
          <div className="flex flex-wrap gap-2">
            {countries
              .filter((c) => c.group === group)
              .map((c) => {
                const active = c.key === selected
                const total = c.count + c.stretch
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => onSelect(c.key)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                      active
                        ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                        : total
                          ? 'border-slate-300 bg-white text-slate-700 hover:border-indigo-400'
                          : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <span aria-hidden>{c.flag}</span>
                    <span>{c.name}</span>
                    <span className={`rounded-full px-1.5 text-xs font-semibold ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>
                      {c.count}
                    </span>
                    {c.new > 0 && (
                      <span className={`text-xs font-semibold ${active ? 'text-indigo-100' : 'text-emerald-600'}`}>
                        +{c.new} new
                      </span>
                    )}
                  </button>
                )
              })}
          </div>
        </div>
      ))}
    </nav>
  )
}
