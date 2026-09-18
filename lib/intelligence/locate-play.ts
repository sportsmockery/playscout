import { Type } from '@google/genai'
import type { ModulePromptInput } from './schemas'

/**
 * Finding the football inside the film.
 *
 * A clip of "one play" is mostly not the play. The 31-second clip that produced
 * three contradictory stat sheets holds a snap at about 6.5s and a touchdown at
 * about 22s; the rest is a team lining up, and then a team celebrating and
 * lining up again. Handed all of it at 8fps, the charting pass got 253 frames
 * of which fewer than half showed football, and it anchored on a different
 * stretch each time — which is why consecutive runs reported different
 * FORMATIONS (Power I, then trips spread) for the same snap. They were reading
 * different moments and both calling it "play 1".
 *
 * So the film is localized first, by a deliberately cheap pass: low frame rate,
 * low resolution, and one question — when does each play start and end. Finding
 * a snap does not need to resolve a jersey number, and the charting pass that
 * follows gets a tight window at full fidelity instead of a wide one at
 * whatever is left over.
 */

export interface LocatedPlay {
  snap_seconds: number
  end_seconds: number
  confidence: number
}

export function buildPlayLocatorPrompt(input: ModulePromptInput): string {
  const colour = input.team?.jersey_color
    ? ` The team being charted wears ${input.team.jersey_color}, though that does not matter for this task.`
    : ''

  return `You are finding the live football inside a piece of film, and nothing else.

Football clips are mostly not football. A typical clip holds players walking to the line, a
snap, a few seconds of play, a whistle, and then a team regrouping — sometimes lining up for a
next snap that is never run.${colour}

For EVERY snap in this clip, report:
  snap_seconds — the moment the ball is snapped, in seconds from the start of the clip.
  end_seconds  — the moment that play is over: the whistle, the ball carrier going down or out
                 of bounds, an incompletion hitting the ground, or a score.
  confidence   — 0.0 to 1.0.

How to find a snap: the two lines are set and still, then everyone moves at once. That moment is
the snap. Players jogging into position, a huddle breaking, or a team celebrating are NOT snaps.

If the clip contains no live football at all, return an empty list. If a play is already underway
when the clip begins, use 0 as its snap time. Be generous at the end of a play rather than tight —
a run that ends in the end zone ends when the runner crosses, not when he is first touched.

Do not describe the play, who ran it, or what it gained. You are marking time ranges.

Return ONLY the JSON schema. No preamble.`
}

export const PLAY_LOCATOR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    plays: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          snap_seconds: { type: Type.NUMBER },
          end_seconds: { type: Type.NUMBER },
          confidence: { type: Type.NUMBER },
        },
        required: ['snap_seconds', 'end_seconds', 'confidence'],
      },
    },
  },
  required: ['plays'],
}

/** Seconds kept before the first snap, so the pre-snap look is still readable. */
export const PRE_SNAP_MARGIN = 2
/**
 * Seconds kept after the last play ends.
 *
 * Deliberately much larger than the head margin, because the two errors do not
 * cost the same thing. Trimming too much off the FRONT costs a little of the
 * pre-snap look. Trimming too much off the BACK cuts the play before it
 * finishes, and the charting pass then reads a runner who never scores: it
 * loses the result, and it measures the gain to wherever the window stopped.
 *
 * MEASURED, on the 55-yard touchdown this module was built against. The locator
 * called the same play's end at 16.8s twice and 21s once — under-calling it by
 * four seconds, because a long run's "end" is genuinely ambiguous at 2fps. With
 * a 2-second tail the two short windows charted 45 yards and one of them lost
 * the ball carrier as well; the run that got the longer window charted 50. The
 * locator's end is an estimate with several seconds of error in it, and the
 * margin has to absorb that error rather than assume it away. Extra tail costs
 * tokens; a cut tail costs the touchdown.
 */
export const POST_PLAY_MARGIN = 6

/**
 * Narrowing has to be worth it and it has to be safe. A window is only used
 * when it saves a real share of the film AND still leaves enough to read; a
 * locator that returns something implausible is ignored rather than trusted,
 * because charting the wrong ten seconds is worse than charting thirty.
 */
export const MIN_WINDOW_SECONDS = 4
export const MIN_SAVING = 0.15

/**
 * Shorter than this is not a football play.
 *
 * Even a sneak stopped instantly, or a pass batted down at the line, occupies
 * more than a second and a half from snap to whistle. A "play" below that is
 * the locator mistaking a shift or a false start for live football, and
 * padding it into a plausible-looking window is how the charting pass would
 * end up reading four seconds of a minute-long clip and missing the snap
 * entirely.
 */
export const MIN_PLAY_SECONDS = 1.5

export interface ClipWindow {
  startOffsetSeconds: number
  endOffsetSeconds: number
}

export function playWindow(
  plays: LocatedPlay[],
  clipDurationSeconds: number | null,
  existing?: ClipWindow | null
): ClipWindow | null {
  // A play slice the coach already tagged outranks anything a model locates.
  if (existing) return null
  if (!plays.length || !clipDurationSeconds || clipDurationSeconds <= 0) return null

  const usable = plays.filter(
    (p) =>
      Number.isFinite(p.snap_seconds) &&
      Number.isFinite(p.end_seconds) &&
      p.end_seconds - p.snap_seconds >= MIN_PLAY_SECONDS &&
      p.snap_seconds >= 0 &&
      p.snap_seconds < clipDurationSeconds
  )
  if (!usable.length) return null

  const firstSnap = Math.min(...usable.map((p) => p.snap_seconds))
  const lastEnd = Math.max(...usable.map((p) => p.end_seconds))

  const start = Math.max(0, firstSnap - PRE_SNAP_MARGIN)
  const end = Math.min(clipDurationSeconds, lastEnd + POST_PLAY_MARGIN)
  const length = end - start
  if (length < MIN_WINDOW_SECONDS) return null
  if (length > clipDurationSeconds * (1 - MIN_SAVING)) return null

  return { startOffsetSeconds: start, endOffsetSeconds: end }
}

export function parseLocatedPlays(raw: string): LocatedPlay[] {
  try {
    const parsed = JSON.parse(raw) as { plays?: LocatedPlay[] }
    return Array.isArray(parsed.plays) ? parsed.plays : []
  } catch {
    return []
  }
}
