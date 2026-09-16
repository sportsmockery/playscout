/**
 * The closed position vocabulary StatsIQ counts against.
 *
 * A box score is arithmetic over labels, so the labels have to be the same
 * label every time. "RB" in play 3, "running back" in play 7 and "tailback" in
 * play 19 are one child with 14 carries or three ghosts with 4, 6 and 4 — and
 * a free-text position field makes that a coin flip on every play. This is the
 * same argument taxonomy.ts makes for tendency names, for the same reason: a
 * name the model invents is a row that never accumulates.
 *
 * Why positions and not jersey numbers: most youth and high-school sideline
 * film cannot resolve two digits on a moving jersey. Numbers are still used
 * when they clear the verification gates in player-grades.ts, but the position
 * is what is legible on essentially every play, so it — not the number — is
 * the primary key of a stat line.
 *
 * LEFT / RIGHT CONVENTION: always from the graded unit's own perspective,
 * facing the way they are going (offense looking at the defense; defense
 * looking at the offense). So an offense's left tackle and the defensive end
 * head-up on him are `lt` and `de_right`. Stated once here, restated in the
 * prompt, and never inferred from the camera — a sideline angle and an end-zone
 * angle of the same snap would otherwise disagree about which side is which.
 */

export const OFFENSIVE_POSITIONS = [
  'qb',
  'rb',
  'fb',
  'wingback_left',
  'wingback_right',
  'te_left',
  'te_right',
  'wr_left',
  'wr_right',
  'slot_left',
  'slot_right',
  'lt',
  'lg',
  'c',
  'rg',
  'rt',
  'other_offense',
] as const
export type OffensivePosition = (typeof OFFENSIVE_POSITIONS)[number]

export const DEFENSIVE_POSITIONS = [
  'de_left',
  'de_right',
  'dt_left',
  'dt_right',
  'nose',
  'lb_left',
  'lb_middle',
  'lb_right',
  'cb_left',
  'cb_right',
  'fs',
  'ss',
  'other_defense',
] as const
export type DefensivePosition = (typeof DEFENSIVE_POSITIONS)[number]

/**
 * Not offered to the model — it is what code falls back to when a label can't
 * be placed on either side of the ball. Keeping it out of the schema means the
 * model can't choose it as an easy out.
 */
export const UNKNOWN_POSITION = 'unknown' as const

export const STAT_POSITIONS = [...OFFENSIVE_POSITIONS, ...DEFENSIVE_POSITIONS] as const
export type StatPosition = OffensivePosition | DefensivePosition | typeof UNKNOWN_POSITION

export const POSITION_LABELS: Record<StatPosition, string> = {
  qb: 'QB',
  rb: 'Running Back',
  fb: 'Fullback',
  wingback_left: 'Left Wingback',
  wingback_right: 'Right Wingback',
  te_left: 'Left Tight End',
  te_right: 'Right Tight End',
  wr_left: 'Left Wide Receiver',
  wr_right: 'Right Wide Receiver',
  slot_left: 'Left Slot',
  slot_right: 'Right Slot',
  lt: 'Left Tackle',
  lg: 'Left Guard',
  c: 'Center',
  rg: 'Right Guard',
  rt: 'Right Tackle',
  other_offense: 'Other (offense)',
  de_left: 'Left Defensive End',
  de_right: 'Right Defensive End',
  dt_left: 'Left Defensive Tackle',
  dt_right: 'Right Defensive Tackle',
  nose: 'Nose',
  lb_left: 'Left Linebacker',
  lb_middle: 'Middle Linebacker',
  lb_right: 'Right Linebacker',
  cb_left: 'Left Cornerback',
  cb_right: 'Right Cornerback',
  fs: 'Free Safety',
  ss: 'Strong Safety',
  other_defense: 'Other (defense)',
  unknown: 'Unidentified',
}

/** One line per position so the prompt can describe where each one lines up. */
const POSITION_ALIGNMENT: Record<StatPosition, string> = {
  qb: 'takes the snap (under center, pistol or shotgun)',
  rb: 'the deep back / tailback — the primary ball carrier out of the backfield',
  fb: 'the lead back, closer to the line than the tailback',
  wingback_left: 'off the line, outside the left end (wing/slot back in a wing set)',
  wingback_right: 'off the line, outside the right end',
  te_left: 'attached to the offensive line on the left end',
  te_right: 'attached to the offensive line on the right end',
  wr_left: 'widest receiver to the left, on or off the line',
  wr_right: 'widest receiver to the right',
  slot_left: 'inside receiver to the left, between the widest receiver and the line',
  slot_right: 'inside receiver to the right',
  lt: 'left tackle',
  lg: 'left guard',
  c: 'snaps the ball',
  rg: 'right guard',
  rt: 'right tackle',
  other_offense: 'an offensive player who does not fit any label above — say where they lined up in position_detail',
  de_left: 'end man on the line of scrimmage, defense’s left',
  de_right: 'end man on the line of scrimmage, defense’s right',
  dt_left: 'interior lineman, defense’s left',
  dt_right: 'interior lineman, defense’s right',
  nose: 'interior lineman head-up or shaded on the center',
  lb_left: 'off-ball linebacker, defense’s left',
  lb_middle: 'off-ball linebacker in the middle (Mike)',
  lb_right: 'off-ball linebacker, defense’s right',
  cb_left: 'corner over the widest receiver, defense’s left',
  cb_right: 'corner over the widest receiver, defense’s right',
  fs: 'deep safety, the free/middle-field player',
  ss: 'the safety rolled down / to the strength',
  other_defense: 'a defensive player who does not fit any label above — say where they lined up in position_detail',
  unknown: 'unplaceable',
}

