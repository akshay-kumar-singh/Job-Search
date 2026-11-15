import { useMemo, useRef, useState } from 'react'
import type { Application, CountrySummary, Status } from '../types'
import { STATUSES } from '../types'
import { daysSince, isoDay, shortDate } from '../lib/format'
import type { SyncStatus } from '../lib/storage'
import { cleanState } from '../lib/sync'
import { scrollToTop, usePaged } from '../lib/paging'
import Pagination from './Pagination'

interface Props {
  apps: Record<string, Application>
  sync: SyncStatus
  deviceLink: string // opens this same list on another device
  countries: CountrySummary[]
  onStatus: (id: string, status: Status) => void
  onNotes: (id: string, notes: string) => void
  onRemove: (id: string) => void
  onImport: (apps: Record<string, Application>) => void
}

const FOLLOW_UP_DAYS = 7

const SYNC_TEXT: Record<SyncStatus, string> = {
  saving: 'Saving online…',
  saved: '✓ Saved online — safe if you refresh or clear this browser, and the same on every device you link',
  offline: "Couldn't reach the server — your list is kept in this browser and will be saved online when it can",
}

export default function Applications({ apps, sync, deviceLink, countries, onStatus, onNotes, onRemove, onImport }: Props) {
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const [message, setMessage] = useState('')
  const [showLink, setShowLink] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const all = useMemo(() => Object.values(apps).sort((a, b) => b.appliedOn.localeCompare(a.appliedOn)), [apps])
  const shown = filter === 'all' ? all.filter((a) => a.status !== 'Not interested') : all.filter((a) => a.status === filter)
  const paged = usePaged(shown, filter)
  const listTop = useRef<HTMLDivElement>(null)
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
      const valid = cleanState({ apps: JSON.parse(await file.text()) })?.apps ?? {}
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
      <div ref={listTop} className="flex scroll-mt-4 flex-wrap items-center gap-2">
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
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
        <span className={`mr-auto ${sync === 'offline' ? 'text-warn' : sync === 'saved' ? 'text-good' : 'text-muted'}`}>
          {SYNC_TEXT[sync]}
        </span>
        <button type="button" onClick={() => setShowLink((v) => !v)} aria-expanded={showLink} className="font-semibold text-accent hover:underline">
          Use on another device {showLink ? '▴' : '▾'}
        </button>
      </div>
      {showLink && (
        <div className="card p-5 text-sm">
          <p className="font-display text-base font-bold text-ink">Open this link once on your phone or another browser</p>
          <p className="mt-1 leading-relaxed text-muted">
            It connects that device to this same list. Keep it private: anyone with the link can see and change your list.
            Save it in your notes too: if you ever clear this browser, opening it brings everything back.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              readOnly
              value={deviceLink}
              onFocus={(e) => e.target.select()}
              aria-label="Your private link"
              className="field min-w-0 flex-1 font-mono text-xs"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                navigator.clipboard?.writeText(deviceLink).then(
                  () => setCopied(true),
                  () => setCopied(false),
                )
              }
            >
              {copied ? 'Copied ✓' : 'Copy link'}
            </button>
            {typeof navigator.share === 'function' && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigator.share({ title: 'My job applications', url: deviceLink }).catch(() => {})}
              >
                Share…
              </button>
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-faint">
        Jobs you marked applied stay here for good, even after they leave the job lists. Export downloads a copy as a file.
      </p>
      {message && <p className="text-sm font-semibold text-accent">{message}</p>}

      {shown.length ? (
        <ul className="space-y-4">
          {paged.items.map((a) => {
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
                  key={a.updatedAt ?? a.appliedOn} // shows notes changed on another device
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
      ) : null}
      {shown.length > 0 && (
        <Pagination
          page={paged.page}
          pages={paged.pages}
          onPage={(page) => {
            paged.setPage(page)
            scrollToTop(listTop.current)
          }}
        />
      )}
      {shown.length ? null : (
        <div className="card border-dashed border-line-strong p-10 text-center text-sm text-muted">
          Nothing here yet. After you apply, press “✓ Mark applied” (or “Yes, mark applied” when you come back from a job's
          page) and it shows up here.
        </div>
      )}
    </section>
  )
}
