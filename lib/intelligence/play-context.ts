import type { PositionAnalysisInput } from './schemas'

export type PlaySequenceContext = NonNullable<PositionAnalysisInput['playSequence']>

/**
 * The PLAY CONTEXT block, rendered once for every module.
 *
 * Each module used to build its own: QBIQ and RBIQ rendered down/distance/yard
 * line, OLIQ rendered only the coach's label, and the rest rendered nothing —
 * so the same clip told three modules three different amounts about the
 * situation it was in. With a coach's breakdown now feeding these fields,
 * that inconsistency would decide which modules got the facts.
 *
 * Only states what was actually recorded. A field the staff left blank stays
 * unstated rather than becoming "unknown", which the model would otherwise
 * reason about — and it would be reasoning about our gap, not the film.
 */
export function buildPlayContext(play?: PlaySequenceContext): string {
  if (!play) return ''

  const parts: string[] = []

  if (play.down) parts.push(`${ordinal(play.down)} & ${play.distance ?? '?'}`)
  if (play.yard_line) parts.push(`ball on ${play.yard_line}`)
  if (play.hash) parts.push(`${HASH_LABEL[play.hash]} hash`)
  if (play.offensive_formation) parts.push(`offense in ${play.offensive_formation}`)
  if (play.defensive_front) parts.push(`defense in ${play.defensive_front}`)
  if (play.play_name) parts.push(`play called "${play.play_name}"`)
  if (play.play_type) parts.push(play.play_type)
  if (play.play_direction) parts.push(`to the ${play.play_direction}`)
  if (play.gain_loss != null) {
    parts.push(`${play.gain_loss >= 0 ? 'gained' : 'lost'} ${Math.abs(play.gain_loss)} yards`)
  }
  if (play.result) parts.push(play.result)
  if (play.coach_label) parts.push(play.coach_label)

  if (!parts.length) return ''

  return `PLAY CONTEXT — recorded by the coaching staff, not inferred from the film. Treat it as
fact and do not contradict it; if what you see disagrees, say so explicitly rather than silently
overriding it.
  ${parts.join(' · ')}${play.odk ? `\n  Unit on the field: ${ODK_LABEL[play.odk]}` : ''}`
}

const HASH_LABEL: Record<'L' | 'M' | 'R', string> = { L: 'left', M: 'middle', R: 'right' }
const ODK_LABEL: Record<'O' | 'D' | 'K', string> = {
  O: 'offense',
  D: 'defense',
  K: 'kicking / special teams',
}

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10 > 3 || (n % 100) - (n % 10) === 10 ? 0 : n % 10]
  return `${n}${suffix}`
}
