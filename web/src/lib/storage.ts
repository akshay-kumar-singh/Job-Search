import { useCallback, useEffect, useState } from 'react'
import type { Application, Job, Status } from '../types'
import { isoDay } from './format'

const APPS_KEY = 'job-search:applications:v1'
type Apps = Record<string, Application>

function readApps(): Apps {
  try {
    const raw = localStorage.getItem(APPS_KEY)
    return raw ? (JSON.parse(raw) as Apps) : {}
  } catch {
    return {}
  }
}

function writeApps(apps: Apps) {
  try {
    localStorage.setItem(APPS_KEY, JSON.stringify(apps))
  } catch {
    // private browsing or storage full: the change still shows until the page reloads
  }
}

/** Jobs you applied to, with status and notes, saved in this browser. */
export function useApplications() {
  const [apps, setApps] = useState<Apps>(readApps)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === APPS_KEY) setApps(readApps())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const change = useCallback((fn: (prev: Apps) => Apps) => {
    setApps((prev) => {
      const next = fn(prev)
      writeApps(next)
      return next
    })
  }, [])

  const track = useCallback(
    (job: Job, country: string, status: Status = 'Applied') =>
      change((prev) => ({
        ...prev,
        [job.id]: {
          id: job.id,
          status,
          appliedOn: isoDay(),
          notes: prev[job.id]?.notes ?? '',
          job: { company: job.company, title: job.title, location: job.location, url: job.url, country },
        },
      })),
    [change],
  )

  const update = useCallback(
    (id: string, patch: Partial<Pick<Application, 'status' | 'notes'>>) =>
      change((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev)),
    [change],
  )

  const remove = useCallback(
    (id: string) =>
      change((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      }),
    [change],
  )

  const importApps = useCallback((incoming: Apps) => change((prev) => ({ ...prev, ...incoming })), [change])

  return { apps, track, update, remove, importApps }
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
