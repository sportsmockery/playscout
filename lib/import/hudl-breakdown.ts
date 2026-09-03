/**
 * Reads a Hudl breakdown export.
 *
 * This is the load-bearing piece of Hudl ingestion, and deliberately the
 * dumbest: a pure function over rows, no network, no Supabase. Whether the
 * rows arrive from a coach dropping the "Export Data" spreadsheet or from a
 * browser extension reading the playlist, they land here — so the fragile half
 * of the integration can be replaced without touching the half that decides
 * what a play IS.
 *
 * Why it matters beyond ingestion: the module prompts currently ask the model
 * to infer down, distance and formation from the film. A coach's breakdown
 * already knows them. Handing over tagged facts removes a whole class of
 * guessing, and lets TEAMIQ and SCOUTIQ count tendencies from what the staff
 * recorded rather than from what a model thought it saw.
 *
 * Every staff names their columns differently, so matching is by alias with
 * punctuation and spacing normalised, and anything unrecognised is KEPT in
 * `extra` rather than dropped — an unmapped column is still the coach's data.
 */

export interface HudlPlayRow {
  /** Position in the export, which is how clips are matched to rows when nothing better exists. */
  sourceRowIndex: number
  playNumber?: number
  /** Offense / Defense / Kicking — which unit is on the field. */
  odk?: 'O' | 'D' | 'K'
  down?: number
  distance?: number
  hash?: 'L' | 'M' | 'R'
  yardLine?: string
  offensiveFormation?: string
  defensiveFront?: string
  playName?: string
  playType?: string
  playDirection?: string
  result?: string
  gainLoss?: number
  /** Columns we do not map, kept verbatim. */
  extra: Record<string, string>
}

/** Column aliases, normalised (lowercase, alphanumerics only). */
const ALIASES: Record<keyof Omit<HudlPlayRow, 'sourceRowIndex' | 'extra'>, string[]> = {
  playNumber: ['play', 'playnumber', 'playno', 'no', 'num', 'clip', 'clipnumber'],
  odk: ['odk', 'odkall', 'unit', 'side', 'sideofball'],
  down: ['dn', 'down'],
  distance: ['dist', 'distance', 'togo', 'dtg'],
  hash: ['hash', 'hashmark'],
  yardLine: ['yardln', 'yardline', 'yrdln', 'ln', 'spot', 'fieldposition'],
  offensiveFormation: ['offform', 'offensiveformation', 'formation', 'form', 'offensiveform'],
  defensiveFront: ['deffront', 'defensivefront', 'front', 'defform', 'defensiveformation'],
  playName: ['offplay', 'play name', 'playname', 'call', 'playcall', 'offensiveplay'],
  playType: ['playtype', 'type', 'runpass', 'rp'],
  playDirection: ['playdir', 'playdirection', 'direction', 'dir'],
  result: ['result', 'playresult', 'outcome'],
  gainLoss: ['gnls', 'gainloss', 'gain', 'yards', 'yds', 'yardsgained', 'gn'],
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const LOOKUP = new Map<string, keyof typeof ALIASES>()
for (const [field, aliases] of Object.entries(ALIASES) as [keyof typeof ALIASES, string[]][]) {
  for (const alias of aliases) LOOKUP.set(normalizeKey(alias), field)
}

/** Which PlayScout field, if any, a Hudl column maps to. */
export function fieldForColumn(column: string): keyof typeof ALIASES | null {
  return LOOKUP.get(normalizeKey(column)) ?? null
}

function toInt(value: string): number | undefined {
  const n = parseInt(value.replace(/[^0-9-]/g, ''), 10)
  return Number.isFinite(n) ? n : undefined
}

/** "1st" / "1" / "First" all mean down 1. */
function parseDown(value: string): number | undefined {
  const n = toInt(value)
  if (n != null && n >= 1 && n <= 4) return n
  const word = value.toLowerCase().trim()
  const words: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 }
  return words[word]
}

function parseOdk(value: string): HudlPlayRow['odk'] {
  const v = value.trim().toUpperCase()
  if (v.startsWith('O')) return 'O'
  if (v.startsWith('D')) return 'D'
  if (v.startsWith('K') || v.startsWith('S')) return 'K'
  return undefined
}

function parseHash(value: string): HudlPlayRow['hash'] {
  const v = value.trim().toUpperCase()
  if (v.startsWith('L')) return 'L'
  if (v.startsWith('R')) return 'R'
  if (v.startsWith('M') || v.startsWith('C')) return 'M'
  return undefined
}

/**
 * Maps one export row. Blank cells are treated as absent rather than as empty
 * strings — a breakdown with a column the staff never filled in should not
 * produce a play claiming to know something it doesn't.
 */