/**
 * The broad job a position does, used to sanity-check a jersey number nobody
 * could verify.
 *
 * A player genuinely moves around inside a group — a back aligns in the slot,
 * a linebacker walks out over a wing — and a number that follows them there is
 * fine. A number that shows up as an offensive lineman on one play and a wide
 * receiver on the next is a misread, not a versatile child, and stat-lines.ts
 * abandons it. Same reasoning as groupGradesForRollup in aggregate-batch.ts,
 * where "#55" was observed at six positions across seven reps.
 */
export const POSITION_GROUPS = [
  'backfield', 'receiver', 'oline', 'dline', 'linebacker', 'secondary', 'other',
] as const
export type PositionGroup = (typeof POSITION_GROUPS)[number]

const GROUP_OF: Record<StatPosition, PositionGroup> = {
  qb: 'backfield', rb: 'backfield', fb: 'backfield',
  wingback_left: 'backfield', wingback_right: 'backfield',
  te_left: 'receiver', te_right: 'receiver',
  wr_left: 'receiver', wr_right: 'receiver',
  slot_left: 'receiver', slot_right: 'receiver',
  lt: 'oline', lg: 'oline', c: 'oline', rg: 'oline', rt: 'oline',
  other_offense: 'other',
  de_left: 'dline', de_right: 'dline', dt_left: 'dline', dt_right: 'dline', nose: 'dline',
  lb_left: 'linebacker', lb_middle: 'linebacker', lb_right: 'linebacker',
  cb_left: 'secondary', cb_right: 'secondary', fs: 'secondary', ss: 'secondary',
  other_defense: 'other',
  unknown: 'other',
}

export function positionGroup(id: string): PositionGroup {
  return GROUP_OF[id as StatPosition] ?? 'other'
}

export function isOffensivePosition(id: string): id is OffensivePosition {
  return (OFFENSIVE_POSITIONS as readonly string[]).includes(id)
}

export function isDefensivePosition(id: string): id is DefensivePosition {
  return (DEFENSIVE_POSITIONS as readonly string[]).includes(id)
}

export function positionLabel(id: string): string {
  return POSITION_LABELS[id as StatPosition] ?? id
}

/**
 * Free text → a position id in the closed set.
 *
 * The response schema already constrains the model to these ids, so this is
 * the belt to that suspenders: it also has to handle a coach's typed roster
 * position, a label that arrives from an older saved result, and the rare
 * model that writes "Left Guard" into an enum field anyway.
 */
const DIRECT_ALIASES: Record<string, StatPosition> = {
  quarterback: 'qb',
  qb: 'qb',
  'signal caller': 'qb',
  rb: 'rb',
  hb: 'rb',
  tb: 'rb',
  halfback: 'rb',
  tailback: 'rb',
  'running back': 'rb',
  'h back': 'fb',
  fb: 'fb',
  fullback: 'fb',
  'full back': 'fb',
  c: 'c',
  center: 'c',
  lt: 'lt',
  'left tackle': 'lt',
  lg: 'lg',
  'left guard': 'lg',
  rg: 'rg',
  'right guard': 'rg',
  rt: 'rt',
  'right tackle': 'rt',
  nose: 'nose',
  ng: 'nose',
  nt: 'nose',
  'nose guard': 'nose',
  'nose tackle': 'nose',
  fs: 'fs',
  'free safety': 'fs',
  ss: 'ss',
  'strong safety': 'ss',
  mike: 'lb_middle',
  'mike linebacker': 'lb_middle',
  'middle linebacker': 'lb_middle',
  mlb: 'lb_middle',
}

/** Words that say which side of the formation a player is on. */
function sideOf(text: string): 'left' | 'right' | null {
  if (/\b(left|weak|weakside|backside|back side|l)\b/.test(text)) return 'left'
  if (/\b(right|strong|strongside|playside|play side|frontside|front side|r)\b/.test(text)) return 'right'
  return null
}

/**
 * Best-effort placement of a free-text label. Returns the side's catch-all
 * rather than guessing a specific spot: `other_defense` is a row a coach can
 * read and question, while a wrong `cb_left` is a stat on the wrong child.
 */
