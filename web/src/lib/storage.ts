import { useCallback, useEffect, useRef, useState } from 'react'
import type { Application, Job, Status } from '../types'
import { isoDay } from './format'
import { cleanState, EMPTY, mergeState, type SyncState } from './sync'

const APPS_KEY = 'job-search:applications:v1'
const REMOVED_KEY = 'job-search:removed:v1'
const SYNC_KEY = 'job-search:sync-key:v1'
const SYNC_URL = '/api/applications'
const KEY = /^[A-Za-z0-9_-]{32,128}$/

/** saving: talking to the server; saved: the online copy matches; offline: only in this browser for now (retries). */
export type SyncStatus = 'saving' | 'saved' | 'offline'

function readLocal(): SyncState {
  try {
    const apps = JSON.parse(localStorage.getItem(APPS_KEY) || '{}')
    const deleted = JSON.parse(localStorage.getItem(REMOVED_KEY) || '{}')
    return cleanState({ apps, deleted }) ?? EMPTY
  } catch {
    return EMPTY
  }
}

function writeLocal(state: SyncState) {
  try {
    localStorage.setItem(APPS_KEY, JSON.stringify(state.apps))
    localStorage.setItem(REMOVED_KEY, JSON.stringify(state.deleted))
  } catch {
    // private browsing or storage full: the online copy still has it
  }
}

function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The secret that links this browser to its online list. Opening a "#sync=…" link from another device switches to
 *  that device's list (this browser's own entries are merged into it on the next save). */
function readSyncKey(): string {
  const fromLink = location.hash.match(/[#&]sync=([A-Za-z0-9_-]{32,128})/)?.[1]
  if (fromLink) history.replaceState(null, '', location.pathname + location.search) // keep the secret out of the address bar
  try {
    const saved = localStorage.getItem(SYNC_KEY) ?? ''
    const key = fromLink || (KEY.test(saved) ? saved : newKey())
    localStorage.setItem(SYNC_KEY, key)
    return key
  } catch {
    return fromLink || newKey()
  }
}

const now = () => new Date().toISOString()

/** Jobs you acted on, with status and notes. Saved in this browser and online (Netlify), so a refresh, a cleared
 *  browser or another linked device shows the same list. */
export function useApplications() {
  const [state, setState] = useState<SyncState>(readLocal)
  const [sync, setSync] = useState<SyncStatus>('saving')
  const [key] = useState(readSyncKey)
  const latest = useRef(state)
  const busy = useRef(false)
  const again = useRef(false)
  const lastSync = useRef(0)
  const saveTimer = useRef(0)
  const retryTimer = useRef(0)

  useEffect(() => {
    latest.current = state
  }, [state])

  // Sends this browser's copy and takes back the merged one (which includes changes made on other devices).
  const push = useCallback(async () => {
    if (busy.current) {
      again.current = true
      return
    }
    busy.current = true
    window.clearTimeout(retryTimer.current)
    setSync('saving')
    try {
      const res = await fetch(SYNC_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(latest.current),
      })
      const online = res.ok ? cleanState(await res.json()) : null
      if (!online) throw new Error(`HTTP ${res.status}`)
      setState((prev) => {
        const next = mergeState(prev, online) // anything changed here meanwhile is newer, so it is kept
        writeLocal(next)
        return next
      })
      lastSync.current = Date.now()
      setSync('saved')
    } catch {
      setSync('offline')
      retryTimer.current = window.setTimeout(() => void push(), 30_000)
    } finally {
      busy.current = false
      if (again.current) {
        again.current = false
        void push()
      }
    }
  }, [key])

  useEffect(() => {
    void push()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastSync.current > 10_000) void push()
    }
    const onOnline = () => void push()
    const onStorage = (e: StorageEvent) => {
      if (e.key === APPS_KEY || e.key === REMOVED_KEY) setState(readLocal())
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('storage', onStorage)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('storage', onStorage)
      window.clearTimeout(saveTimer.current)
      window.clearTimeout(retryTimer.current)
    }
  }, [push])

  const change = useCallback(
    (fn: (prev: SyncState) => SyncState) => {
      setState((prev) => {
        const next = fn(prev)
        writeLocal(next)
        return next
      })
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => void push(), 800)
    },
    [push],
  )

  const track = useCallback(
    (job: Job, country: string, status: Status = 'Applied') =>
      change((prev) => {
        const deleted = { ...prev.deleted }
        delete deleted[job.id]
        const app: Application = {
          id: job.id,
          status,
          appliedOn: isoDay(),
          notes: prev.apps[job.id]?.notes ?? '',
          updatedAt: now(),
          job: { company: job.company, title: job.title, location: job.location, url: job.url, country },
        }
        return { apps: { ...prev.apps, [job.id]: app }, deleted }
      }),
    [change],
  )

  const update = useCallback(
    (id: string, patch: Partial<Pick<Application, 'status' | 'notes'>>) =>
      change((prev) =>
        prev.apps[id] ? { ...prev, apps: { ...prev.apps, [id]: { ...prev.apps[id], ...patch, updatedAt: now() } } } : prev,
      ),
    [change],
  )

  const remove = useCallback(
    (id: string) =>
      change((prev) => {
        if (!prev.apps[id]) return prev
        const apps = { ...prev.apps }
        delete apps[id]
        return { apps, deleted: { ...prev.deleted, [id]: now() } }
      }),
    [change],
  )

  const importApps = useCallback(
    (incoming: Record<string, Application>) =>
      change((prev) => {
        const stamp = now()
        const apps = { ...prev.apps }
        const deleted = { ...prev.deleted }
        for (const [id, app] of Object.entries(incoming)) {
          apps[id] = { ...app, updatedAt: stamp }
          delete deleted[id]
        }
        return { apps, deleted }
      }),
    [change],
  )

  const deviceLink = `${location.origin}${location.pathname}#sync=${key}`
  return { apps: state.apps, track, update, remove, importApps, sync, deviceLink }
}

/** A small UI preference (selected country, filters) remembered in this browser. */
export function usePref<T>(key: string, initial: T) {
  const fullKey = `job-search:pref:${key}`
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(fullKey)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (next: T) => {
      setValue(next)
      try {
        localStorage.setItem(fullKey, JSON.stringify(next))
      } catch {
        // ignore: the preference just won't be remembered
      }
    },
    [fullKey],
  )
  return [value, set] as const
}
