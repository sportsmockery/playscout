/**
 * Measuring a gain by reading the two ends SEPARATELY.
 *
 * WHY THIS IS NOT THE IDEA CLAUDE.md SAYS NOT TO RETRY. That one asked the
 * charting model, in one response, for a start position and an end position
 * and subtracted them. It failed for a specific and well-measured reason: the
 * derived figure equalled the model's own stated gain EIGHT times out of eight
 * (`model said 24 | positions 48 → 72 = 24`). One call that knows the gain
 * back-fills two positions that produce it.
 *
 * Back-filling requires knowing what you are aiming at. So here each end is
 * read by a SEPARATE call, shown only its own moment of the film, never told a
 * gain is being computed and never shown the other answer. There is nothing to
 * back-fill toward.
 *
 * WHAT IT IS TRYING TO FIX. Measured over five runs on the clip whose gain the
 * coach confirmed as 55: the reads were 60, 55, 45, 45, 52, 45, 48, 45, 55 —
 * median 48. That is not noise around the right answer, it is a consistent
 * SHORT bias of about seven yards, and a read that never sees both ends at
 * once cannot compress the distance between them to fit a number it has
 * already chosen.
 *
 * THE DIRECTION IS DERIVED, NOT ASKED. Each read reports the distance to the
 * goal line on the LEFT of frame and the one on the RIGHT — two plain
 * observations with no possession inference in them. Which one the offense is
 * attacking is then whichever distance went DOWN, computed in code. Asking the
 * model "which goal line are they attacking" would put an inference back
 * inside the observation, which is the habit this whole module exists to break.
 *
 * AND IT CHECKS ITSELF. The two distances describe the same 100-yard field, so
 * they must sum to about 100. A read whose ends do not agree about how long
 * the field is has misread a stripe, and is discarded rather than averaged.
 *
 * UNMEASURED AS OF THIS COMMIT. Wire it, score it against the existing reads on
 * the same clips in the same session, and do not switch anything over on the
 * strength of the argument above — five hypotheses with arguments this good
 * have already been killed by the harness.
 */

/** A regulation field between the goal lines, in yards. */
const FIELD_LENGTH = 100

/**
 * How far the two ends of one read may disagree about the length of the field
 * before neither is believed.
 *
 * Both numbers come from counting the same painted stripes in the same frame,
 * so a genuine read has them summing to 100. Five yards is one stripe of
 * slack — enough for a ball spotted between markings, not enough to hide a
 * misidentified yard number, which is wrong by ten.
 */
const FIELD_SUM_TOLERANCE = 5

/** Closer to the goal line than this at the end of the play reads as a score. */
const ENDZONE_EPSILON = 2

export interface FieldPositionRead {
  /** False when the ball is not findable in this moment at all. */
  ball_visible: boolean
  /** Yards from the ball to the goal line at the LEFT of frame. */
  yards_to_left_goal_line: number | null
  /** Yards from the ball to the goal line at the RIGHT of frame. */
  yards_to_right_goal_line: number | null
  /** What was counted — which stripes, which painted numbers. */
  landmarks_used?: string | null
  confidence?: number | null
}

export type SplitGainFailure =
  | 'ball_not_visible'
  | 'incomplete_read'
  | 'field_length_disagrees'
  | 'no_direction'

export interface SplitGain {
  /** Positive is a gain, negative a loss. Null when it could not be derived. */
  yards: number | null
  /** Which goal line the offense turned out to be attacking. */
  attacking: 'left' | 'right' | null
  /** True when the play finished in the end zone. */
  reachedEndZone: boolean
  /**
   * The attacking goal line was inferred from which way the ball moved, and
   * therefore ASSUMES the play gained. A sack or a tackle for loss moves the
   * ball the other way, and this reads it as a gain toward the other end zone
   * — a 5-yard sack becomes a 5-yard gain. Caught by its own unit test before
   * this ever saw film.
   *
   * Pass `attacking` when the caller knows it and this is false, and the sign
   * of `yards` is then real.
   */
  directionAssumed: boolean
  failure?: SplitGainFailure
  /** Coach-readable, and the reason a null is a null. */
  reason: string
}