export function normalizeStatPosition(
  raw: string | null | undefined,
  side?: 'offense' | 'defense' | null
): StatPosition {
  const text = (raw ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/#\s*\d+/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return sideFallback(side)

  if ((STAT_POSITIONS as readonly string[]).includes(raw as string)) return raw as StatPosition
  const collapsed = text.replace(/\s+/g, '_')
  if ((STAT_POSITIONS as readonly string[]).includes(collapsed)) return collapsed as StatPosition
  if (DIRECT_ALIASES[text]) return DIRECT_ALIASES[text]

  const lr = sideOf(text)

  if (/\b(wing|wingback|wing back)\b/.test(text)) {
    return lr === 'right' ? 'wingback_right' : lr === 'left' ? 'wingback_left' : 'other_offense'
  }
  if (/\b(te|tight end)\b/.test(text)) {
    return lr === 'right' ? 'te_right' : lr === 'left' ? 'te_left' : 'other_offense'
  }
  if (/\b(slot|inside receiver)\b/.test(text)) {
    return lr === 'right' ? 'slot_right' : lr === 'left' ? 'slot_left' : 'other_offense'
  }
  if (/\b(wr|wide receiver|receiver|split end|flanker|x|z)\b/.test(text)) {
    return lr === 'right' ? 'wr_right' : lr === 'left' ? 'wr_left' : 'other_offense'
  }
  if (/\b(tackle)\b/.test(text) && /\b(ol|offensive|o line|line)\b/.test(text)) {
    return lr === 'right' ? 'rt' : lr === 'left' ? 'lt' : 'other_offense'
  }
  if (/\b(guard)\b/.test(text)) {
    return lr === 'right' ? 'rg' : lr === 'left' ? 'lg' : 'other_offense'
  }
  if (/\b(de|defensive end|edge|end)\b/.test(text)) {
    return lr === 'right' ? 'de_right' : lr === 'left' ? 'de_left' : 'other_defense'
  }
  if (/\b(dt|defensive tackle|three tech|tech)\b/.test(text)) {
    return lr === 'right' ? 'dt_right' : lr === 'left' ? 'dt_left' : 'other_defense'
  }
  if (/\b(lb|linebacker|backer|will|sam)\b/.test(text)) {
    if (/\bwill\b/.test(text)) return 'lb_left'
    if (/\bsam\b/.test(text)) return 'lb_right'
    return lr === 'right' ? 'lb_right' : lr === 'left' ? 'lb_left' : 'lb_middle'
  }
  if (/\b(cb|corner|cornerback)\b/.test(text)) {
    return lr === 'right' ? 'cb_right' : lr === 'left' ? 'cb_left' : 'other_defense'
  }
  if (/\b(safety|db|defensive back|secondary)\b/.test(text)) return 'other_defense'
  // A bare "tackle" with no unit named is ambiguous between an offensive
  // tackle and a defensive one, so it stays on the side we were told.
  if (/\b(tackle)\b/.test(text)) {
    if (side === 'offense') return lr === 'right' ? 'rt' : lr === 'left' ? 'lt' : 'other_offense'
    if (side === 'defense') return lr === 'right' ? 'dt_right' : lr === 'left' ? 'dt_left' : 'other_defense'
  }

  return sideFallback(side)
}

function sideFallback(side?: 'offense' | 'defense' | null): StatPosition {
  if (side === 'offense') return 'other_offense'
  if (side === 'defense') return 'other_defense'
  return UNKNOWN_POSITION
}

/**
 * Renders the vocabulary into the prompt, so what the model is told matches
 * what the schema enforces and what the tally counts — one source, three uses.
 */
export function buildPositionVocabularyPrompt(side: 'offense' | 'defense' | 'both'): string {
  const blocks: string[] = []
  if (side !== 'defense') {
    blocks.push(
      `OFFENSE\n${OFFENSIVE_POSITIONS.map((p) => `  ${p} — ${POSITION_LABELS[p]}: ${POSITION_ALIGNMENT[p]}`).join('\n')}`
    )
  }
  if (side !== 'offense') {
    blocks.push(
      `DEFENSE\n${DEFENSIVE_POSITIONS.map((p) => `  ${p} — ${POSITION_LABELS[p]}: ${POSITION_ALIGNMENT[p]}`).join('\n')}`
    )
  }

  return `POSITION VOCABULARY — use these exact ids and nothing else.

LEFT and RIGHT are always from the perspective of the unit you are grading, facing the way they
are going. Never from the camera: the same snap shot from the other sideline would flip every
label, and then no two plays could be added together.

${blocks.join('\n\n')}

Use the SAME id for the same player on every play. If a player moves — the tailback aligns as a
wingback on one snap — label them where they lined up on THAT snap and say so in position_detail.
If two players share one id across the clip you cannot tell them apart, which is honest: the row
covers the position, not the person.`
}
