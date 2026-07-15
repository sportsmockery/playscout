import { z } from 'zod'
import { Type } from '@google/genai'

export type IntelligenceModuleKey =
  | 'QBIQ' | 'OLIQ' | 'RBIQ' | 'WRIQ' | 'DLIQ' | 'LBIQ' | 'DBIQ'
  | 'TEAMIQ' | 'MISTAKEIQ' | 'SCOUTIQ' | 'PRACTICEIQ'

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
    notes: z.string().optional(),
  }).optional(),
  team: z.object({
    name: z.string().optional(),
    age_group: z.string().optional(),
    season: z.string().optional(),
    offensive_style: z.string().optional(),
    defensive_style: z.string().optional(),
    jersey_color: z.string().optional(),
    side_of_ball: z.enum(['offense', 'defense', 'both', 'unknown']).optional(),
  }).optional(),
  playSequence: z.object({
    down: z.number().optional(),
    distance: z.number().optional(),
    yard_line: z.string().optional(),
    coach_label: z.string().optional(),
  }).optional(),
})

export type PositionAnalysisInput = z.infer<typeof PositionAnalysisInputSchema>

export interface PositionAnalysisResult {
  overall_score: number
  position_scores: Record<string, number>
  reasoning: Record<string, string>
  strengths: string[]
  weaknesses: string[]
  drills: string[]
  summary: string
  confidence: number
  evidence_frames: number[]
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
