// Starts the "Collect jobs" GitHub Action and reads how its latest run is going. Used by the website's
// "Fetch new jobs" button (functions/fetch-jobs.mts) and the morning timer (functions/morning-fetch.mts).
//
// GitHub only lets a request start a workflow with a token, so this needs GH_ACTIONS_TOKEN in Netlify's environment
// variables: a fine-grained GitHub token for this repository with the permission "Actions: Read and write".

declare const Netlify: { env: { get(name: string): string | undefined } }

const WORKFLOW_API = 'https://api.github.com/repos/akshay-kumar-singh/Job-Search/actions/workflows/collect.yml'
const COOLDOWN_MINUTES = 15 // at most one run per 15 minutes, however often the button is pressed

export interface RunInfo {
  status: string // queued, in_progress, completed, ...
  conclusion: string | null // success, failure, ... once completed
  event: string // schedule or workflow_dispatch
  created: string
  url: string // the run's page on GitHub
}

export type StartResult =
  | { state: 'started'; previous: RunInfo | null }
  | { state: 'running'; run: RunInfo }
  | { state: 'recent'; run: RunInfo; retryInMinutes: number }
  | { state: 'not-configured' }

export const hasToken = () => Boolean(Netlify.env.get('GH_ACTIONS_TOKEN'))

function github(path: string, init: { method?: string; body?: string } = {}) {
  const token = Netlify.env.get('GH_ACTIONS_TOKEN')
  return fetch(WORKFLOW_API + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'job-search-site',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}

export async function latestRun(): Promise<RunInfo | null> {
  const res = await github('/runs?per_page=1')
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  const run = ((await res.json()) as { workflow_runs?: Record<string, string | null>[] }).workflow_runs?.[0]
  return run
    ? { status: String(run.status), conclusion: run.conclusion, event: String(run.event), created: String(run.created_at), url: String(run.html_url) }
    : null
}

export async function startRun(): Promise<StartResult> {
  if (!hasToken()) return { state: 'not-configured' }
  const run = await latestRun()
  if (run && run.status !== 'completed') return { state: 'running', run }
  const minutes = run ? (Date.now() - Date.parse(run.created)) / 60_000 : Infinity
  if (run && minutes < COOLDOWN_MINUTES) return { state: 'recent', run, retryInMinutes: Math.ceil(COOLDOWN_MINUTES - minutes) }
  const res = await github('/dispatches', { method: 'POST', body: JSON.stringify({ ref: 'main' }) })
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 || res.status === 404 ? 'GitHub refused the token' : `GitHub answered ${res.status}`)
  return { state: 'started', previous: run }
}
