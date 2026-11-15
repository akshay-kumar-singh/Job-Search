import { useEffect, useRef, useState } from 'react'

// "Fetch new jobs": starts the GitHub Action that collects jobs (through netlify/functions/fetch-jobs.mts), follows the
// run, then reloads the data once the new files are published.

interface RunInfo {
  status: string
  conclusion: string | null
  event: string
  created: string
  url: string
}

type Phase = 'idle' | 'starting' | 'running' | 'loading' | 'done' | 'failed' | 'recent' | 'setup' | 'error'

interface Props {
  updated: string // when the data on screen was collected; new data has a different value
  onRefresh: () => void // reload meta.json
}

const API = '/api/fetch-jobs'

const duration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function FetchNow({ updated, onRefresh }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [run, setRun] = useState<RunInfo | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [note, setNote] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const previousRun = useRef('') // created time of the latest run before ours; ours is any newer one
  const startedAt = useRef(0)
  const posting = useRef(false) // the start request is still on its way; don't mistake the previous run for ours
  const dataBefore = useRef(updated)

  // On load: is a run going already (the morning timer, or the button on another device)?
  useEffect(() => {
    fetch(API)
      .then((r) => r.json())
      .then((s: { configured?: boolean; run?: RunInfo | null }) => {
        setConfigured(Boolean(s.configured))
        if (s.run && s.run.status !== 'completed') {
          setRun(s.run)
          setPhase('running')
        }
      })
      .catch(() => setConfigured(null))
  }, [])

  // While starting or running: follow the run on GitHub.
  useEffect(() => {
    if (phase !== 'starting' && phase !== 'running') return
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1000)
    const pollTimer = window.setInterval(async () => {
      if (posting.current) return
      try {
        const s = (await (await fetch(API)).json()) as { run?: RunInfo | null }
        const r = s.run
        if (!r || (previousRun.current && r.created <= previousRun.current)) {
          if (phase === 'starting' && Date.now() - startedAt.current > 120_000) {
            setPhase('error')
            setNote("GitHub didn't start the run. Try again in a minute.")
          }
          return
        }
        setRun(r)
        if (r.status !== 'completed') setPhase('running')
        else if (r.conclusion === 'success') {
          setPhase('loading')
          onRefresh()
        } else setPhase('failed')
      } catch {
        // try again on the next tick
      }
    }, 8000)
    return () => {
      window.clearInterval(clockTimer)
      window.clearInterval(pollTimer)
    }
  }, [phase, onRefresh])

  // After the run: GitHub can take a few minutes to serve the new files, so check until they arrive.
  useEffect(() => {
    if (phase !== 'loading') return
    if (updated !== dataBefore.current) {
      setPhase('done')
      return
    }
    const retry = window.setInterval(onRefresh, 20_000)
    const giveUp = window.setTimeout(() => {
      setPhase('done')
      setNote('The new jobs can take a few more minutes to show. Reload the page in a bit.')
    }, 8 * 60_000)
    return () => {
      window.clearInterval(retry)
      window.clearTimeout(giveUp)
    }
  }, [phase, updated, onRefresh])

  useEffect(() => {
    if (phase !== 'done') return
    const t = window.setTimeout(() => setPhase('idle'), 10_000)
    return () => window.clearTimeout(t)
  }, [phase])

  async function start() {
    setNote('')
    if (configured === false) {
      setPhase('setup')
      return
    }
    setPhase('starting')
    startedAt.current = Date.now()
    dataBefore.current = updated
    posting.current = true
    try {
      const res = await fetch(API, { method: 'POST' })
      const s = (await res.json()) as {
        state?: string
        previous?: RunInfo | null
        run?: RunInfo
        retryInMinutes?: number
        error?: string
      }
      if (s.state === 'started') {
        previousRun.current = s.previous?.created ?? ''
      } else if (s.state === 'running' && s.run) {
        previousRun.current = '' // follow the run that is already going
        setRun(s.run)
        setPhase('running')
      } else if (s.state === 'recent') {
        setNote(`Jobs were fetched a few minutes ago. You can fetch again in ${s.retryInMinutes} min.`)
        setPhase('recent')
      } else if (s.state === 'not-configured') {
        setConfigured(false)
        setPhase('setup')
      } else {
        throw new Error(s.error || `the server answered ${res.status}`)
      }
    } catch (e) {
      setPhase('error')
      setNote(`Couldn't start: ${e instanceof Error ? e.message : 'no answer'}`)
    } finally {
      posting.current = false
    }
  }

  const busy = phase === 'starting' || phase === 'running' || phase === 'loading'
  const label =
    phase === 'starting'
      ? 'Starting…'
      : phase === 'running'
        ? `Fetching… ${run ? duration(now - Date.parse(run.created)) : ''}`
        : phase === 'loading'
          ? 'Loading new jobs…'
          : phase === 'done'
            ? '✓ Updated'
            : '↻ Fetch new jobs'

  return (
    <>
      <span className="flex shrink-0 items-center gap-2">
        {phase === 'failed' && run && (
          <a href={run.url} target="_blank" rel="noopener" className="text-warn hover:underline">
            Fetch failed — details ↗
          </a>
        )}
        <button
          type="button"
          onClick={start}
          disabled={busy}
          title="Collect the newest jobs now (takes 2–6 minutes)"
          className={`btn btn-secondary py-2 ${busy ? 'cursor-wait' : ''} ${phase === 'done' ? '!text-good' : ''}`}
        >
          {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
          {label}
        </button>
      </span>
      {note && <p className={`basis-full text-xs ${phase === 'error' ? 'text-warn' : 'text-muted'}`}>{note}</p>}
      {phase === 'setup' && (
        <div className="basis-full rounded-2xl bg-accent-soft p-4 text-xs leading-relaxed text-ink">
          <p className="font-display text-sm font-bold">One-time setup for this button</p>
          <p className="mt-1">
            GitHub only lets the site start the job collection with a token from you. Until then, jobs are still fetched
            automatically every morning.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>
              GitHub →{' '}
              <a className="font-semibold text-accent underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">
                new fine-grained token
              </a>
              : Repository access → <b>Only select repositories → Job-Search</b>; Permissions → <b>Actions: Read and write</b>.
              Generate it and copy it.
            </li>
            <li>
              Netlify → your site → <b>Site configuration → Environment variables → Add a variable</b>: key{' '}
              <code className="rounded bg-white px-1">GH_ACTIONS_TOKEN</code>, value: the token.
            </li>
            <li>
              Netlify → <b>Deploys → Trigger deploy → Deploy site</b>. Then this button works.
            </li>
          </ol>
          <button type="button" onClick={() => setPhase('idle')} className="mt-2 font-semibold text-accent hover:underline">
            Close
          </button>
        </div>
      )}
    </>
  )
}
