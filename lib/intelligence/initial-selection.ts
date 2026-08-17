import type { Video } from '@/lib/db/types'

/**
 * Turns the film-selection query params a module screen can be linked with
 * into a concrete list of video ids.
 *
 * Supports `?videoId=` (the old single-clip deep link, still used by the film
 * detail page), `?videoIds=a,b,c` (a selection handed over from the film
 * library) and `?folderId=` (everything filed in that folder). Ids that
 * aren't in this team's library are dropped rather than trusted.
 */
export function resolveInitialVideoIds(
  params: { videoId?: string; videoIds?: string; folderId?: string },
  videos: Video[]
): string[] {
  const known = new Set(videos.map((v) => v.id))
  const out = new Set<string>()

  if (params.videoId && known.has(params.videoId)) out.add(params.videoId)

  for (const id of (params.videoIds ?? '').split(',')) {
    const trimmed = id.trim()
    if (trimmed && known.has(trimmed)) out.add(trimmed)
  }

  if (params.folderId) {
    for (const v of videos) {
      if (v.folder_id === params.folderId) out.add(v.id)
    }
  }

  return [...out]
}
