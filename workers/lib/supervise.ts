/**
 * Keeps one poll loop alive without letting it take the process down.
 *
 * The Railway service runs the video, playbook and analysis workers in a
 * SINGLE process (workers/index.ts). Each used to end with
 * `main().catch(() => process.exit(1))`, which meant a fatal error in any one
 * of them killed the other two: a video worker that died on a bad file also
 * stopped every queued analysis, silently. Railway's restart policy then gave
 * up after its retry budget, so a coach who queued a batch and closed their
 * laptop came back to nothing having run.
 *
 * A crashed loop is restarted here instead, with backoff, and the other loops
 * in the process keep working throughout. Restarting forever is deliberate:
 * for a queue worker, "keep trying" is always better than "exit and stay
 * exited", and the errors are logged every time so the cause stays visible.
 */

const INITIAL_RESTART_DELAY_MS = 2_000
const MAX_RESTART_DELAY_MS = 60_000

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function supervise(
  name: string,
  main: () => Promise<void>,
  log: (msg: string, extra?: unknown) => void
): Promise<void> {
  let delay = INITIAL_RESTART_DELAY_MS
  let crashes = 0

  for (;;) {
    try {
      await main()
      // A clean return means the loop was asked to shut down.
      return
    } catch (err) {
      crashes++
      log(
        `${name} crashed (${crashes} time${crashes === 1 ? '' : 's'}) — restarting in ${Math.round(
          delay / 1000
        )}s`,
        err instanceof Error ? (err.stack ?? err.message) : err
      )
      await sleep(delay)
      delay = Math.min(delay * 2, MAX_RESTART_DELAY_MS)
    }
  }
}
