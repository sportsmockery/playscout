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

export type HudlTarget =
  | {
      kind: 'playlist'
      teamId: string
      videoId: string
      playlistId?: string
    }
  | {
      /**
       * A team's Hudl library page (`www.hudl.com/library/<id>`). The address
       * does NOT say which game is open — the game is picked from the page's
       * list by name, which is why an import from one needs a game name.
       */
      kind: 'library'
      libraryId: string
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
 * Reads the ids out of a Hudl watch/analyze link.
 *
 * Only one shape is accepted:
 *   /watch/team/<teamId>/analyze?v=<videoId>&l=<playlistId>
 *
 * That is deliberately narrow. It is the URL shape actually observed from a
 * real Hudl session; every other Hudl path is a guess, and a guessed parse
 * fails deep inside the worker twenty minutes later instead of here, where the
 * coach can read why. Widen this when a real example of another shape exists,
 * not before.
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

  // /library/<id> — the library page coaches actually live in. Same address
  // whichever game is selected, so the game comes from the name given with it.
  if (segments[0] === 'library' && segments[1] && /^\d+$/.test(segments[1]) && segments.length === 2) {
    const clean = new URL(url.toString())
    clean.search = ''
    clean.hash = ''
    return {
      ok: true,
      target: { kind: 'library', libraryId: segments[1] },
      canonicalUrl: clean.toString(),
    }
  }

  return {
    ok: false,
    reason:
      'That Hudl link is not one PlayScout recognises. Open the playlist or game in Hudl and copy the address bar — it should contain "/watch/team/" and a "v=" value, or be your library page (hudl.com/library/…).',
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

/**
 * A stable key for "this is the same playlist", for de-duplicating import jobs.
 * A library link is one address for every game in it, so its key includes the
 * game name — otherwise importing a second game would "join" the first.
 */
export function hudlTargetKey(target: HudlTarget, gameName?: string | null): string {
  if (target.kind === 'library') {
    const game = (gameName ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    return `library:${target.libraryId}:${game}`
  }
  return `playlist:${target.teamId}:${target.videoId}:${target.playlistId ?? ''}`
}
