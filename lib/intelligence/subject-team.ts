/**
 * Which team on the field is OURS.
 *
 * RankerIQ, StatsIQ, TeamIQ and MistakeIQ each grew their own version of this
 * paragraph. QBIQ, OLIQ and RBIQ — the three modules that grade ONE NAMED
 * CHILD — had none at all. Their prompts hand the model a name, a position and
 * a jersey number and then say "grade the quarterback visible in the clip", and
 * on film with two teams there are two quarterbacks.
 *
 * That failure is silent and total: the report comes back fluent, detailed and
 * about somebody else's kid, filed under yours. Nothing downstream can catch it
 * — a grade carries no marker saying which sideline it came from.
 *
 * One helper, so the four that had it and the three that did not now say the
 * same thing, and a module added later gets it by importing rather than by
 * remembering.
 *
 * WHAT THIS IS NOT. Setting the colour was measured on StatsIQ and did NOT fix
 * the READ — the charting pass called a completed pass an interception three
 * times out of three with the right colour set. This is a different job: not
 * reading the play better, but grading the right team at all. Do not let the
 * StatsIQ result argue against supplying it, and do not expect it to sharpen
 * anything else.
 */

export interface SubjectTeam {
  name?: string | null
  jersey_color?: string | null
}

/**
 * @param subjectDescription what the module grades — "players", "the
 *   quarterback", "the offensive line" — so the sentence reads naturally and
 *   names the actual subject rather than a generic one.
 */
export function buildSubjectTeamContext(
  team: SubjectTeam | null | undefined,
  subjectDescription: string
): string {
  const label = team?.name ?? 'this team'

  if (team?.jersey_color) {
    return `IDENTIFYING ${label}: they wear ${team.jersey_color} in this film. Grade ONLY ${subjectDescription} wearing that. The other team on the field is the opponent and must not be graded, however clearly you can see them — a grade on the wrong player is worse than no grade, because it reaches a real child under someone else's name.`
  }

  return `IDENTIFYING ${label}: no jersey or helmet colour was given, so work out which side is theirs from the play itself — who the ball carrier's blockers are, which way the unit is going, which bench they run to. Grade ${subjectDescription} only where that is unambiguous. If you cannot tell the two teams apart, say so plainly in the summary and lower your confidence rather than grading whoever is easiest to see.`
}
