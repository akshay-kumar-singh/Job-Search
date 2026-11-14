import type { Application, Job, Status } from '../types'
import { STATUSES } from '../types'
import { ago, isNew, shortDate } from '../lib/format'

interface Props {
  job: Job
  showVisa: boolean
  tracked?: Application
  onTrack: (status: Status) => void
  onStatus: (status: Status) => void
  onUntrack: () => void
}

function fitStyle(fit: number) {
  if (fit >= 70) return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (fit >= 50) return 'bg-amber-50 text-amber-700 ring-amber-200'
  return 'bg-slate-100 text-slate-600 ring-slate-200'
}

const VISA_STYLE = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  '': 'bg-slate-100 text-slate-600 ring-slate-200',
}

export default function JobCard({ job, showVisa, tracked, onTrack, onStatus, onUntrack }: Props) {
  const chip = 'rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset'
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg ring-1 ring-inset ${fitStyle(job.fit)}`}
          title="How well the posting matches your skills (0-100)"
        >
          <span className="text-lg font-bold leading-none">{job.fit}</span>
          <span className="text-[10px] uppercase">fit</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
            <span className="font-semibold text-slate-800">
              {job.target && <span title="On your target list">★ </span>}
              {job.company}
            </span>
            {isNew(job.found) && <span className="rounded bg-indigo-50 px-1.5 text-xs font-semibold text-indigo-700">New</span>}
          </div>
          <h3 className="mt-0.5 text-base font-semibold leading-snug text-slate-900">
            <a href={job.url} target="_blank" rel="noopener" className="hover:text-indigo-700 hover:underline">
              {job.title}
            </a>
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {job.location}
            {job.posted && <> · Posted {ago(job.posted)}</>}
            {' · '}via {job.source}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={`${chip} bg-slate-50 text-slate-700 ring-slate-200`}>
              {job.years === null ? 'Experience not stated' : `${job.years}+ yrs asked`}
            </span>
            {job.salary && <span className={`${chip} bg-slate-50 text-slate-700 ring-slate-200`}>{job.salary}</span>}
            {showVisa && job.visa.length > 0 && (
              <span className={`${chip} ${VISA_STYLE[job.visa_level]}`} title={job.visa.join('\n')}>
                {job.visa[0]}
                {job.visa.length > 1 && ` +${job.visa.length - 1}`}
              </span>
            )}
          </div>

          {job.why && (
            <p className="mt-2 text-xs text-slate-500">
              <span className="font-medium text-slate-600">Matched:</span> {job.why}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
        {tracked ? (
          <>
            <span className="mr-auto text-sm text-slate-500">
              {tracked.status === 'Not interested' ? 'Hidden' : `Applied ${shortDate(tracked.appliedOn)}`}
            </span>
            <select
              value={tracked.status}
              onChange={(e) => onStatus(e.target.value as Status)}
              aria-label="Status"
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button type="button" onClick={onUntrack} className="rounded-md px-2 py-1.5 text-sm text-slate-500 hover:text-slate-800">
              Undo
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onTrack('Not interested')}
              className="mr-auto rounded-md px-2 py-1.5 text-sm text-slate-500 hover:text-slate-800"
            >
              Not interested
            </button>
            <button
              type="button"
              onClick={() => onTrack('Applied')}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-emerald-500 hover:text-emerald-700"
            >
              ✓ Mark applied
            </button>
          </>
        )}
        <a
          href={job.url}
          target="_blank"
          rel="noopener"
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          Apply ↗
        </a>
      </div>
    </article>
  )
}
