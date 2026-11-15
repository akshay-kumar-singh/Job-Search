import type { Application, ListedJob, Status } from '../types'
import { STATUSES } from '../types'
import { ago, hostOf, isNew, matchLabel, shortDate } from '../lib/format'

interface Props {
  job: ListedJob
  places: { flag: string; name: string }[] // shown in the all-countries view
  showVisa: boolean
  tracked?: Application
  opened: boolean
  onOpen: () => void
  onNotYet: () => void
  onTrack: (status: Status) => void
  onStatus: (status: Status) => void
  onUntrack: () => void
}

function fitStyle(fit: number) {
  if (fit >= 70) return 'bg-good-soft text-good'
  if (fit >= 50) return 'bg-accent-soft text-accent'
  return 'bg-paper-subtle text-muted'
}

const VISA_TAG = { good: 'tag tag-good', warn: 'tag tag-warn', '': 'tag' }

export default function JobCard({ job, places, showVisa, tracked, opened, onOpen, onNotYet, onTrack, onStatus, onUntrack }: Props) {
  const onCompanySite = job.source === 'Company careers'
  const where = onCompanySite ? 'company site' : job.source
  const host = hostOf(job.url)
  const titleOnly = job.why.startsWith('Title match only')
  const skills = titleOnly || !job.why ? [] : job.why.split(', ')
  const posted = job.posted ? `Posted ${ago(job.posted)}` : `Found ${ago(job.found)}`

  return (
    <article className="card card-interactive p-5">
      <div className="flex items-start gap-4">
        <div
          className={`hidden h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl sm:flex ${fitStyle(job.fit)}`}
          title="Fit: how well the posting matches your skills (0-100). See How it works."
        >
          <span className="font-display text-xl font-extrabold leading-none">{job.fit}</span>
          <span className="mt-1 text-[10px] font-bold uppercase tracking-wider">{matchLabel(job.fit)}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span
              className={`rounded-full px-2 py-0.5 font-display text-xs font-extrabold sm:hidden ${fitStyle(job.fit)}`}
              title="Fit: how well the posting matches your skills (0-100). See How it works."
            >
              {job.fit} · {matchLabel(job.fit)}
            </span>
            <span className="font-display font-bold text-ink">
              {job.target && (
                <span className="text-gold" title="On your list of favourite employers">
                  ★{' '}
                </span>
              )}
              {job.company}
            </span>
            {isNew(job.found) && <span className="tag tag-accent">New</span>}
            {places.map((p) => (
              <span key={p.name} className="text-xs text-faint">
                {p.flag} {p.name}
              </span>
            ))}
          </div>
          <h3 className="mt-1 text-lg font-bold leading-snug text-ink">
            <a href={job.url} target="_blank" rel="noopener" onClick={onOpen} className="hover:text-accent">
              {job.title}
            </a>
          </h3>
          <p className="mt-1 text-sm text-muted">
            {job.location} · <span className="font-medium text-ink">{posted}</span>
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="tag">{job.years === null ? 'Experience not stated' : `${job.years}+ yrs asked`}</span>
            {job.fintech && (
              <span className="tag tag-accent">{job.sector && job.sector !== 'Fintech' ? `Fintech · ${job.sector}` : 'Fintech'}</span>
            )}
            {job.salary && <span className="tag">{job.salary}</span>}
            {showVisa && job.visa.length > 0 && <span className={VISA_TAG[job.visa_level]}>{job.visa[0]}</span>}
          </div>

          {skills.length > 0 && (
            <p className="mt-3 text-xs text-muted">
              <span className="font-semibold text-ink">Matches your skills:</span> {skills.slice(0, 6).join(', ')}
              {skills.length > 6 && ` +${skills.length - 6} more`}
            </p>
          )}
          {titleOnly && <p className="mt-3 text-xs text-muted">Matched on the job title only — this listing has no description.</p>}

          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer select-none font-semibold text-faint hover:text-ink">Details ▾</summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-line bg-paper p-3">
              <dt className="text-faint">Posted</dt>
              <dd>{job.posted ? `${shortDate(job.posted)} (${ago(job.posted)})` : 'Date not given'}</dd>
              <dt className="text-faint">First seen here</dt>
              <dd>{ago(job.found)}</dd>
              <dt className="text-faint">Source</dt>
              <dd>{onCompanySite ? "The company's own careers page" : job.source}</dd>
              <dt className="text-faint">Apply opens</dt>
              <dd className="break-all">{host || job.url}</dd>
              {skills.length > 0 && (
                <>
                  <dt className="text-faint">All matched skills</dt>
                  <dd>{skills.join(', ')}</dd>
                </>
              )}
              {showVisa && job.visa.length > 0 && (
                <>
                  <dt className="text-faint">Visa notes</dt>
                  <dd>
                    <ul className="list-disc pl-4">
                      {job.visa.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </dd>
                </>
              )}
            </dl>
          </details>
        </div>
      </div>

      {opened && !tracked && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-accent-soft px-4 py-2.5 text-sm text-ink">
          <span className="mr-auto font-medium">Did you apply on {host || where}?</span>
          <button type="button" onClick={() => onTrack('Applied')} className="btn btn-primary">
            Yes, mark applied
          </button>
          <button type="button" onClick={onNotYet} className="btn btn-ghost">
            Not yet
          </button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {tracked ? (
          <>
            <span className={`mr-auto text-sm font-semibold ${tracked.status === 'Not interested' ? 'text-faint' : 'text-good'}`}>
              {tracked.status === 'Not interested' ? 'Hidden from your lists' : `✓ Applied ${shortDate(tracked.appliedOn)}`}
            </span>
            <select
              value={tracked.status}
              onChange={(e) => onStatus(e.target.value as Status)}
              aria-label="Status"
              className="field py-1.5"
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button type="button" onClick={onUntrack} className="btn btn-ghost">
              Undo
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onTrack('Not interested')} className="btn btn-ghost mr-auto">
              Not interested
            </button>
            <button type="button" onClick={() => onTrack('Applied')} className="btn btn-secondary">
              ✓ Mark applied
            </button>
          </>
        )}
        <a
          href={job.url}
          target="_blank"
          rel="noopener"
          onClick={onOpen}
          className="btn btn-primary order-first w-full sm:order-none sm:w-auto"
        >
          Apply on {where} ↗
        </a>
      </div>
    </article>
  )
}
