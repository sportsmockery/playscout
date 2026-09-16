import type { ModulePromptInput } from './schemas'

/**
 * The roster block, shared by every module that may report a jersey number.
 *
 * The roster is given to the model as a CLOSED SET, never as a lookup table.
 * "These are the only numbers that exist" constrains a misread toward null;
 * "the left guard is #54" would invite exactly the inference that produced
 * fabricated numbers in the first place. The wording below is deliberate
 * about that difference.
 *
 * Lifted out of modules/rankeriq.ts verbatim when StatsIQ needed the same
 * guarantee: a stat counted for the wrong jersey does the same damage as a
 * grade given to the wrong jersey, and two copies of this reasoning would
 * drift apart the first time either was edited.
 */
export interface RosterContextOptions {
  /**
   * Whether a number with no roster behind it is still worth reporting.
   *
   * Off (RankerIQ): a grade lands on a child, so an unverifiable number is
   * refused outright. On (StatsIQ): a count is checkable by the coach who was
   * at the game, so a number the camera plainly showed is reported and marked
   * unverified rather than thrown away. See IdentityOptions in
   * player-grades.ts, which enforces the same split on the output.
   */
  allowUnverifiedNumbers?: boolean
}

export function buildRosterContext(
  roster: ModulePromptInput['roster'],
  filmConditions: ModulePromptInput['filmConditions'],
  opts: RosterContextOptions = {}
): string {
  if (filmConditions === 'scrimmage') {
    return `FILM CONDITIONS: SCRIMMAGE / PRACTICE FILM. Players may be wearing practice pinnies, a
teammate's jersey, or no number at all, so a number on the field does not identify anyone here.
Set jersey_number to null for EVERY player in this clip and identify everyone by role. This is
expected — do not treat it as a limitation worth apologising for.`
  }

  if (!roster?.length) {
    return opts.allowUnverifiedNumbers
      ? `NO ROSTER ON FILE: this team has not entered a roster, so there is no list to check a
number against. Report a number ONLY where you can point to the frame you read the digits in —
that bar does not move because there is no roster; it is the only bar left. Everything the app
shows from such a number is labelled unverified, and everyone else is identified by position,
which is the normal case on this kind of film.`
      : `NO ROSTER ON FILE: this team has not entered a roster, so no jersey number can be
verified against anything. Set jersey_number to null for EVERY player and identify everyone by
role. Do not report numbers you think you can read — without a roster they cannot be checked.`
  }

  const listed = roster
    .filter((p) => p.jersey_number)
    .map((p) => `#${p.jersey_number}${p.position ? ` (${p.position})` : ''}`)
    .join(', ')
  const positions = [...new Set(roster.map((p) => p.position).filter(Boolean))].join(', ')

  return `TEAM ROSTER — the ONLY jersey numbers that exist on this team:
${listed || '(no numbers recorded on the roster)'}

How to use it — read carefully, this is a constraint, not a lookup table:
- If you read digits that are NOT in that list, you misread them. Set jersey_number to null.
- The list does NOT tell you who is who. NEVER assign a number because the roster says a player
  at that position wears it. Two players line up at the same spot across a game; the roster
  cannot tell you which one is on the field in this clip.
- A player wearing no visible number, or one you cannot resolve, is null — the roster does not
  change that.
${positions ? `- The coach's position vocabulary for this team: ${positions}. Use these words for roles where they fit.` : ''}`
}
