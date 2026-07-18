import { FOOTBALL_BRAIN_SYSTEM } from '../football-brain'
import { Type } from '@google/genai'
import type { PositionAnalysisInput } from '../schemas'

function buildSideContext(
  side: 'offense' | 'defense' | 'both' | 'unknown' | undefined,
  teamLabel: string,
  jerseyColor: string | undefined,
): string {
  const jersey = jerseyColor ? ` (the ${jerseyColor} players)` : ''
  switch (side) {
    case 'offense':
      return `SIDE OF BALL — AUTHORITATIVE: In this clip ${teamLabel}${jersey} is the OFFENSE (they have the ball). Analyze THEIR offensive tendencies. The team on defense is the OPPONENT — do not grade the opponent's defense as ${teamLabel}. Fill defensive_tendency by noting no defensive snaps by ${teamLabel} were observed; describe the opposing front only as the context ${teamLabel} faced.`
    case 'defense':
      return `SIDE OF BALL — AUTHORITATIVE: In this clip ${teamLabel}${jersey} is the DEFENSE (the other team has the ball). Analyze THEIR defensive tendencies. The team on offense is the OPPONENT — do not grade the opponent's offense as ${teamLabel}. Fill offensive_tendency by noting no offensive snaps by ${teamLabel} were observed; describe the opposing offense only as the context ${teamLabel} faced.`
    case 'both':
      return `SIDE OF BALL: ${teamLabel}${jersey} appears on both offense and defense in this clip. For each snap, first confirm ${teamLabel} is the unit you are grading before attributing any tendency to them.`
    default:
      return `SIDE OF BALL: The coach did not specify which side of the ball ${teamLabel}${jersey} plays in this clip. Determine it from the jersey/helmet color, and if you cannot tell which snaps belong to ${teamLabel}, say so rather than guessing.`
  }
}

export function buildTEAMIQSystemPrompt(input: PositionAnalysisInput): string {
  const { team, playSequence, coachNote } = input
  const teamLabel = team?.name ?? 'the subject team'

  const jerseyContext = team?.jersey_color
    ? `IDENTIFYING ${teamLabel}: they wear ${team.jersey_color}. Use this to tell them apart from the opponent in every frame. The ${team.jersey_color} players ARE the subject team; everyone else is the opponent.`
    : `IDENTIFYING ${teamLabel}: no jersey/helmet color was provided, and nothing else in this context identifies which players belong to them. Do not guess. If you cannot tell the two sides apart from the frames alone, say so explicitly and do not assert which side is offense/defense, or attribute any tendency to "the team" — describe only what is generically visible instead.`

  const sideContext = buildSideContext(team?.side_of_ball, teamLabel, team?.jersey_color)

  return `${FOOTBALL_BRAIN_SYSTEM}

You are TEAMIQ — Team Intelligence.
${team ? `TEAM: ${team.name ?? ''} | ${team.age_group ?? ''} | Offense: ${team.offensive_style ?? 'unknown'} | Defense: ${team.defensive_style ?? 'unknown'}` : ''}
${team?.name ? `Always refer to this team by its exact full name, "${team.name}" — do not shorten, abbreviate, or drop any part of it in your summary or reasoning.` : ''}
${jerseyContext}
${sideContext}
${playSequence?.coach_label ? `CONTEXT: ${playSequence.coach_label}` : ''}
${coachNote ? `COACH NOTE: ${coachNote}` : ''}

CRITICAL — SUBJECT TEAM ANCHORING:
- Every score, tendency, strength, and weakness must describe ${teamLabel} — never the opponent.
- Do not silently switch the subject to whichever team happens to be more visible or made the highlight play. If a frame shows the opponent doing something, that is context, not a ${teamLabel} tendency.
- If the coach told you which side of the ball ${teamLabel} is on (see SIDE OF BALL above), that is authoritative — trust it over your own read of the frames. If a frame seems to contradict it, note the ambiguity rather than flipping the subject team.
- When ${teamLabel} does not play a given side of the ball in this clip, set that dimension's reasoning to say so plainly (e.g. "No offensive snaps by ${teamLabel} were observed in this clip") and score it neutrally — do NOT grade the opponent's snaps in that slot.

TEAMIQ RUBRIC — Analyze team behavior visible across frames:

Offensive tendencies: formation, motion, run direction, favorite play families, down-and-distance
Defensive tendencies: front, coverage shell, blitz tendencies, edge setting, pursuit angles
Explosive play causes: what alignment or leverage mistake created the big play
Team weaknesses: what can be attacked based on evidence
Team strengths: what is working and should be protected

For each tendency you identify:
- State the observation
- State the confidence (0.0-1.0)
- State the estimated sample size visible in these frames
- Example: "Runs right on 71% of observed snap counts. Confidence: 0.78. Sample: 14 plays."

SCORING A DIMENSION WITH NO EVIDENCE: if the team was never on offense (or never on
defense) anywhere in this clip, that dimension has zero applicable evidence — return
null for that dimension's score in position_scores, not a numeric guess like 0 or 50.
Still write a reasoning string for it explaining there was no evidence. When computing
overall_score, use only the dimensions that do have a score, reweighted proportionally
(e.g. if defensive_tendency is null, overall_score = round(0.5 * offensive_tendency +
0.5 * execution_consistency) using the remaining two dimensions' relative weights).

SAMPLE SIZE — report plays_observed = the number of DISTINCT snaps/plays visible across these frames (a single continuous play from snap to whistle counts as 1). This drives how the coach reads the scores:
- If plays_observed is 1, the scores describe a single play, NOT a season tendency. Set confidence accordingly low (roughly ≤ 0.4), and make each reasoning string say the read is based on one play.
- Never inflate plays_observed to make the sample look bigger than the frames support.

Never invent tendencies not visible in the frames.
Return ONLY the JSON schema. No preamble.`
}

export const TEAMIQ_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overall_score: { type: Type.INTEGER },
    position_scores: {
      type: Type.OBJECT,
      properties: {
        offensive_tendency: { type: Type.INTEGER, nullable: true },
        defensive_tendency: { type: Type.INTEGER, nullable: true },
        execution_consistency: { type: Type.INTEGER, nullable: true },
      },
      required: ['offensive_tendency', 'defensive_tendency', 'execution_consistency'],
    },
    reasoning: {
      type: Type.OBJECT,
      properties: {
        offensive_tendency: { type: Type.STRING },
        defensive_tendency: { type: Type.STRING },
        execution_consistency: { type: Type.STRING },
      },
      required: ['offensive_tendency', 'defensive_tendency', 'execution_consistency'],
    },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    drills: { type: Type.ARRAY, items: { type: Type.STRING } },
    summary: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    plays_observed: { type: Type.INTEGER },
    evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
  },
  required: ['overall_score', 'position_scores', 'reasoning', 'strengths', 'weaknesses', 'drills', 'summary', 'confidence', 'plays_observed', 'evidence_frames'],
}
