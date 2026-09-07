/**
 * Works out what an interrupted import still has to pull.
 *
 * The first real import got through 18 clips and then stopped — a Railway
 * rebuild killed the container mid-job. Re-running it would have re-downloaded
 * all 18, created duplicate `videos` rows, and queued 18 more frame-extraction
 * jobs, because `runImport` always started at clip 1. An import that cannot be
 * resumed is one a coach can only run when nothing goes wrong.
 *
 * Pure on purpose: the ids come from a query the caller already makes, so the
 * decision itself needs no database, no browser and no network to test.
 */
import type { HudlClipCandidate } from './hudl-playlist'

/** How a clip's origin is recorded on the `videos` row it becomes. */
export const CLIP_SOURCE_PREFIX = 'hudl:clip:'

export function clipSourceUrl(clipId: string): string {
  return `${CLIP_SOURCE_PREFIX}${clipId}`
}

/**
 * Reads clip ids back out of the `source_url` values already on file.
 *
 * Anything not carrying the prefix is ignored rather than guessed at — a
 * `hudl_link` row from some other path is not evidence about this playlist.
 */
export function importedClipIds(sourceUrls: (string | null | undefined)[]): Set<string> {
  const ids = new Set<string>()
  for (const url of sourceUrls) {
    if (!url?.startsWith(CLIP_SOURCE_PREFIX)) continue
    const id = url.slice(CLIP_SOURCE_PREFIX.length).trim()
    if (id) ids.add(id)
  }
  return ids
}

export interface ResumePlan {
  /** Clips that still need pulling, in playlist order. */
  remaining: HudlClipCandidate[]
  /** How many were already on file — counted so progress stays honest. */
  alreadyImported: number
}

/**
 * Splits a playlist into what is done and what is left.
 *
 * `alreadyImported` is added to the job's counters rather than dropped, so a
 * resumed import reports "48 of 50" instead of restarting the count at zero
 * and looking like it lost the earlier work.
 *
 * Clip ids are Hudl-global, so this also correctly declines to re-import a
 * clip that appears in two different playlists — the coach already has that
 * film, and a second copy would be graded twice in any batch that covers both.
 */
export function planResume(
  clips: HudlClipCandidate[],
  already: Set<string>
): ResumePlan {
  const remaining = clips.filter((clip) => !already.has(clip.clipId))
  return { remaining, alreadyImported: clips.length - remaining.length }
}