export function mapHudlRow(row: Record<string, string>, sourceRowIndex: number): HudlPlayRow {
  const play: HudlPlayRow = { sourceRowIndex, extra: {} }

  for (const [column, rawValue] of Object.entries(row)) {
    const value = (rawValue ?? '').trim()
    const field = fieldForColumn(column)

    if (!field) {
      if (value) play.extra[column] = value
      continue
    }
    if (!value) continue

    switch (field) {
      case 'playNumber':
        play.playNumber = toInt(value)
        break
      case 'down':
        play.down = parseDown(value)
        break
      case 'distance':
      case 'gainLoss': {
        const n = toInt(value)
        if (n != null) play[field] = n
        break
      }
      case 'odk':
        play.odk = parseOdk(value)
        break
      case 'hash':
        play.hash = parseHash(value)
        break
      default:
        play[field] = value
    }
  }

  return play
}

export function mapHudlRows(rows: Record<string, string>[]): HudlPlayRow[] {
  return rows.map((row, i) => mapHudlRow(row, i))
}

/**
 * Minimal RFC4180-ish reader: quoted fields, escaped quotes, embedded commas
 * and newlines. Hudl exports are small and well-formed, and a dependency for
 * this would be more surface than the parser.
 */
export function parseDelimited(text: string, delimiter = ','): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    // Ignore blank trailing lines rather than emitting an empty play.
    if (row.some((c) => c.trim() !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') quoted = true
    else if (ch === delimiter) endField()
    else if (ch === '\n') endRow()
    else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length) endRow()

  const [header, ...body] = rows
  if (!header) return []

  return body.map((cells) =>
    Object.fromEntries(header.map((name, i) => [name.trim(), cells[i] ?? '']))
  )
}

/** Tab-separated is what a paste out of a spreadsheet produces. */
export function parseHudlExport(text: string): HudlPlayRow[] {
  const delimiter = detectDelimiter(text)
  return mapHudlRows(parseDelimited(text, delimiter))
}

function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? undefined : text.indexOf('\n'))
  return firstLine.split('\t').length > firstLine.split(',').length ? '\t' : ','
}

/**
 * The play_sequences shape, so a breakdown row can be stored and then rendered
 * by the one PLAY CONTEXT builder every module shares (lib/intelligence/
 * play-context.ts) rather than by a second renderer here.
 */
export function toPlaySequenceFields(play: HudlPlayRow): Record<string, unknown> {
  return {
    down: play.down ?? null,
    distance: play.distance ?? null,
    yard_line: play.yardLine ?? null,
    result: play.result ?? null,
    odk: play.odk ?? null,
    hash: play.hash ?? null,
    offensive_formation: play.offensiveFormation ?? null,
    defensive_front: play.defensiveFront ?? null,
    play_type: play.playType ?? null,
    play_direction: play.playDirection ?? null,
    play_name: play.playName ?? null,
    gain_loss: play.gainLoss ?? null,
    breakdown: Object.keys(play.extra).length ? play.extra : null,
    source_row_index: play.sourceRowIndex,
  }
}

export interface PlaySequenceRef {
  id: string
  sequence_number: number
}

export interface BreakdownMatch {
  sequenceId: string
  sequenceNumber: number
  play: HudlPlayRow
}

export interface BreakdownMatchResult {
  matched: BreakdownMatch[]
  /** Rows with no clip to attach to — usually the export covers plays that weren't filmed. */
  unmatchedRows: HudlPlayRow[]
  /** Clips with no row — usually scene detection found a cut that isn't a play. */
  unmatchedSequences: PlaySequenceRef[]
}

/**
 * Pairs breakdown rows with the clips already detected in a film.
 *
 * Matching is by ORDER, not by the export's play number. A play number counts
 * plays in the game; a sequence counts cuts in the film, and the two diverge
 * the moment a play goes unfilmed or the camera cuts mid-series. Order is the
 * only thing both sides genuinely share — and where it is wrong, the coach is
 * the one who can see it, which is why the mismatch is reported rather than
 * resolved silently.
 */
export function matchBreakdownToSequences(
  plays: HudlPlayRow[],
  sequences: PlaySequenceRef[]
): BreakdownMatchResult {
  const ordered = [...sequences].sort((a, b) => a.sequence_number - b.sequence_number)
  const pairs = Math.min(plays.length, ordered.length)

  return {
    matched: ordered.slice(0, pairs).map((seq, i) => ({
      sequenceId: seq.id,
      sequenceNumber: seq.sequence_number,
      play: plays[i],
    })),
    unmatchedRows: plays.slice(pairs),
    unmatchedSequences: ordered.slice(pairs),
  }
}

/**
 * A one-line summary of a row, for the reconciliation screen. Deliberately
 * separate from the prompt's PLAY CONTEXT block: a coach scanning sixty rows
 * needs a glanceable line, not the model's instructions.
 */
export function describeMatch(play: HudlPlayRow): string {
  const parts: string[] = []
  if (play.down) parts.push(`${play.down}&${play.distance ?? '?'}`)
  if (play.offensiveFormation) parts.push(play.offensiveFormation)
  if (play.playName) parts.push(play.playName)
  if (play.playType) parts.push(play.playType)
  if (play.gainLoss != null) parts.push(`${play.gainLoss >= 0 ? '+' : ''}${play.gainLoss}`)
  else if (play.result) parts.push(play.result)
  return parts.join(' · ') || '(no data on this row)'
}
