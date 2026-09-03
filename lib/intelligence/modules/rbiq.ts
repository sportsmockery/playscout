import { buildFootballBrain, buildGameTypeContext } from '../football-brain'
import { resolveLevelTier } from '../levels'
import { Type } from '@google/genai'
import type { ModulePromptInput } from '../schemas'
import { buildPlayContext } from '../play-context'
import { buildBreakdownPrompt, REP_BREAKDOWN_SCHEMA } from '../breakdown'
import { CONFIDENCE_PROMPT, SUBJECT_IDENTIFICATION, VIEW_QUALITY } from '../confidence'
import { RBIQ_CUES, RBIQ_RUBRIC, buildRubricPrompt, buildDrillMenuPrompt, drillMenuFor, allCueIds } from '../rubrics'

export function buildRBIQSystemPrompt(input: ModulePromptInput): string {
  const { player, team, playSequence, coachNote } = input
  const tier = resolveLevelTier(team)
  const gameTypeContext = buildGameTypeContext(team?.game_type)

  const playerProfile = player && (player.name || player.position)
    ? `ATHLETE PROFILE:
${player.name ? `- Name: ${player.name}` : ''}
${player.position ? `- Position: ${player.position}` : ''}
${player.jersey_number ? `- Jersey: #${player.jersey_number}` : ''}
${player.age_group ? `- Age group: ${player.age_group}` : ''}
${player.notes ? `- Coach notes: ${player.notes}` : ''}
Calibrate expectations to this team's competition level (see COMPETITION LEVEL above): youth on age-appropriate fundamentals, varsity on next-level/college-bound standards.`
    : 'ATHLETE PROFILE: No specific profile provided. Grade the running back visible in the clip against the standards appropriate to the team competition level (see the level calibration above). If you cannot determine which back is the subject (e.g. multiple backs in the backfield), say which one you graded and why. If age/level is unclear from frames, state that assumption.'

  const teamContext = team
    ? `TEAM CONTEXT: ${team.name ?? 'Unknown team'} | ${team.age_group ?? ''} | ${team.offensive_style ?? ''}`
    : ''

  const playContext = buildPlayContext(playSequence)

  const noteContext = coachNote ? `COACH NOTE: ${coachNote}` : ''

  // The menu is filtered to this team's allowed contact level BEFORE it is
  // rendered, so a flag team is never shown a live-contact drill to pick
  // from. safety.ts still screens the output as a backstop.
  const drillMenu = buildDrillMenuPrompt(
    drillMenuFor({ cueIds: allCueIds(RBIQ_RUBRIC), gameType: team?.game_type, tier })
  )

  return `${buildFootballBrain(tier, input.evidenceMode)}

You are RBIQ — Running Back Intelligence.
${playerProfile}
${teamContext}
${gameTypeContext}
${playContext}
${noteContext}

${buildRubricPrompt(RBIQ_RUBRIC, tier)}

${drillMenu}

${CONFIDENCE_PROMPT}

${buildBreakdownPrompt(RBIQ_CUES, input.evidenceMode)}

Return ONLY the JSON schema. No preamble.`
}

export const RBIQ_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    position_scores: {
      type: Type.OBJECT,
      properties: {
        vision_decision: { type: Type.INTEGER, nullable: true },
        ball_security: { type: Type.INTEGER, nullable: true },
        footwork_contact: { type: Type.INTEGER, nullable: true },
      },
      required: ['vision_decision', 'ball_security', 'footwork_contact'],
    },
    reasoning: {
      type: Type.OBJECT,
      properties: {
        vision_decision: { type: Type.STRING },
        ball_security: { type: Type.STRING },
        footwork_contact: { type: Type.STRING },
      },
      required: ['vision_decision', 'ball_security', 'footwork_contact'],
    },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    drills: { type: Type.ARRAY, items: { type: Type.STRING } },
    summary: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    evidence_timestamps: { type: Type.ARRAY, items: { type: Type.NUMBER } },
    breakdown: REP_BREAKDOWN_SCHEMA,
    confidence_signals: {
      type: Type.OBJECT,
      properties: {
        subject_identified: { type: Type.STRING, enum: [...SUBJECT_IDENTIFICATION] },
        view_quality: { type: Type.STRING, enum: [...VIEW_QUALITY] },
        criteria_visible: { type: Type.INTEGER },
        criteria_attempted: { type: Type.INTEGER },
        occlusion_events: { type: Type.INTEGER },
      },
      required: ['subject_identified', 'view_quality', 'criteria_visible', 'criteria_attempted'],
    },
    prescriptions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          drill_id: { type: Type.STRING },
          fixes_cue: { type: Type.STRING },
          why_this_rep: { type: Type.STRING },
        },
        required: ['drill_id', 'fixes_cue', 'why_this_rep'],
      },
    },
  },
  required: ['position_scores', 'reasoning', 'strengths', 'weaknesses', 'drills', 'summary', 'confidence', 'evidence_frames', 'breakdown', 'prescriptions', 'confidence_signals'],
}