export interface SplitGainOptions {
  /**
   * Which goal line the offense is attacking, when something other than this
   * read already knows. The charting pass's `result` (gain / loss / touchdown)
   * is enough to supply it, and leaning on that costs nothing this module
   * cares about: the objection to the charting read is its MAGNITUDE, which is
   * exactly what is not being borrowed here.
   */
  attacking?: 'left' | 'right'
}

function usable(read: FieldPositionRead | null | undefined): read is FieldPositionRead & {
  yards_to_left_goal_line: number
  yards_to_right_goal_line: number
} {
  return (
    !!read &&
    read.ball_visible &&
    typeof read.yards_to_left_goal_line === 'number' &&
    typeof read.yards_to_right_goal_line === 'number'
  )
}

/**
 * The gain, from two reads that never saw each other.
 *
 * Deliberately returns null rather than a best guess on every failure. An
 * unmeasured play is already a first-class outcome on this sheet — it prints
 * "—", never 0 — so there is no pressure here to produce a number.
 */
export function deriveSplitGain(
  atSnap: FieldPositionRead | null | undefined,
  atEnd: FieldPositionRead | null | undefined,
  opts: SplitGainOptions = {}
): SplitGain {
  const none = (failure: SplitGainFailure, reason: string): SplitGain => ({
    yards: null,
    attacking: null,
    reachedEndZone: false,
    directionAssumed: false,
    failure,
    reason,
  })

  if (atSnap && atEnd && (!atSnap.ball_visible || !atEnd.ball_visible)) {
    return none('ball_not_visible', 'The ball could not be found in one of the two moments.')
  }
  if (!usable(atSnap) || !usable(atEnd)) {
    return none('incomplete_read', 'One of the two reads did not report both goal lines.')
  }

  // The two distances describe the same field, so they have to add up to it.
  // A read that disagrees with itself about how long the field is has misread
  // a stripe, and is thrown away rather than averaged with the other.
  for (const [label, read] of [
    ['snap', atSnap],
    ['end', atEnd],
  ] as const) {
    const total = read.yards_to_left_goal_line + read.yards_to_right_goal_line
    if (Math.abs(total - FIELD_LENGTH) > FIELD_SUM_TOLERANCE) {
      return none(
        'field_length_disagrees',
        `The ${label} read put the ball ${read.yards_to_left_goal_line} from one goal line and ${read.yards_to_right_goal_line} from the other, which is a ${total}-yard field. One of those stripes was misread.`
      )
    }
  }

  const leftDelta = atSnap.yards_to_left_goal_line - atEnd.yards_to_left_goal_line
  const rightDelta = atSnap.yards_to_right_goal_line - atEnd.yards_to_right_goal_line

  // When the caller knows which way they were going, the subtraction is plain
  // and its SIGN is real — a sack comes out negative, as it should.
  let attacking: 'left' | 'right'
  let directionAssumed = false

  if (opts.attacking) {
    attacking = opts.attacking
  } else {
    // Otherwise: whichever goal line the ball got CLOSER to. Asking the model
    // this would put an inference back inside the observation — but deriving
    // it from movement ASSUMES the play gained, and a play that lost ground
    // comes out as a gain toward the other end zone. That is why the result
    // is marked, and why a caller that knows should say so.
    if (leftDelta > 0 && rightDelta <= 0) attacking = 'left'
    else if (rightDelta > 0 && leftDelta <= 0) attacking = 'right'
    else if (leftDelta === 0 && rightDelta === 0) {
      return none('no_direction', 'The ball finished where it started, so there is no gain to read.')
    } else {
      // Both moved the same way: the two reads do not describe one play.
      return none(
        'no_direction',
        'The two reads disagree about which way the ball travelled, so neither was counted.'
      )
    }
    directionAssumed = true
  }

  const yards = attacking === 'left' ? leftDelta : rightDelta
  const remaining =
    attacking === 'left' ? atEnd.yards_to_left_goal_line : atEnd.yards_to_right_goal_line

  return {
    yards,
    attacking,
    directionAssumed,
    reachedEndZone: remaining <= ENDZONE_EPSILON,
    reason: `Read separately at each end: the ball started ${
      attacking === 'left' ? atSnap.yards_to_left_goal_line : atSnap.yards_to_right_goal_line
    } yards out and finished ${remaining}.`,
  }
}

