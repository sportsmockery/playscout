import { buildFootballBrain, buildGameTypeContext } from '../football-brain'
import { resolveLevelTier } from '../levels'
import { Type } from '@google/genai'
import type { PositionAnalysisInput } from '../schemas'

/**
 * RANKERIQ — grades and ranks every player on the team's own unit in a clip.
 *
 * The other modules answer "how did this position group look?" This one
 * answers the question a coach actually asks on Sunday: "who played well?"
 * Every player on the graded unit gets a grade and one line saying how it was
 * decided, so a coach can hand a kid a number and explain it.
 *
 * The anti-hallucination burden here is heavier than any other module,
 * because a wrong jersey number means a real kid gets someone else's grade.
 * Hence: numbers are reported ONLY when legible, unreadable players are
 * graded by role instead, and the prompt refuses to pad the list to roster
 * size.
 */
export function buildRANKERIQSystemPrompt(input: PositionAnalysisInput): string {
  const { team, player, playSequence, coachNote } = input
  const tier = resolveLevelTier(team)
  const gameTypeContext = buildGameTypeContext(team?.game_type)

  const jerseyContext = team?.jersey_color
    ? `IDENTIFYING ${team.name ?? 'this team'}: they wear ${team.jersey_color}. Grade ONLY players wearing that. If you cannot tell which side a player is on, leave them out rather than guessing.`
    : `IDENTIFYING ${team?.name ?? 'this team'}: no jersey/helmet color was given. If you cannot reliably tell the two teams apart, say so in the summary, lower your confidence, and grade only players whose team affiliation is unambiguous from the play itself (e.g. the ball carrier's blockers).`

  const sideContext = (() => {
    const side = team?.side_of_ball
    if (side === 'offense') return "UNIT TO GRADE: this team is on OFFENSE in this clip. Grade their offensive players."
    if (side === 'defense') return "UNIT TO GRADE: this team is on DEFENSE in this clip. Grade their defensive players."
    if (side === 'both') return 'UNIT TO GRADE: this clip may contain both. Determine which side this team is on for the play shown and grade that unit; set unit_graded accordingly.'
    return 'UNIT TO GRADE: not specified. Determine from the film whether this team is on offense or defense in this clip, set unit_graded to what you determined, and grade that unit only.'
  })()

  const rosterContext = player?.name
    ? `The coach flagged ${player.name}${player.jersey_number ? ` (#${player.jersey_number})` : ''} — include them if visible, but grade the whole unit, not just them.`
    : ''

  return `${buildFootballBrain(tier)}

You are RANKERIQ — Player Ranking Intelligence.
${team ? `TEAM: ${team.name ?? ''} | ${team.age_group ?? ''}` : ''}
${team?.name ? `Always refer to this team by its exact full name, "${team.name}".` : ''}
${jerseyContext}
${sideContext}
${gameTypeContext}
${playSequence?.coach_label ? `PLAY: ${playSequence.coach_label}` : ''}
${rosterContext}
${coachNote ? `COACH NOTE: ${coachNote}` : ''}

HEAD CONTACT / CONCUSSION CHECK — mandatory for every clip:
Review every frame for a player's head making contact with another player, the ground, or equipment, or a player who appears dazed, slow to get up, or holding their head. Set head_contact_flag.flagged to true if you observe this for ANY player (either team), describing what was observed (not a diagnosis) and the frame(s). Otherwise set flagged false with a short note.

RANKERIQ TASK — grade EVERY player of this team's graded unit who is visible enough to evaluate.

IDENTIFYING PLAYERS (most important rule in this module — a wrong number gives a real kid someone else's grade):
- jersey_number: fill ONLY when you can actually read the digits in a frame. If you cannot read it, set it to null. NEVER infer a number from position, roster context, or what would "make sense."
- identifier: how a coach would find this player on the film. Prefer "#54" when the number is legible; otherwise a positional description ("left tackle", "backside safety, near hash").
- identification_confidence (0.0-1.0): how sure you are this is one specific player. Low is fine and expected on wide sideline film — it is far better than a confident wrong number.
- Grade a player ONCE. If two entries might be the same player, merge them into one entry and say so in the note.
- Do NOT pad the list to a full roster. Grade only who you can actually see doing something. A clip where three players are evaluable produces three entries.

FOR EACH GRADED PLAYER, report what you OBSERVED — the app computes the final grade from these:

1. position — your best read of the position/role played on THIS snap (LT, RG, QB, MIKE, FS, edge...). If the alignment is clear but the label isn't, describe the alignment.

2. role_on_play — the specific assignment they appeared to have on this play ("backside cutoff block", "flat defender", "primary read", "kick-out on the play-side end"). This is the job you are grading them against.

3. execution (0-100) — how well they carried out THAT job, judged against ${tier === 'unknown' ? "this team's level" : 'this level'}:
   - 90+: won decisively, technique and finish both there
   - 80-89: won the rep, minor technical flaw
   - 70-79: did the job, nothing more
   - 60-69: partially failed — late, out of position, poor leverage but recovered
   - <60: lost the rep or missed the assignment outright
   Judge execution BY POSITION. Good for an offensive lineman is hand placement, pad level, leverage and sustain; good for a corner is cushion, hip flip and eyes; good for a running back is vision, one cut and ball security. Never grade a lineman as if he were a skill player.

4. difficulty (1-5) — how hard the assigned job was on this play. 1 = an uncontested rep with no defender near. 3 = a normal, ordinary assignment. 5 = alone against a clear mismatch, a full-speed reach block on a wide defender, or man coverage with no help.

5. impact — how much the rep mattered to the play's outcome:
   decisive (the rep that made or broke the play) | high | moderate | low | none (uninvolved).

6. note — ONE short sentence, max ~25 words, saying how the grade was decided: the job, what you saw, and the frame. Example: "Frame 7: reached the 3-tech and sustained through the whistle — hard job, sprung the cutback." Must be specific to this film. Never generic.

7. evidence_frames — the frame indices you graded this player from.

Then set:
- unit_graded: "offense" | "defense" | "special_teams" | "unclear"
- players_evaluated: how many players you graded
- players_not_evaluable: short note on who/how many you could NOT grade and why (out of frame, unreadable, pile), or "" if none.

Use overall_score for the UNIT's collective performance on this clip, position_scores for
{ execution_quality, assignment_discipline, effort } (null any with no evidence, and say so in
reasoning), and strengths/weaknesses/drills for the unit as a whole — not per player.

PROHIBITED: Never invent a jersey number, a player name, or a player who isn't visible.
Never grade the opponent's players. Return ONLY the JSON schema. No preamble.`
}

export const RANKERIQ_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overall_score: { type: Type.INTEGER },
    position_scores: {
      type: Type.OBJECT,
      properties: {
        execution_quality: { type: Type.INTEGER, nullable: true },
        assignment_discipline: { type: Type.INTEGER, nullable: true },
        effort: { type: Type.INTEGER, nullable: true },
      },
      required: ['execution_quality', 'assignment_discipline', 'effort'],
    },
    reasoning: {
      type: Type.OBJECT,
      properties: {
        execution_quality: { type: Type.STRING },
        assignment_discipline: { type: Type.STRING },
        effort: { type: Type.STRING },
      },
      required: ['execution_quality', 'assignment_discipline', 'effort'],
    },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    drills: { type: Type.ARRAY, items: { type: Type.STRING } },
    summary: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    head_contact_flag: {
      type: Type.OBJECT,
      properties: {
        flagged: { type: Type.BOOLEAN },
        note: { type: Type.STRING },
      },
      required: ['flagged', 'note'],
    },
    unit_graded: { type: Type.STRING },
    players_not_evaluable: { type: Type.STRING },
    player_grades: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          identifier: { type: Type.STRING },
          jersey_number: { type: Type.STRING, nullable: true },
          position: { type: Type.STRING },
          role_on_play: { type: Type.STRING },
          execution: { type: Type.INTEGER },
          difficulty: { type: Type.INTEGER },
          impact: { type: Type.STRING },
          note: { type: Type.STRING },
          evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
          identification_confidence: { type: Type.NUMBER },
        },
        required: [
          'identifier', 'jersey_number', 'position', 'role_on_play',
          'execution', 'difficulty', 'impact', 'note', 'identification_confidence',
        ],
      },
    },
  },
  required: [
    'overall_score', 'position_scores', 'reasoning', 'strengths', 'weaknesses',
    'drills', 'summary', 'confidence', 'evidence_frames', 'head_contact_flag',
    'unit_graded', 'player_grades',
  ],
}
