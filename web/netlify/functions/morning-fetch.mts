import { startRun } from '../shared/workflow'

// Starts the job collection every morning at 00:37 UTC (6:07 AM India time). GitHub's own timer in collect.yml is
// only a backup: it often starts hours late, and it skips itself when this morning's run already happened.

export default async () => {
  try {
    console.log(`morning fetch: ${(await startRun()).state}`)
  } catch (e) {
    console.log(`morning fetch failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export const config = { schedule: '37 0 * * *' }
