import type { Job, Meta } from '../types'

// The collector publishes JSON to the `data` branch; the app reads it straight from GitHub.
// Set VITE_DATA_URL to read from somewhere else (for example a local folder during development).
const DEFAULT_DATA_URL = 'https://raw.githubusercontent.com/akshay-kumar-singh/Job-Search/data'
export const DATA_URL = (import.meta.env.VITE_DATA_URL || DEFAULT_DATA_URL).replace(/\/$/, '')

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${DATA_URL}/${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(res.status === 404 ? 'No data yet' : `Could not load ${path} (HTTP ${res.status})`)
  return (await res.json()) as T
}

export const fetchMeta = () => getJSON<Meta>('meta.json')

export async function fetchJobs(key: string, version: string): Promise<Job[]> {
  const data = await getJSON<{ jobs: Job[] }>(`jobs/${key}.json?v=${encodeURIComponent(version)}`)
  return data.jobs
}
