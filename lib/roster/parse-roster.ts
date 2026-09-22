/**
 * Turning a pasted roster into rows a coach can check before it is saved.
 *
 * WHY THIS EXISTS. Entering a roster was one player at a time through a modal.
 * A real freshman roster is sixty kids, which is sixty modals, and the roster
 * is what unlocks player-level grading at all: RankerIQ refuses a jersey
 * number with nothing to check it against, and StatsIQ can only promote a
 * number it read to a NAME when that number is on file. So "the roster is
 * tedious to enter" was not a papercut — it was the gate in front of every
 * per-player feature in the product.
 *
 * WHAT THIS IS NOT. It does not save anything and it does not guess on the
 * coach's behalf. It reads text into rows, says what it could not read, and
 * hands the result to a preview. Getting a name or a number wrong here puts
 * one child's season on another child's page, which is the same failure the
 * whole identity pipeline in lib/intelligence exists to prevent — it would be
 * absurd to guard the model's guesses and then let the import guess freely.
 *
 * THE ORDER OF EXTRACTION IS THE DESIGN. Height, weight, class year, level and
 * position are pulled out FIRST, each consuming its tokens; the jersey number
 * is whatever single small integer is left after that, and the name is what
 * remains. Hunting the jersey first reads the 6 of 6'0" on one line and the
 * 134 of 134lbs on the next.
 */

import { GRADE_LEVELS } from '@/lib/content/grade-levels'

/**
 * Deliberately wider than the Add Player dropdown, which offers eighteen. A
 * coach's own roster says DL, NT and ATH, and rejecting a position because our
 * <select> lacks it would throw away something true. Unknown tokens are simply
 * not treated as positions and end up in the name, where the preview shows
 * them and the coach can fix the line.
 */
const POSITION_SIDES: Record<string, 'offense' | 'defense' | 'special_teams'> = {
  QB: 'offense', RB: 'offense', FB: 'offense', HB: 'offense', TB: 'offense',
  WR: 'offense', TE: 'offense', SB: 'offense', SE: 'offense', FL: 'offense',
  OL: 'offense', C: 'offense', OG: 'offense', OT: 'offense',
  LG: 'offense', RG: 'offense', LT: 'offense', RT: 'offense',
  DL: 'defense', DE: 'defense', DT: 'defense', NT: 'defense', NG: 'defense',
  LB: 'defense', ILB: 'defense', OLB: 'defense', MLB: 'defense',
  WLB: 'defense', SLB: 'defense',
  DB: 'defense', CB: 'defense', S: 'defense', SS: 'defense', FS: 'defense',
  K: 'special_teams', P: 'special_teams', LS: 'special_teams',
  KR: 'special_teams', PR: 'special_teams',
}

const POSITIONS = new Set(Object.keys(POSITION_SIDES))
/** Graded on both sides; carries no side of its own. */
const ATHLETE = 'ATH'

export type SideOfBall = 'offense' | 'defense' | 'special_teams' | 'both'

export type RowIssue =
  | 'no_jersey'
  | 'no_last_name'
  | 'unknown_level'

export interface ParsedPlayerRow {
  lineNumber: number
  raw: string
  firstName: string
  lastName: string
  /** Digits as written, normalized: "07" and "#7" both become "7". */
  jerseyNumber: string | null
  primaryPosition: string | null
  secondaryPosition: string | null
  sideOfBall: SideOfBall | null
  /** Only ever a value from GRADE_LEVELS — never a graduation year. */
  gradeLevel: string | null
  /** "Class of 2030". A year is not a level, and players.grade_level is a level. */
  classYear: string | null
  issues: RowIssue[]
}

export interface IgnoredLine {
  lineNumber: number
  raw: string
  reason: 'header' | 'unreadable'
}

