import { FOOTBALL_BRAIN_SYSTEM, buildGameTypeContext } from '../football-brain'
import type { AggregatedScoutReport } from '../scoutiq-aggregate'

export interface ScoutIQGamePlanContext {
  opponentName: string
  opponentAgeGroup?: string | null
  teamName?: string | null
  teamAgeGroup?: string | null
  teamOffensiveStyle?: string | null
  teamDefensiveStyle?: string | null
  gameType?: string | null
  aggregated: AggregatedScoutReport
  ownRosterSummary?: string
  ownPlaybookSummary?: string
}

function formatTendencyLines(tendencies: AggregatedScoutReport['offensive_tendencies']): string {
  if (!tendencies.length) return '(none observed yet)'
  return tendencies
    .map((t) => `- [${t.tendency_type}] ${t.label}: ${t.rate != null ? `${Math.round(t.rate * 100)}% of observed plays` : 'observed'}, confidence ${t.confidence.toFixed(2)}, sample ${t.sample_size} plays`)
    .join('\n')
}

/**
 * ScoutIQ Stage 2 (System A, Claude Opus) — reasons over STORED evidence
 * from every scouted clip of one opponent (already aggregated by
 * scoutiq-aggregate.ts), never over raw video. Produces the "how to beat
 * them" game plan, matched to the coach's own roster/playbook.
 */
export function buildScoutIQGamePlanPrompt(ctx: ScoutIQGamePlanContext): string {
  const { aggregated } = ctx
  const gameTypeContext = buildGameTypeContext(ctx.gameType)

  return `${FOOTBALL_BRAIN_SYSTEM}

You are SCOUTIQ's game-plan synthesizer (System A). You do NOT watch video — you reason
only over the aggregated scouting evidence below, already extracted from ${aggregated.evidence_sufficiency.clips_analyzed} film clip(s) of the opponent.

OPPONENT: ${ctx.opponentName}${ctx.opponentAgeGroup ? ` (${ctx.opponentAgeGroup})` : ''}
YOUR TEAM: ${ctx.teamName ?? 'the coach’s team'}${ctx.teamAgeGroup ? ` (${ctx.teamAgeGroup})` : ''} — Offense: ${ctx.teamOffensiveStyle ?? 'unknown'} | Defense: ${ctx.teamDefensiveStyle ?? 'unknown'}
${gameTypeContext}

## Aggregated Opponent Evidence (from ${aggregated.evidence_sufficiency.clips_analyzed} clip(s), ${aggregated.evidence_sufficiency.plays_observed} total plays observed)

Offensive tendencies:
${formatTendencyLines(aggregated.offensive_tendencies)}

Defensive tendencies:
${formatTendencyLines(aggregated.defensive_tendencies)}

Formations observed: ${aggregated.formations.map((f) => f.name).join(', ') || '(none observed yet)'}

Situational tells:
${aggregated.situational_tells.map((t) => `- ${t.situation}: ${t.tell}`).join('\n') || '(none observed yet)'}

Attack points already identified per-clip:
${aggregated.attack_points.map((a) => `- ${a}`).join('\n') || '(none observed yet)'}

Target players (weakness identified by legible jersey number or position/alignment — never a guessed number):
${aggregated.target_players.map((p) => `- ${p.identifier}: ${p.reason} (confidence ${p.confidence.toFixed(2)})`).join('\n') || '(none identified yet)'}

## Your Team's Own Personnel & Playbook
${ctx.ownRosterSummary ?? '(no roster on file)'}
${ctx.ownPlaybookSummary ?? '(no playbook on file)'}

## Task
Produce a game plan a volunteer 9U-10U coach can actually use this week:
1. offensive_game_plan — how to attack this opponent on offense, matched to YOUR team's own personnel/playbook where possible.
2. defensive_game_plan — how to stop this opponent's offense.
3. target_players_plan — how to specifically exploit the target players listed above (only if the evidence above lists any).
4. practice_week_focus — 3-5 concrete practice-week install priorities.
5. evidence_sufficiency_note — one honest sentence on how much this is built on (cite the clip/play counts above). If the sample is thin (few clips or plays), say so plainly and recommend scouting more film before fully trusting this plan.
6. summary — 2-3 sentence executive summary.

RULES:
- Only reference opponent tendencies, formations, or target players that appear in the evidence above. Never invent a tendency, jersey number, or player detail not listed there.
- If a category above has no evidence (e.g. no target players identified), say so in that section rather than inventing one to fill it.
- Respect the safety rules above: no prohibited drills, no live-contact drills unless GAME TYPE is tackle.
- Keep every recommendation specific to 9U-10U — no NFL/college-caliber schemes.

Return ONLY JSON matching this schema, no preamble, no markdown fences:
{
  "offensive_game_plan": ["<string>", ...],
  "defensive_game_plan": ["<string>", ...],
  "target_players_plan": ["<string>", ...],
  "practice_week_focus": ["<string>", ...],
  "evidence_sufficiency_note": "<string>",
  "summary": "<string>"
}`
}

export interface ScoutIQGamePlan {
  offensive_game_plan: string[]
  defensive_game_plan: string[]
  target_players_plan: string[]
  practice_week_focus: string[]
  evidence_sufficiency_note: string
  summary: string
}
