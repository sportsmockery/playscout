import { z } from 'zod'
import { Type } from '@google/genai'
import type { EvidenceMode } from './football-brain'
import { RepBreakdownSchema, type RepBreakdown } from './breakdown'

export type IntelligenceModuleKey =
  | 'QBIQ' | 'OLIQ' | 'RBIQ' | 'WRIQ' | 'DLIQ' | 'LBIQ' | 'DBIQ'
  | 'TEAMIQ' | 'MISTAKEIQ' | 'SCOUTIQ' | 'PRACTICEIQ' | 'RANKERIQ'

export const PositionAnalysisInputSchema = z.object({
  moduleKey: z.string(),
  teamId: z.string(),
  playerId: z.string().optional(),
  videoId: z.string().optional(),
  playSequenceId: z.string().optional(),
  frames: z.array(z.string()).optional().default([]),
  coachNote: z.string().optional(),
  pdf: z.object({ name: z.string().optional(), data: z.string() }).optional(),
  player: z.object({
    name: z.string().optional(),
    position: z.string().optional(),
    jersey_number: z.string().optional(),
    age_group: z.string().optional(),
    grade_level: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
  team: z.object({
    name: z.string().optional(),
    age_group: z.string().optional(),
    // Competition level ("High School", "College", ...) — combined with
    // age_group to calibrate grading from youth through varsity.
    level: z.string().optional(),
    season: z.string().optional(),
    offensive_style: z.string().optional(),
    defensive_style: z.string().optional(),
    jersey_color: z.string().optional(),
    side_of_ball: z.enum(['offense', 'defense', 'both', 'unknown']).optional(),
    game_type: z.enum(['flag', 'tackle', 'rookie_tackle']).optional(),
  }).optional(),
  playSequence: z.object({
    down: z.number().optional(),
    distance: z.number().optional(),
    yard_line: z.string().optional(),
    coach_label: z.string().optional(),
  }).optional(),
  /**
   * RANKERIQ only. Populated SERVER-SIDE in analyze-position.ts from the
   * team's players table — never trusted from the client, since it is what
   * decides which jersey numbers are allowed to exist.
   */
  roster: z.array(z.object({
    jersey_number: z.string().nullable().optional(),
    position: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
  })).optional(),
  /**
   * Scrimmage and practice film is shot with pinnies and mismatched jerseys —
   * a number on the field may belong to a different player on the roster, so
   * a "match" proves nothing. The coach flags it and numbers are not claimed
   * at all.
   */
  filmConditions: z.enum(['game', 'scrimmage', 'unknown']).optional(),
  // SCOUTIQ only — the opponent is the analysis SUBJECT, distinct from
  // `team` (the coach's own team, used as context/anchoring, never graded).
  opponentId: z.string().optional(),
  opponent: z.object({
    name: z.string().optional(),
    age_group: z.string().optional(),
    jersey_color: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
})

export type PositionAnalysisInput = z.infer<typeof PositionAnalysisInputSchema>

/**
 * What a module's prompt builder receives. `evidenceMode` is decided
 * server-side in analyze-position.ts — never sent by a client — and says
 * whether the model is being handed the clip itself or a labelled set of
 * stills. It changes what a citation is, so it has to reach the prompt.
 */
export type ModulePromptInput = PositionAnalysisInput & {
  evidenceMode?: EvidenceMode
}

/**
 * Validates the MODEL's output, not user input — the JSON.parse in
 * analyze-position.ts only catches syntax errors; this catches a
 * syntactically-valid-but-wrong-shape response (missing field, a string
 * where a number was expected) before it becomes a report a coach reads as
 * ground truth. See CLAUDE.md rule 5: "Zod validation on inputs AND AI
 * outputs."
 */
// A single frequency/tendency observation — not a quality score. rate is a
// 0-1 share of observed plays where applicable (e.g. "runs right"); null
// when the tendency isn't a rate (e.g. a one-off formation note).
export const TendencySchema = z.object({
  tendency_type: z.string(),
  label: z.string(),
  rate: z.number().nullable().optional(),
  confidence: z.number(),
  sample_size: z.number(),
  description: z.string(),
})
export type Tendency = z.infer<typeof TendencySchema>

export const MISTAKE_CATEGORIES = [
  'missed_assignment', 'missed_block', 'missed_contain', 'wrong_gap_fit',
  'bad_pursuit_angle', 'poor_tackling_leverage', 'turnover_risk', 'snap_mesh_issue',
  'alignment_error', 'coverage_bust', 'penalty_risk', 'poor_effort', 'clock_situation_error',
] as const

export const MistakeItemSchema = z.object({
  title: z.string(),
  severity: z.enum(['minor', 'moderate', 'major', 'game_changing']),
  category: z.string(),
  description: z.string(),
  likely_impact: z.string(),
  correction: z.string(),
  drill: z.string().optional(),
  evidence_frames: z.array(z.number()).optional(),
  confidence: z.number(),
})
export type MistakeItem = z.infer<typeof MistakeItemSchema>

/**
 * RANKERIQ — one graded rep for one player in one clip.
 *
 * The model supplies the observations (execution/difficulty/impact) and the
 * identification; `grade`, `letter`, `rank` and `player_id` are computed
 * server-side in lib/intelligence/player-grades.ts so grades stay comparable
 * across clips and a jersey number is never matched to the wrong kid.
 */
export const PlayerGradeSchema = z.object({
  identifier: z.string(),
  jersey_number: z.string().nullable().optional(),
  // The frame where the digits were actually read. A number with no frame
  // behind it is a guess, and resolvePlayerIdentity discards it — asking for
  // the frame makes fabrication cost the model something.
  jersey_number_frame: z.number().nullable().optional(),
  position: z.string(),
  role_on_play: z.string(),
  execution: z.number(),
  difficulty: z.number(),
  impact: z.string(),
  note: z.string(),
  evidence_frames: z.array(z.number()).optional(),
  identification_confidence: z.number(),
  // Computed after validation — never trusted from the model.
  grade: z.number().optional(),
  letter: z.string().optional(),
  rank: z.number().optional(),
  player_id: z.string().nullable().optional(),
  /** Set when a reported number failed verification and was discarded. */
  number_rejected_reason: z.string().nullable().optional(),
})
export type PlayerGrade = z.infer<typeof PlayerGradeSchema>

export const PositionAnalysisOutputSchema = z.object({
  overall_score: z.number(),
  position_scores: z.record(z.string(), z.number().nullable()),
  reasoning: z.record(z.string(), z.string()),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  drills: z.array(z.string()),
  summary: z.string(),
  confidence: z.number().optional(),
  evidence_frames: z.array(z.number()).optional(),
  /**
   * Seconds from the start of the clip the model was shown. This is the
   * citation channel in video mode, where there are no frame indexes to
   * cite — and it is what lets the UI seek a coach to the moment being
   * described instead of showing a thumbnail they have to place themselves.
   */
  evidence_timestamps: z.array(z.number()).optional(),
  /** The per-rep film breakdown — see lib/intelligence/breakdown.ts. */
  breakdown: RepBreakdownSchema.optional(),
  plays_observed: z.number().optional(),
  head_contact_flag: z.object({ flagged: z.boolean(), note: z.string() }).optional(),
  // TEAMIQ / SCOUTIQ structured breakdown — frequency tendencies, never
  // presented as 0-100 quality scores (that's a category error: how often a
  // team does something isn't how well they do it).
  offensive_tendencies: z.array(TendencySchema).optional(),
  defensive_tendencies: z.array(TendencySchema).optional(),
  formations: z.array(z.object({
    name: z.string(),
    side: z.string().optional(),
    note: z.string().optional(),
  })).optional(),
  explosive_plays: z.array(z.object({
    cause: z.string(),
    description: z.string(),
    evidence_frames: z.array(z.number()).optional(),
  })).optional(),
  situational_tells: z.array(z.object({
    situation: z.string(),
    tell: z.string(),
    confidence: z.number().optional(),
  })).optional(),
  attack_points: z.array(z.string()).optional(),
  // MISTAKEIQ per-mistake taxonomy — written one row per item to
  // mistake_events (see lib/intelligence/persist-intelligence.ts).
  mistakes: z.array(MistakeItemSchema).optional(),
  // RANKERIQ per-player grades — written one row per item to player_grades.
  player_grades: z.array(PlayerGradeSchema).optional(),
  unit_graded: z.string().optional(),
  players_not_evaluable: z.string().optional(),
  // SCOUTIQ only — weak/target players on the OPPONENT. Anti-hallucination:
  // identify by legible jersey number when visible, otherwise by position/
  // alignment/description only — never invent a number.
  target_players: z.array(z.object({
    identifier: z.string(),
    reason: z.string(),
    confidence: z.number(),
    evidence_frames: z.array(z.number()).optional(),
  })).optional(),
})

export interface PositionAnalysisResult {
  overall_score: number
  // A dimension is null when the clip has no applicable evidence for it
  // (e.g. pocket_presence with no dropback, defensive_tendency with no
  // defensive snaps) — the model is instructed to say so rather than guess.
  position_scores: Record<string, number | null>
  reasoning: Record<string, string>
  strengths: string[]
  weaknesses: string[]
  drills: string[]
  summary: string
  confidence: number
  evidence_frames: number[]
  evidence_timestamps: number[]
  breakdown?: RepBreakdown
  /** Whether the model watched the clip or a labelled set of stills. */
  analysisMode: EvidenceMode
  plays_observed?: number
  head_contact_flag?: { flagged: boolean; note: string }
  offensive_tendencies?: Tendency[]
  defensive_tendencies?: Tendency[]
  formations?: { name: string; side?: string; note?: string }[]
  explosive_plays?: { cause: string; description: string; evidence_frames?: number[] }[]
  situational_tells?: { situation: string; tell: string; confidence?: number }[]
  attack_points?: string[]
  mistakes?: MistakeItem[]
  player_grades?: PlayerGrade[]
  unit_graded?: string
  players_not_evaluable?: string
  target_players?: { identifier: string; reason: string; confidence: number; evidence_frames?: number[] }[]
  model: string
  framesAnalyzed: number
}

// Gemini response schema (shared structure)
export const GEMINI_POSITION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overall_score: { type: Type.INTEGER },
    position_scores: {
      type: Type.OBJECT,
      properties: {
        score_1: { type: Type.INTEGER },
        score_2: { type: Type.INTEGER },
        score_3: { type: Type.INTEGER },
      },
    },
    reasoning: {
      type: Type.OBJECT,
      properties: {
        area_1: { type: Type.STRING },
        area_2: { type: Type.STRING },
        area_3: { type: Type.STRING },
      },
    },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    drills: { type: Type.ARRAY, items: { type: Type.STRING } },
    summary: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    evidence_frames: { type: Type.ARRAY, items: { type: Type.INTEGER } },
  },
  required: ['overall_score', 'position_scores', 'reasoning', 'strengths', 'weaknesses', 'drills', 'summary', 'confidence', 'evidence_frames'],
}