export interface ParsedRoster {
  rows: ParsedPlayerRow[]
  ignored: IgnoredLine[]
  /**
   * Numbers claimed by more than one row in this paste.
   *
   * Not cosmetic: matchRosterPlayer resolves a number only when exactly one
   * player wears it, so importing a duplicate silently costs BOTH of those
   * kids every grade and every stat for the season. The importer refuses
   * rather than picking one.
   */
  duplicateJerseys: string[]
}

/** The comparison key for a jersey, identical to digitsOf in player-grades.ts. */
export function normalizeJersey(value: string | number | null | undefined): string | null {
  if (value == null) return null
  const digits = String(value).replace(/[^0-9]/g, '')
  return digits.length ? String(Number(digits)) : null
}

const GRADE_LOOKUP = new Map(GRADE_LEVELS.map((g) => [g.toLowerCase(), g]))

function matchGradeLevel(token: string, next?: string): { value: string; consumed: number } | null {
  const one = token.toLowerCase()
  const two = next ? `${one} ${next.toLowerCase()}` : ''

  // "8th grade" before "8th", so the longer phrase wins its own tokens.
  if (two && GRADE_LOOKUP.has(two)) return { value: GRADE_LOOKUP.get(two)!, consumed: 2 }
  if (GRADE_LOOKUP.has(one)) return { value: GRADE_LOOKUP.get(one)!, consumed: 1 }

  // A coach writing "8th" means the 8th-grade option; "14u" means 14U.
  const grade = one.match(/^(\d{1,2})(st|nd|rd|th)$/)
  if (grade && GRADE_LOOKUP.has(`${grade[1]}${grade[2]} grade`)) {
    return { value: GRADE_LOOKUP.get(`${grade[1]}${grade[2]} grade`)!, consumed: 1 }
  }
  return null
}

