/**
 * Understands the Hudl URLs a coach pastes.
 *
 * Kept in `lib/` rather than `workers/` because both ends need it: the API
 * route rejects a bad URL immediately with something a coach can act on, and
 * the worker re-derives the ids rather than trusting what the route stored.
 *
 * Pure and dependency-free, and the only part of the Hudl integration that can
 * be fully tested without a Hudl account — everything downstream depends on
 * their live markup and response shapes.
 */

export type HudlTarget = {
  kind: 'playlist'
  /** Absent for a /library/<id> link, which carries no team in its path. */
  teamId?: string
  videoId: string
  playlistId?: string
}

export type HudlUrlCheck =
  | { ok: true; target: HudlTarget; canonicalUrl: string }
  | { ok: false; reason: string }

const HUDL_HOSTS = ['hudl.com', 'app.hudl.com', 'www.hudl.com']

function isHudlHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return HUDL_HOSTS.includes(host) || host.endsWith('.hudl.com')
}

/**
 * Reads the ids out of a Hudl game or playlist link.
 *
 * Two shapes are accepted, both observed from real coaches' Hudl sessions:
 *   /watch/team/<teamId>/analyze?v=<videoId>&l=<playlistId>
 *   /library/<id>  — how Hudl now links a game
 *
 * Deliberately narrow otherwise: every other Hudl path is a guess, and a
 * guessed parse fails deep inside the worker twenty minutes later instead of
 * here, where the coach can read why. The worker only opens the canonical URL
 * and reads the clip list Hudl's own page loads, so a new shape needs no
 * worker change — only a real example of it.
 */
export function parseHudlUrl(raw: string): HudlUrlCheck {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, reason: 'That does not look like a URL. Paste the full link from Hudl.' }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'Only http and https links are supported.' }
  }

  if (!isHudlHost(url.hostname)) {
    return {
      ok: false,
      reason: 'That is not a Hudl link. Copy the URL from the Hudl tab showing the clips you want.',
    }
  }

  // Credentials in the URL are never something we want to carry into a browser
  // session, and their presence usually means the link was hand-edited.
  if (url.username || url.password) {
    return { ok: false, reason: 'Remove the credentials from that link before pasting it.' }
  }

  const segments = url.pathname.split('/').filter(Boolean)

  // /watch/team/<teamId>/analyze?v=<videoId>
  const watchTeamIndex = segments.indexOf('team')
  if (segments[0] === 'watch' && watchTeamIndex === 1 && segments[2]) {
    const videoId = url.searchParams.get('v')
    if (!videoId) {
      return {
        ok: false,
        reason:
          'That link points at a team, not at film. Open the game or playlist you want first, then copy the URL.',
      }
    }
    return {
      ok: true,
      target: {
        kind: 'playlist',
        teamId: segments[2],
        videoId,
        playlistId: url.searchParams.get('l') ?? undefined,
      },
      canonicalUrl: canonicalize(url),
    }
  }

  // /library/<id>
  if (segments[0] === 'library' && segments[1] && /^\d+$/.test(segments[1]) && segments.length === 2) {
    return {
      ok: true,
      target: { kind: 'playlist', videoId: segments[1] },
      canonicalUrl: canonicalize(url),
    }
  }

  return {
    ok: false,
    reason:
      'That Hudl link is not one PlayScout recognises. Open the game or playlist in Hudl and copy the address bar — it should look like hudl.com/library/<number> or contain "/watch/team/" and a "v=" value.',
  }
}

/**
 * Strips tracking parameters so the same playlist pasted twice produces the
 * same URL. `cx` in particular changes with where the coach clicked from, and
 * two jobs for one playlist is a wasted pull of fifty clips.
 */
const TRACKING_PARAMS = ['cx', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

function canonicalize(url: URL): string {
  const clean = new URL(url.toString())
  for (const param of TRACKING_PARAMS) clean.searchParams.delete(param)
  clean.hash = ''
  // Sorted so parameter order can't make two identical links look different.
  clean.searchParams.sort()
  return clean.toString()
}

/** A stable key for "this is the same playlist", for de-duplicating import jobs. */
export function hudlTargetKey(target: HudlTarget): string {
  return `playlist:${target.teamId ?? 'library'}:${target.videoId}:${target.playlistId ?? ''}`
}
