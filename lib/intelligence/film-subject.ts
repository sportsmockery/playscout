import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Whose film is this, and is the module about to grade it allowed to treat it
 * as the coach's own team?
 *
 * Every module except SCOUTIQ grades the coach's own unit. Pointed at opponent
 * film they still produce output — they just produce it ABOUT the opponent
 * while labelling it as the coach's team. Observed in production: a RANKERIQ
 * batch over four clips of TP Blue vs HW (neither team the coach's) came back
 * reading "The Tinley Park Bulldogs LW defense showed good effort in pursuit",
 * with per-player grades written into that team's `player_grades` from film
 * their players are not in.
 *
 * The film row is what knows whose film it is, so this resolves server-side.
 * A client only posts a `moduleKey`, and a caller that could name the subject
 * itself could put anyone's grades on anyone's roster.
 */

/** Modules whose analysis subject is the coach's own team. */
export const OWN_TEAM_MODULES = [
  'QBIQ',
  'OLIQ',
  'RBIQ',
  'WRIQ',
  'DLIQ',
  'LBIQ',
  'DBIQ',
  'TEAMIQ',
  'MISTAKEIQ',
  'RANKERIQ',
  'PRACTICEIQ',
] as const

export interface FilmSubject {
  /** 'opponent' only when the video is explicitly tagged as opponent film. */
  filmType: 'self' | 'opponent'
  opponentName: string | null
}

/** The safe default: film we know nothing about is treated as the coach's own. */
export const OWN_FILM: FilmSubject = { filmType: 'self', opponentName: null }

export function isOwnTeamModule(moduleKey: string): boolean {
  return (OWN_TEAM_MODULES as readonly string[]).includes(moduleKey)
}

/**
 * True when an own-team module is about to run on film tagged as an opponent's.
 *
 * This is the condition that must never silently write to the coach's own
 * roster, tendencies or mistake log — the analysis may still be useful, but it
 * is not about their team.
 */
export function isMisdirectedRun(moduleKey: string, subject: FilmSubject): boolean {
  return isOwnTeamModule(moduleKey) && subject.filmType === 'opponent'
}

/**
 * How the subject should be named in a prompt.
 *
 * Handing an own-team module the coach's team name on opponent film is exactly
 * what produced the opponent's players being called by the coach's team name.
 * On opponent film the honest label is the opponent's name, or nothing.
 */
export function subjectNameFor(
  moduleKey: string,
  subject: FilmSubject,
  ownTeamName?: string | null
): string | undefined {
  if (isMisdirectedRun(moduleKey, subject)) return subject.opponentName ?? undefined
  return ownTeamName ?? undefined
}

/** Reads the film's tagging. Never trusts a caller for it. */
export async function resolveFilmSubject(
  supabase: SupabaseClient,
  videoId: string | null | undefined
): Promise<FilmSubject> {
  if (!videoId) return OWN_FILM

  const { data, error } = await supabase
    .from('videos')
    .select('film_type, opponent:opponents(name)')
    .eq('id', videoId)
    .maybeSingle()

  if (error || !data) return OWN_FILM

  // Supabase types an embedded to-one relation as an array in some versions.
  const embedded = data.opponent as unknown
  const opponent = Array.isArray(embedded) ? embedded[0] : embedded
  const opponentName = (opponent as { name?: string } | null)?.name ?? null

  return {
    filmType: data.film_type === 'opponent' ? 'opponent' : 'self',
    opponentName,
  }
}
