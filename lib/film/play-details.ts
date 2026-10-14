/**
 * How a clip's breakdown reads in the film library and on the clip page.
 *
 * Column order and labels follow Hudl's own play table, so a coach moving
 * between the two sees the same thing in the same place.
 */
import type { PlaySequence } from '@/lib/db/types'

export const PLAY_DETAIL_COLUMNS = [
  'play_number', 'odk', 'down', 'distance', 'yard_line', 'hash', 'offensive_formation',
  'offensive_strength', 'backfield', 'play_name', 'play_type', 'play_direction', 'result',
  'gain_loss', 'efficiency', 'defensive_front', 'defensive_strength', 'blitz', 'coverage', 'quarter',
] as const

export type PlayDetailKey = (typeof PLAY_DETAIL_COLUMNS)[number]
export type PlayDetails = Partial<Pick<PlaySequence, PlayDetailKey>>

export const PLAY_DETAIL_LABELS: Record<PlayDetailKey, string> = {
  play_number: 'Play #',
  odk: 'ODK',
  down: 'Dn',
  distance: 'Dist',
  yard_line: 'Yard Ln',
  hash: 'Hash',
  offensive_formation: 'Off Form',
  offensive_strength: 'Off Str',
  backfield: 'Backfield',
  play_name: 'Off Play',
  play_type: 'Play Type',
  play_direction: 'Play Dir',
  result: 'Result',
  gain_loss: 'Gn/Ls',
  efficiency: 'Eff',
  defensive_front: 'Def Front',
  defensive_strength: 'Def Str',
  blitz: 'Blitz',
  coverage: 'Coverage',
  quarter: 'Qtr',
}

/** The select list for loading these fields. */
export const PLAY_DETAIL_SELECT = PLAY_DETAIL_COLUMNS.join(', ')

/** Label/value pairs for every field the staff filled in, in Hudl's order. */
export function playDetailEntries(play: PlayDetails | null | undefined): [string, string][] {
  if (!play) return []
  const out: [string, string][] = []
  for (const key of PLAY_DETAIL_COLUMNS) {
    const value = play[key]
    if (value === null || value === undefined || value === '') continue
    out.push([PLAY_DETAIL_LABELS[key], String(value)])
  }
  return out
}

/**
 * One line for a film-library card: "#115 · Q4 · D · 2 & 8 · L hash · Run L · −14".
 * Null when nothing was tagged.
 */
export function playSummary(play: PlayDetails | null | undefined): string | null {
  if (!play) return null
  const parts: string[] = []
  if (play.play_number != null) parts.push(`#${play.play_number}`)
  if (play.quarter != null) parts.push(`Q${play.quarter}`)
  if (play.odk) parts.push(play.odk)
  if (play.down != null) parts.push(`${play.down} & ${play.distance ?? '?'}`)
  if (play.hash) parts.push(`${play.hash} hash`)
  const call = [play.play_type, play.play_direction].filter(Boolean).join(' ')
  if (call) parts.push(call)
  else if (play.result) parts.push(play.result)
  if (play.gain_loss != null) parts.push(play.gain_loss < 0 ? `−${Math.abs(play.gain_loss)}` : `+${play.gain_loss}`)
  return parts.length ? parts.join(' · ') : null
}
