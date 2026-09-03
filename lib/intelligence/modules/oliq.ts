import { buildFootballBrain, buildGameTypeContext } from '../football-brain'
import { resolveLevelTier } from '../levels'
import { Type } from '@google/genai'
import type { ModulePromptInput } from '../schemas'
import { buildPlayContext } from '../play-context'
import { buildBreakdownPrompt, REP_BREAKDOWN_SCHEMA } from '../breakdown'
import { CONFIDENCE_PROMPT, SUBJECT_IDENTIFICATION, VIEW_QUALITY } from '../confidence'
import { OLIQ_CUES, OLIQ_RUBRIC, buildRubricPrompt, buildDrillMenuPrompt, drillMenuFor, allCueIds } from '../rubrics'

export function buildOLIQSystemPrompt(input: ModulePromptInput): string {
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
Calibrate expectations to this athlete's age and level.`
    : 'ATHLETE PROFILE: No profile provided. Grade the offensive lineman in the clip against age-appropriate fundamentals. If you cannot determine which lineman is the subject, say which one you graded and why.'

  const teamContext = team ? `TEAM: ${team.name ?? ''} | ${team.age_group ?? ''}` : ''
  const playContext = buildPlayContext(playSequence)
  const noteContext = coachNote ? `COACH NOTE: ${coachNote}` : ''

  // The menu is filtered to this team's allowed contact level BEFORE it is
  // rendered, so a flag team is never shown a live-contact drill to pick
  // from. safety.ts still screens the output as a backstop.
  const drillMenu = buildDrillMenuPrompt(
    drillMenuFor({ cueIds: allCueIds(OLIQ_RUBRIC), gameType: team?.game_type, tier })
  )

  return `${buildFootballBrain(tier, input.evidenceMode)}

You are OLIQ — Offensive Line Intelligence.
${playerProfile}
${teamContext}
${gameTypeContext}
${playContext}
${noteContext}

${buildRubricPrompt(OLIQ_RUBRIC, tier)}

${drillMenu}

${CONFIDENCE_PROMPT}

${buildBreakdownPrompt(OLIQ_CUES, input.evidenceMode)}

Return ONLY the JSON schema. No preamble.`
}

export const OLIQ_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    position_scores: {
      type: Type.OBJECT,
      properties: {
        pass_protection: { type: Type.INTEGER, nullable: true },
        run_blocking: { type: Type.INTEGER, nullable: true },
        footwork_leverage: { type: Type.INTEGER, nullable: true },
      },
      required: ['pass_protection', 'run_blocking', 'footwork_leverage'],
    },
    reasoning: {
      type: Type.OBJECT,
      properties: {
        pass_protection: { type: Type.STRING },
        run_blocking: { type: Type.STRING },
        footwork_leverage: { type: Type.STRING },
      },
      required: ['pass_protection', 'run_blocking', 'footwork_leverage'],
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