/**
 * One moment of film, one question: where is the ball on the field.
 *
 * The prompt never says "gain", never says "how far did it go", and never
 * hints that a second read exists. That silence IS the mechanism — the failure
 * this replaces was a model deciding a gain and reverse-engineering positions
 * to match, which it can only do when it knows a gain is wanted.
 */
export function buildFieldPositionPrompt(moment: 'snap' | 'end'): string {
  const whichMoment =
    moment === 'snap'
      ? `This clip shows the moments around a SNAP. Find the ball as it is snapped — in the centre's hands or just leaving them — and report where THAT spot is on the field.`
      : `This clip shows the END of a football play. Find the ball where the play finished — where the runner was brought down, stepped out, scored, or where a pass was caught or hit the ground — and report where THAT spot is on the field.`

  return `You are reading ONE still fact off football film: where the ball is on the field.

${whichMoment}

HOW TO MEASURE. American football fields are lined. There is a painted stripe
every 5 yards across the full width, a painted NUMBER every 10 yards, hash
marks down the middle, and a goal line with an end zone behind it at each end.
These are the instrument. Count them.

1. Find the ball.
2. Find the nearest painted stripe to it, and the nearest painted NUMBER, and
   read that number. The numbers count UP to 50 from each end and back DOWN,
   so a "40" appears twice on the field — use which end zone is nearer to tell
   them apart.
3. Count stripes from there to the goal line at the LEFT edge of the picture.
   Each stripe is 5 yards. That is yards_to_left_goal_line.
4. Do the same to the goal line at the RIGHT edge of the picture. That is
   yards_to_right_goal_line.

The camera may pan. That does not matter: the lines pan with it, and each end
is counted separately from whatever is on screen when you count it. "Left" and
"right" mean the left and right of the picture, not any team's left or right.

YOUR TWO NUMBERS DESCRIBE THE SAME FIELD, so they must add up to about 100. If
they do not, you have misread a stripe or a painted number — count again before
answering.

Say ball_visible: false if you cannot find the ball at this moment at all, and
leave both distances null. Leave a distance null if that goal line's direction
is genuinely uncountable — a stripe you cannot resolve is not a stripe you may
estimate.

In landmarks_used, say exactly what you counted: which painted number you read
and how many stripes you counted from it. Report nothing you did not see.`
}

/** The response shape for one moment. Mirrors FieldPositionRead exactly. */
export const FIELD_POSITION_SCHEMA = {
  type: 'object',
  properties: {
    ball_visible: { type: 'boolean' },
    yards_to_left_goal_line: { type: 'integer', nullable: true },
    yards_to_right_goal_line: { type: 'integer', nullable: true },
    landmarks_used: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: [
    'ball_visible',
    'yards_to_left_goal_line',
    'yards_to_right_goal_line',
    'landmarks_used',
    'confidence',
  ],
} as const

export function parseFieldPosition(json: string): FieldPositionRead | null {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    return {
      ball_visible: raw.ball_visible !== false,
      yards_to_left_goal_line: num(raw.yards_to_left_goal_line),
      yards_to_right_goal_line: num(raw.yards_to_right_goal_line),
      landmarks_used: typeof raw.landmarks_used === 'string' ? raw.landmarks_used : null,
      confidence: num(raw.confidence),
    }
  } catch {
    return null
  }
}
