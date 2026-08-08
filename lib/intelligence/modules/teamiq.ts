import { buildFootballBrain, buildGameTypeContext } from '../football-brain'
import { resolveLevelTier } from '../levels'
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
      return `SIDE OF BALL — AUTHORITATIVE: In this clip ${teamLabel}${jersey} is the OFFENSE (they have the ball). Analyze THEIR offensive tendencies. The team on defense is the OPPONENT — do not grade the opponent's defense as ${teamLabel}. Report no defensive_tendencies entries; note in the summary that no defensive snaps by ${teamLabel} were observed.`
    case 'defense':
      return `SIDE OF BALL — AUTHORITATIVE: In this clip ${teamLabel}${jersey} is the DEFENSE (the other team has the ball). Analyze THEIR defensive tendencies. The team on offense is the OPPONENT — do not grade the opponent's offense as ${teamLabel}. Report no offensive_tendencies entries; note in the summary that no offensive snaps by ${teamLabel} were observed.`
    case 'both':
      return `SIDE OF BALL: ${teamLabel}${jersey} appears on both offense and defense in this clip. For each snap, first confirm ${teamLabel} is the unit you are grading before attributing any tendency to them.`
    default:
      return `SIDE OF BALL: The coach did not specify which side of the ball ${teamLabel}${jersey} plays in this clip. Determine it from the jersey/helmet color, and if you cannot tell which snaps belong to ${teamLabel}, say so rather than guessing.`
  }
}

export function buildTEAMIQSystemPrompt(input: PositionAnalysisInput): string {
  const { team, playSequence, coachNote } = input
  const tier = resolveLevelTier(team)
  const teamLabel = team?.name ?? 'the subject team'

  const jerseyContext = team?.jersey_color
    ? `IDENTIFYING ${teamLabel}: they wear ${team.jersey_color}. Use this to tell them apart from the opponent in every frame. The ${team.jersey_color} players ARE the subject team; everyone else is the opponent.`
    : `IDENTIFYING ${teamLabel}: no jersey/helmet color was provided, and nothing else in this context identifies which players belong to them. Do not guess. If you cannot tell the two sides apart from the frames alone, say so explicitly and do not assert which side is offense/defense, or attribute any tendency to "the team" — describe only what is generically visible instead.`

  const sideContext = buildSideContext(team?.side_of_ball, teamLabel, team?.jersey_color)
  const gameTypeContext = buildGameTypeContext(team?.game_type)

  return `${buildFootballBrain(tier)}

You are TEAMIQ — Team Intelligence.
${team ? `TEAM: ${team.name ?? ''} | ${team.age_group ?? ''} | Offense: ${team.offensive_style ?? 'unknown'} | Defense: ${team.defensive_style ?? 'unknown'}` : ''}
${team?.name ? `Always refer to this team by its exact full name, "${team.name}" — do not shorten, abbreviate, or drop any part of it in your summary or reasoning.` : ''}
${jerseyContext}
${gameTypeContext}
${sideContext}
${playSequence?.coach_label ? `CONTEXT: ${playSequence.coach_label}` : ''}
${coachNote ? `COACH NOTE: ${coachNote}` : ''}

CRITICAL — SUBJECT TEAM ANCHORING:
- Every tendency, formation, strength, and weakness must describe ${teamLabel} — never the opponent.
- Do not silently switch the subject to whichever team happens to be more visible or made the highlight play. If a frame shows the opponent doing something, that is context, not a ${teamLabel} tendency.
- If the coach told you which side of the ball ${teamLabel} is on (see SIDE OF BALL above), that is authoritative — trust it over your own read of the frames.

TEAMIQ RUBRIC — this module reports FREQUENCY, not quality. How often a team does
something is not how well they do it — never present a tendency as a 0-100 score.
The only 0-100 score in this module is execution_consistency (how cleanly ${teamLabel}
executed its own assignments, regardless of scheme) — this is a genuine quality
judgment, everything else below is an observation with a rate/confidence/sample size.

For each tendency you report (in offensive_tendencies / defensive_tendencies), use one
of these tendency_type values where it applies, or a short snake_case type if none fit:
  Offense: formation_frequency, run_direction, play_family, motion_frequency, down_distance_tendency
  Defense: front, coverage_shell, blitz_tendency, edge_setting, pursuit_angle
For each: label (short name), rate (0.0-1.0 share of observed plays, or null if not a
rate-style tendency), confidence (0.0-1.0), sample_size (plays this tendency was
observed across), description (1 sentence, evidence-based).
Example: { tendency_type: "run_direction", label: "Runs right", rate: 0.71,
confidence: 0.62, sample_size: 14, description: "12 of 14 observed runs went to the
offense's right side, often out of a tight double wing." }

formations: distinct formations ${teamLabel} lined up in (name + which side + a note).
explosive_plays: any big play and the alignment/leverage cause that created it, with
evidence_frames.
situational_tells: situational patterns (e.g. "3rd and short", "red zone") and what
${teamLabel} tends to do in that situation.
attack_points: concrete, evidence-based things an opponent could exploit — only include
what the frames actually support.

SAMPLE SIZE — plays_observed = the number of DISTINCT snaps/plays visible across these
frames (a single continuous play from snap to whistle counts as 1). This caps confidence:
- If plays_observed is 1, every tendency describes a single play, NOT a season tendency.
  Cap confidence at roughly 0.4 for every tendency and say so in its description.
- Never inflate plays_observed or any tendency's sample_size beyond what the frames show.
- Never invent a tendency not visible in the frames.

Return ONLY the JSON schema. No preamble.`
}

const TENDENCY_ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tendency_type: { type: Type.STRING },
    label: { type: Type.STRING },
    rate: { type: Type.NUMBER, nullable: true },
    confidence: { type: Type.NUMBER },
    sample_size: { type: Type.INTEGER },
    description: { type: Type.STRING },
  },
  required: ['tendency_type', 'label', 'rate', 'confidence', 'sample_size', 'description'],
}

export const TEAMIQ_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overall_score: { type: Type.INTEGER },
    position_scores: {
      type: Type.OBJECT,
      properties: {
        execution_consistency: { type: Type.INTEGER, nullable: true },
      },
      required: ['execution_consistency'],
    },
    reasoning: {
      type: Type.OBJECT,
      properties: {
        execution_consistency: { type: Type.STRING },
      },
      required: ['execution_consistency'],
    },
    offensive_tendencies: { type: Type.ARRAY, items: TENDENCY_ITEM_SCHEMA },
    defensive_tendencies: { type: Type.ARRAY, items: TENDENCY_ITEM_SCHEMA },
    formations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          side: { type: Type.STRING },
          note: { type: Type.STRING },
        },
        required: ['name'],
      },
    },
    explosive_plays: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          cause: { type: Type.STRING },
          description: { type: Type.STRING },
          evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
        },
        required: ['cause', 'description'],
      },
    },
    situational_tells: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          situation: { type: Type.STRING },
          tell: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
        },
        required: ['situation', 'tell'],
      },
    },
    attack_points: { type: Type.ARRAY, items: { type: Type.STRING } },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    drills: { type: Type.ARRAY, items: { type: Type.STRING } },
    summary: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    plays_observed: { type: Type.INTEGER },
    evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
  },
  required: [
    'overall_score', 'position_scores', 'reasoning',
    'offensive_tendencies', 'defensive_tendencies', 'formations', 'explosive_plays', 'situational_tells', 'attack_points',
    'strengths', 'weaknesses', 'drills', 'summary', 'confidence', 'plays_observed', 'evidence_frames',
  ],
}
