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
    <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className="chip">
      {label} <span className={filter === value ? 'text-white/70' : 'text-faint'}>{count}</span>
    </button>
  )

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {tab('all', 'All', all.filter((a) => a.status !== 'Not interested').length)}
        {STATUSES.map((s) => tab(s, s, all.filter((a) => a.status === s).length))}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={exportFile} className="btn btn-secondary">
            Export
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} className="btn btn-secondary">
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
      <p className="text-xs text-faint">
        Jobs you marked applied stay here for good, even after they leave the job lists. Saved in this browser only — use
        Export to back up or to move your list to another device, then Import it there.
      </p>
      {message && <p className="text-sm font-semibold text-accent">{message}</p>}

      {shown.length ? (
        <ul className="space-y-4">
          {shown.map((a) => {
            const c = country(a.job.country)
            const days = daysSince(a.appliedOn) ?? 0
            return (
              <li key={a.id} className="card p-5">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-muted">
                      <span className="font-display font-bold text-ink">{a.job.company}</span>
                      {c && (
                        <span className="text-faint">
                          {' '}
                          · {c.flag} {c.name}
                        </span>
                      )}
                    </p>
                    <a href={a.job.url} target="_blank" rel="noopener" className="font-display text-lg font-bold text-ink hover:text-accent">
                      {a.job.title}
                    </a>
                    <p className="mt-0.5 text-sm text-muted">
                      {a.job.location} · {a.status === 'Not interested' ? 'Hidden' : 'Applied'} {shortDate(a.appliedOn)}
                      {a.status === 'Applied' && days >= FOLLOW_UP_DAYS && (
                        <span className="tag tag-warn ml-2">Follow up — {days} days, no reply yet</span>
                      )}
                    </p>
                  </div>
                  <select
                    value={a.status}
                    onChange={(e) => onStatus(a.id, e.target.value as Status)}
                    aria-label="Status"
                    className="field py-1.5"
                  >
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => onRemove(a.id)} className="btn btn-ghost hover:!text-warn">
                    Remove
                  </button>
                </div>
                <textarea
                  defaultValue={a.notes}
                  onBlur={(e) => e.target.value !== a.notes && onNotes(a.id, e.target.value)}
                  placeholder="Notes: recruiter name, interview date, salary discussed…"
                  rows={2}
                  className="field mt-3 w-full"
                />
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="card border-dashed border-line-strong p-10 text-center text-sm text-muted">
          Nothing here yet. After you apply, press “✓ Mark applied” (or “Yes, mark applied” when you come back from a job's
          page) and it shows up here.
        </div>
      )}
    </section>
  )
}
