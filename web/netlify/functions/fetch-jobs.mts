import { hasToken, latestRun, startRun } from '../shared/workflow'

// The "Fetch new jobs" button. GET: how the latest collection run is going. POST: start one now.

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const STATUS = { started: 202, running: 409, recent: 429, 'not-configured': 503 } as const

export default async (req: Request) => {
  try {
    if (req.method === 'GET') return reply({ configured: hasToken(), run: await latestRun() })
    if (req.method === 'POST') {
      const result = await startRun()
      return reply({ configured: result.state !== 'not-configured', ...result }, STATUS[result.state])
    }
    return reply({ error: 'Use GET or POST' }, 405)
  } catch (e) {
    return reply({ configured: hasToken(), error: e instanceof Error ? e.message : 'GitHub did not answer' }, 502)
  }
}

export const config = { path: '/api/fetch-jobs' }
