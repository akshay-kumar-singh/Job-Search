import type { Application, Status } from '../types'
import { STATUSES } from '../types'

// The list of jobs you acted on, as it is saved online (by netlify/functions/applications.mts) and in each browser.
// Shared by the browser and the function, so both merge copies the same way.

export interface SyncState {
  apps: Record<string, Application>
  /** id -> when it was removed (ISO time), so a removal on one device also reaches the others */
  deleted: Record<string, string>
}

export const EMPTY: SyncState = { apps: {}, deleted: {} }

const KEEP_REMOVALS_DAYS = 180
const MAX_ITEMS = 5000
const ID = /^[^\s]{1,300}$/
const TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z)?$/

/** When an application last changed; ones saved before changes were timed count from the day they were applied. */
export const changedAt = (a: Application) => a.updatedAt || `${a.appliedOn}T00:00:00.000Z`

/** Combines two copies (this browser's and the online one): for every job the newest change wins,
 *  whether that change was an edit or a removal. */
export function mergeState(a: SyncState, b: SyncState, now = Date.now()): SyncState {
  const out: SyncState = { apps: {}, deleted: {} }
  const forgetBefore = new Date(now - KEEP_REMOVALS_DAYS * 86_400_000).toISOString()
  const ids = new Set([...Object.keys(a.apps), ...Object.keys(b.apps), ...Object.keys(a.deleted), ...Object.keys(b.deleted)])
  for (const id of ids) {
    const x = a.apps[id]
    const y = b.apps[id]
    const app = x && y ? (changedAt(y) > changedAt(x) ? y : x) : (x ?? y)
    const removed = [a.deleted[id], b.deleted[id]].filter(Boolean).sort().pop()
    if (removed && (!app || removed >= changedAt(app))) {
      if (removed > forgetBefore) out.deleted[id] = removed
    } else if (app) {
      out.apps[id] = app
    }
  }
  return out
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '')

function cleanApp(id: string, value: unknown): Application | null {
  if (!value || typeof value !== 'object') return null
  const a = value as Record<string, unknown>
  const job = a.job && typeof a.job === 'object' ? (a.job as Record<string, unknown>) : null
  if (!job || !STATUSES.includes(a.status as Status) || typeof a.appliedOn !== 'string' || !TIME.test(a.appliedOn)) return null
  return {
    id,
    status: a.status as Status,
    appliedOn: a.appliedOn.slice(0, 10),
    notes: text(a.notes, 5000),
    ...(typeof a.updatedAt === 'string' && TIME.test(a.updatedAt) ? { updatedAt: a.updatedAt } : {}),
    job: {
      company: text(job.company, 200),
      title: text(job.title, 300),
      location: text(job.location, 300),
      url: text(job.url, 2000),
      country: text(job.country, 20),
    },
  }
}

/** A copy of an untrusted list (a request, an imported file, old browser data) keeping only well-formed entries;
 *  null if it isn't a list at all. */
export function cleanState(value: unknown): SyncState | null {
  if (!value || typeof value !== 'object') return null
  const { apps, deleted } = value as { apps?: unknown; deleted?: unknown }
  if (!apps || typeof apps !== 'object' || (deleted != null && typeof deleted !== 'object')) return null
  const out: SyncState = { apps: {}, deleted: {} }
  for (const [id, app] of Object.entries(apps).slice(0, MAX_ITEMS)) {
    const clean = ID.test(id) ? cleanApp(id, app) : null
    if (clean) out.apps[id] = clean
  }
  for (const [id, when] of Object.entries(deleted ?? {}).slice(0, MAX_ITEMS)) {
    if (ID.test(id) && typeof when === 'string' && TIME.test(when)) out.deleted[id] = when
  }
  return out
}
