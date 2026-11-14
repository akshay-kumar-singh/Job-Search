import { useMemo, useRef, useState } from 'react'
import type { Application, CountrySummary, Status } from '../types'
import { STATUSES } from '../types'
import { daysSince, isoDay, shortDate } from '../lib/format'

interface Props {
  apps: Record<string, Application>
  countries: CountrySummary[]
  onStatus: (id: string, status: Status) => void
  onNotes: (id: string, notes: string) => void
  onRemove: (id: string) => void
  onImport: (apps: Record<string, Application>) => void
}

const FOLLOW_UP_DAYS = 7

export default function Applications({ apps, countries, onStatus, onNotes, onRemove, onImport }: Props) {
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const [message, setMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const all = useMemo(() => Object.values(apps).sort((a, b) => b.appliedOn.localeCompare(a.appliedOn)), [apps])
  const shown = filter === 'all' ? all.filter((a) => a.status !== 'Not interested') : all.filter((a) => a.status === filter)
  const country = (key: string) => countries.find((c) => c.key === key)

  function exportFile() {
    const blob = new Blob([JSON.stringify(apps, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `job-search-applications-${isoDay()}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function importFile(file: File) {
    try {
      const data = JSON.parse(await file.text()) as Record<string, Application>
      const valid = Object.fromEntries(Object.entries(data).filter(([, a]) => a && a.id && a.status && a.job?.title))
      onImport(valid)
      setMessage(`Imported ${Object.keys(valid).length} applications.`)
    } catch {
      setMessage('That file is not an export from this app.')
    }
  }

  const tab = (value: Status | 'all', label: string, count: number) => (
    <button
      key={value}
      type="button"
      onClick={() => setFilter(value)}
      aria-pressed={filter === value}
      className={`rounded-full px-3 py-1 text-sm ${filter === value ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-400'}`}
    >
      {label} <span className="opacity-70">{count}</span>
    </button>
  )

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {tab('all', 'All', all.filter((a) => a.status !== 'Not interested').length)}
        {STATUSES.map((s) => tab(s, s, all.filter((a) => a.status === s).length))}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={exportFile} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:border-slate-500">
            Export
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:border-slate-500">
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importFile(file)
              e.target.value = ''
            }}
          />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Saved in this browser only. Use Export to back up or to move your list to another device, then Import it there.
      </p>
      {message && <p className="text-sm text-indigo-700">{message}</p>}

      {shown.length ? (
        <ul className="space-y-3">
          {shown.map((a) => {
            const c = country(a.job.country)
            const days = daysSince(a.appliedOn) ?? 0
            return (
              <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-600">
                      <span className="font-semibold text-slate-800">{a.job.company}</span>
                      {c && <> · {c.flag} {c.name}</>}
                    </p>
                    <a href={a.job.url} target="_blank" rel="noopener" className="font-semibold text-slate-900 hover:text-indigo-700 hover:underline">
                      {a.job.title}
                    </a>
                    <p className="text-sm text-slate-500">
                      {a.job.location} · {a.status === 'Not interested' ? 'Hidden' : 'Applied'} {shortDate(a.appliedOn)}
                      {a.status === 'Applied' && days >= FOLLOW_UP_DAYS && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-800">
                          Follow up — {days} days, no reply yet
                        </span>
                      )}
                    </p>
                  </div>
                  <select
                    value={a.status}
                    onChange={(e) => onStatus(a.id, e.target.value as Status)}
                    aria-label="Status"
                    className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  >
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => onRemove(a.id)} className="rounded-md px-2 py-1.5 text-sm text-slate-400 hover:text-red-600">
                    Remove
                  </button>
                </div>
                <textarea
                  defaultValue={a.notes}
                  onBlur={(e) => e.target.value !== a.notes && onNotes(a.id, e.target.value)}
                  placeholder="Notes: recruiter name, interview date, salary discussed…"
                  rows={2}
                  className="mt-3 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nothing here yet. Press “✓ Mark applied” on a job after you apply, and it shows up here.
        </div>
      )}
    </section>
  )
}
