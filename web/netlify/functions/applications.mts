import { getStore } from '@netlify/blobs'
import { cleanState, EMPTY, mergeState } from '../../src/lib/sync'

// Saves your list of applications online, so every device you link shows the same list.
// The browser sends its copy with its secret key; this merges it with the saved copy (newest change wins for each job)
// and returns the result. Lists are stored in Netlify Blobs under a hash of the key, never the key itself.

const KEY = /^[A-Za-z0-9_-]{32,128}$/
const MAX_BODY = 1_000_000

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

async function hash(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

export default async (req: Request) => {
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405)
  const key = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!KEY.test(key)) return reply({ error: 'Missing or invalid sync key' }, 401)
  const body = await req.text()
  if (body.length > MAX_BODY) return reply({ error: 'Too much data' }, 413)
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return reply({ error: 'Not JSON' }, 400)
  }
  const incoming = cleanState(parsed)
  if (!incoming) return reply({ error: 'Not a list of applications' }, 400)

  const store = getStore({ name: 'applications', consistency: 'strong' })
  const id = await hash(key)
  // Another device may save at the same moment: the write only succeeds if nobody changed the list since we read it.
  for (let attempt = 0; attempt < 5; attempt++) {
    const saved = await store.getWithMetadata(id, { type: 'json' })
    const current = (saved && cleanState(saved.data)) || EMPTY
    const merged = mergeState(current, incoming)
    if (saved && JSON.stringify(merged) === JSON.stringify(current)) return reply(merged) // nothing new to save
    const result = await store.setJSON(id, merged, saved?.etag ? { onlyIfMatch: saved.etag } : { onlyIfNew: true })
    if (result.modified) return reply(merged)
  }
  return reply({ error: 'Busy, try again' }, 409)
}

export const config = { path: '/api/applications' }