const HEIGHT_WHOLE = /^\d'\s*\d{0,2}"?$/        // 6'0"  5'11  6'
const HEIGHT_FEET = /^\d'$/                      // 5'   (followed by 6")
const HEIGHT_INCHES = /^\d{1,2}"$/               // 6"
const WEIGHT_WHOLE = /^\d{2,3}\s*lbs?\.?$/i      // 134lbs
const WEIGHT_UNIT = /^lbs?\.?$/i                 // ... lbs
const CLASS_YEAR = /^(19|20)\d{2}$/              // 2030
const JERSEY_MARKED = /^#\s*(\d{1,2})$/          // #45
const JERSEY_BARE = /^\d{1,2}$/                  // 45
const JUNK = /^[-–—·•|:]+$/

/** A header row, not a player: "Name, #, Position". */
function looksLikeHeader(line: string): boolean {
  const l = line.toLowerCase()
  if (!/\b(name|player)\b/.test(l)) return false
  return /\b(jersey|number|no\.?|#|pos|position|grade|level|class)\b/.test(l)
}

function splitPosition(token: string): { primary: string; secondary: string | null } | null {
  const parts = token.toUpperCase().split(/[/\\]/).filter(Boolean)
  if (!parts.length || parts.length > 2) return null
  const known = parts.every((p) => POSITIONS.has(p) || p === ATHLETE)
  if (!known) return null
  return { primary: parts[0], secondary: parts[1] ?? null }
}

function sideFor(primary: string, secondary: string | null): SideOfBall | null {
  const a = POSITION_SIDES[primary] ?? null
  const b = secondary ? POSITION_SIDES[secondary] ?? null : null
  if (a && b) return a === b ? a : 'both'
  return a ?? b
}

function parseLine(raw: string, lineNumber: number): ParsedPlayerRow | IgnoredLine {
  // Commas, tabs, semicolons and pipes are all just separators here. Splitting
  // on them individually would mean supporting four input shapes; flattening
  // to whitespace means supporting one.
  const tokens = raw.replace(/[,\t;|]+/g, ' ').trim().split(/\s+/).filter(Boolean)

  let jersey: string | null = null
  let primary: string | null = null
  let secondary: string | null = null
  let gradeLevel: string | null = null
  let classYear: string | null = null
  // Kept with their original index, because a token that turns out not to be
  // the jersey has to go back into the name WHERE IT WAS. Appending it instead
  // put the number where the surname goes.
  const residual: { token: string; at: number; isNumber: boolean }[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    if (JUNK.test(token)) continue

    const marked = token.match(JERSEY_MARKED)
    if (marked) { jersey ??= marked[1]; continue }

    // Height and weight are read and discarded: players has no column for
    // either, and leaving them in would corrupt the name.
    if (HEIGHT_WHOLE.test(token) || HEIGHT_FEET.test(token) || HEIGHT_INCHES.test(token)) continue
    if (WEIGHT_WHOLE.test(token)) continue
    if (WEIGHT_UNIT.test(token)) continue
    if (/^\d{2,3}$/.test(token) && tokens[i + 1] && WEIGHT_UNIT.test(tokens[i + 1])) { i++; continue }
    // A bare three-digit number on a roster line is a weight with the unit left
    // off. It cannot be a jersey — football numbers stop at 99 — so the only
    // alternative is letting it become somebody's surname.
    if (/^\d{3}$/.test(token)) continue

    if (CLASS_YEAR.test(token)) { classYear ??= `Class of ${token}`; continue }

    const grade = matchGradeLevel(token, tokens[i + 1])
    if (grade) { gradeLevel ??= grade.value; i += grade.consumed - 1; continue }

    if (!primary) {
      const pos = splitPosition(token)
      if (pos) { primary = pos.primary; secondary = pos.secondary; continue }
    }

    residual.push({ token, at: i, isNumber: JERSEY_BARE.test(token) })
  }

  // The jersey is decided LAST, from whatever small integers survived every
  // other rule. Deciding it first reads the 6 of 6'0".
  let jerseyAt = -1
  if (!jersey) {
    const candidate = residual.find((r) => r.isNumber)
    if (candidate) { jersey = candidate.token; jerseyAt = candidate.at }
  }

  // Everything else keeps its place in the line, including a second number we
  // cannot attribute — visible in the preview rather than silently dropped.
  const nameTokens = residual.filter((r) => r.at !== jerseyAt).map((r) => r.token)

  if (!nameTokens.length) return { lineNumber, raw, reason: 'unreadable' }

  const issues: RowIssue[] = []
  const lastName = nameTokens.length > 1 ? nameTokens[nameTokens.length - 1] : ''
  const firstName = nameTokens.length > 1 ? nameTokens.slice(0, -1).join(' ') : nameTokens[0]

  if (!jersey) issues.push('no_jersey')
  if (!lastName) issues.push('no_last_name')

  return {
    lineNumber,
    raw,
    firstName,
    lastName,
    jerseyNumber: normalizeJersey(jersey),
    primaryPosition: primary,
    secondaryPosition: secondary,
    sideOfBall: primary ? sideFor(primary, secondary) : null,
    gradeLevel,
    classYear,
    issues,
  }
}

export function parseRoster(text: string): ParsedRoster {
  const rows: ParsedPlayerRow[] = []
  const ignored: IgnoredLine[] = []

  text.split(/\r?\n/).forEach((raw, index) => {
    const lineNumber = index + 1
    const trimmed = raw.trim()
    if (!trimmed) return
    if (looksLikeHeader(trimmed)) {
      ignored.push({ lineNumber, raw: trimmed, reason: 'header' })
      return
    }
    const parsed = parseLine(trimmed, lineNumber)
    if ('reason' in parsed) ignored.push(parsed)
    else rows.push(parsed)
  })

  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.jerseyNumber) continue
    counts.set(row.jerseyNumber, (counts.get(row.jerseyNumber) ?? 0) + 1)
  }

  return {
    rows,
    ignored,
    duplicateJerseys: [...counts.entries()]
      .filter(([, n]) => n > 1)
      .map(([jersey]) => jersey)
      .sort((a, b) => Number(a) - Number(b)),
  }
}
