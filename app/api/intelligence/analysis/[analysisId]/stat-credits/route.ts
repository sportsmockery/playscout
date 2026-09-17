import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMemberForRow, WRITE_ROLES } from '@/lib/auth/require-team-member'
import {
  readStatCredits,
  applyCreditPatch,
  positionIsValidForSide,
  retally,
  type CreditPatch,
} from '@/lib/intelligence/stat-credit-rows'
import { STAT_POSITIONS, positionLabel } from '@/lib/intelligence/positions'
import { STAT_KINDS, sideOfStat } from '@/lib/intelligence/stat-lines'

/**
 * Correcting a charted stat.
 *
 * A coach watched the game. When they say the quarterback kept it, they are
 * right and the film read was wrong — so this writes the LEDGER first and
 * recomputes the box score from it, rather than editing the rendered sheet.
 * That ordering is the whole point: a correction made here is what a season
 * total will later count, not a note stapled to one report.
 *
 * What can be changed is deliberately narrow — which position gets the credit,
 * the yardage, whether it scored, and whether it happened at all. Changing the
 * KIND of stat (a rush into a reception) would break the pairing invariants the
 * tally checks, so it isn't offered; removing the wrong credit and re-charting
 * is the honest path there.
 */

/**
 * The charted credits WITH their ledger ids, which is what a correction needs
 * to address. The box score stored on the analysis result carries the numbers
 * but not the row identities, so the editor loads from here rather than from
 * the rendered sheet.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const { analysisId } = await params
  const access = await requireTeamMemberForRow('position_analysis_results', analysisId)
  if (access.error) return access.error

  const supabase = await createClient()
  const { rows, credits } = await readStatCredits(supabase, analysisId)

  return NextResponse.json({
    credits: rows.map((row, i) => ({
      id: row.id,
      playIndex: credits[i].playIndex,
      side: credits[i].side,
      stat: credits[i].stat,
      positionId: credits[i].positionId,
      positionLabel: credits[i].positionLabel,
      identifier: credits[i].identifier,
      yards: credits[i].yards,
      touchdown: credits[i].touchdown,
      note: credits[i].note,
      resolutionStatus: credits[i].resolutionStatus ?? 'confirmed',
      question: credits[i].question ?? null,
      candidates: credits[i].candidates ?? [],
      evidenceTimestamps: credits[i].evidenceTimestamps,
    })),
  })
}

/**
 * A stat the coach adds by hand.
 *
 * The film misses plays — the camera pans late, the pile hides a fumble, a
 * clip starts after the snap. Without this the only way to get a missed carry
 * into the record is to re-chart and hope, so the sheet is permanently short
 * by however much the camera missed. A typed stat is filed as coach_entered
 * and counts immediately: they were there.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const { analysisId } = await params

  const access = await requireTeamMemberForRow('position_analysis_results', analysisId, {
    writeRoles: WRITE_ROLES,
  })
  if (access.error) return access.error

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const stat = String(body.stat ?? '')
  const positionId = String(body.position_id ?? '')
  const playIndex = Number(body.play_index ?? 1)
  const yards = body.yards == null || body.yards === '' ? null : Number(body.yards)

  if (!(STAT_KINDS as readonly string[]).includes(stat)) {
    return NextResponse.json({ error: 'Pick what the player did.' }, { status: 400 })
  }
  if (!(STAT_POSITIONS as readonly string[]).includes(positionId)) {
    return NextResponse.json({ error: 'Pick a position.' }, { status: 400 })
  }
  // A penalty takes the side of the play, which a hand-entered stat has no way
  // to know, so the client states it; everything else derives from the stat.
  const side =
    sideOfStat(stat) ?? (body.side === 'defense' ? 'defense' : 'offense')
  if (!positionIsValidForSide(positionId, side)) {
    return NextResponse.json(
      { error: `${positionLabel(positionId)} is not on the ${side}.` },
      { status: 400 }
    )
  }
  if (yards != null && !Number.isFinite(yards)) {
    return NextResponse.json({ error: 'Yards must be a number.' }, { status: 400 })
  }

  const { data: analysis } = await supabase
    .from('position_analysis_results')
    .select('id, team_id, video_id, play_sequence_id, evidence, model_name')
    .eq('id', analysisId)
    .maybeSingle()
  if (!analysis) return NextResponse.json({ error: 'Analysis not found.' }, { status: 404 })

  const { error: insertError } = await supabase.from('play_stat_credits').insert({
    team_id: analysis.team_id,
    video_id: analysis.video_id,
    analysis_result_id: analysisId,
    play_sequence_id: analysis.play_sequence_id,
    play_index: Number.isFinite(playIndex) ? playIndex : 1,
    side,
    stat,
    position_id: positionId,
    position_label: positionLabel(positionId),
    yards,
    // Typed by someone who was at the game — a fact, not a film estimate.
    yards_basis: yards == null ? 'not_determinable' : 'coach_breakdown',
    touchdown: body.touchdown === true,
    identifier: positionLabel(positionId),
    identified_by: 'position',
    number_verified: false,
    resolution_status: 'coach_entered',
    resolved_by: user.id,
    resolved_at: new Date().toISOString(),
    note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : 'Entered by coach',
  })
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 403 })

  const { credits } = await readStatCredits(supabase, analysisId)
  const evidence = (analysis.evidence ?? {}) as Record<string, unknown> & {
    team_stats?: { nullifiedPlays?: number }
  }
  const tally = retally(credits, evidence.team_stats?.nullifiedPlays ?? 0)

  const { error: saveError } = await supabase
    .from('position_analysis_results')
    .update({
      evidence: {
        ...evidence,
        stat_lines: tally.lines,
        stat_credits: tally.credits,
        team_stats: tally.team,
        stat_warnings: tally.warnings,
      },
      edited_by: user.id,
      edited_at: new Date().toISOString(),
    })
    .eq('id', analysisId)
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 403 })

  return NextResponse.json({
    lines: tally.lines,
    team: tally.team,
    warnings: tally.warnings,
    credits: tally.credits,
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const { analysisId } = await params

  const access = await requireTeamMemberForRow('position_analysis_results', analysisId, {
    writeRoles: WRITE_ROLES,
  })
  if (access.error) return access.error

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const patches = body.patches as Record<string, CreditPatch> | undefined
  if (!patches || typeof patches !== 'object' || !Object.keys(patches).length) {
    return NextResponse.json({ error: 'No corrections provided.' }, { status: 400 })
  }

  const { data: analysis } = await supabase
    .from('position_analysis_results')
    .select('id, team_id, evidence, model_name, prompt_version')
    .eq('id', analysisId)
    .maybeSingle()
  if (!analysis) return NextResponse.json({ error: 'Analysis not found.' }, { status: 404 })

  const { rows, credits } = await readStatCredits(supabase, analysisId)
  if (!rows.length) {
    return NextResponse.json(
      { error: 'This analysis has no charted stats to correct.' },
      { status: 400 }
    )
  }

  // Validate every patch BEFORE writing any of them: a half-applied correction
  // leaves the ledger and the sheet disagreeing, which is worse than a refusal.
  for (const [creditId, patch] of Object.entries(patches)) {
    const index = rows.findIndex((r) => r.id === creditId)
    if (index === -1) {
      return NextResponse.json(
        { error: 'One of those stats is no longer part of this analysis.' },
        { status: 400 }
      )
    }
    if (patch.position_id) {
      if (!(STAT_POSITIONS as readonly string[]).includes(patch.position_id)) {
        return NextResponse.json({ error: `Unknown position: ${patch.position_id}` }, { status: 400 })
      }
      if (!positionIsValidForSide(patch.position_id, credits[index].side)) {
        return NextResponse.json(
          {
            error:
              credits[index].side === 'offense'
                ? 'That is a defensive position, and this is an offensive stat.'
                : 'That is an offensive position, and this is a defensive stat.',
          },
          { status: 400 }
        )
      }
    }
    if ('yards' in patch && patch.yards != null && !Number.isFinite(Number(patch.yards))) {
      return NextResponse.json({ error: 'Yards must be a number.' }, { status: 400 })
    }
  }

  const corrected: typeof credits = []
  const removedIds: string[] = []
  const updates: { id: string; before: (typeof credits)[number]; after: (typeof credits)[number] }[] = []

  credits.forEach((credit, i) => {
    const patch = patches[rows[i].id]
    if (!patch) {
      corrected.push(credit)
      return
    }
    const next = applyCreditPatch(credit, {
      ...patch,
      ...('yards' in patch ? { yards: patch.yards == null ? null : Number(patch.yards) } : {}),
    })
    if (!next) {
      removedIds.push(rows[i].id)
      return
    }
    corrected.push(next)
    updates.push({ id: rows[i].id, before: credit, after: next })
  })

  for (const { id, after } of updates) {
    const { error } = await supabase
      .from('play_stat_credits')
      .update({
        position_id: after.positionId,
        position_label: after.positionLabel,
        position_detail: after.positionDetail,
        yards: after.yards,
        yards_basis: after.yardsBasis,
        touchdown: after.touchdown,
        jersey_number: after.jerseyNumber,
        player_id: after.playerId,
        number_verified: after.numberVerified,
        identified_by: after.identifiedBy,
        number_rejected_reason: after.numberRejectedReason,
        identifier: after.identifier,
        resolution_status: after.resolutionStatus ?? 'confirmed',
        question: after.question ?? null,
        candidates: after.candidates ?? null,
        ...(after.resolutionStatus === 'coach_entered'
          ? { resolved_by: user.id, resolved_at: new Date().toISOString() }
          : {}),
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  }

  if (removedIds.length) {
    const { error } = await supabase.from('play_stat_credits').delete().in('id', removedIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  }

  // Re-total from the corrected ledger and write the sheet back, so the saved
  // report, the module screen and any future season view all read the same
  // numbers.
  const evidence = (analysis.evidence ?? {}) as Record<string, unknown> & {
    team_stats?: { nullifiedPlays?: number }
  }
  const tally = retally(corrected, evidence.team_stats?.nullifiedPlays ?? 0)

  const { error: saveError } = await supabase
    .from('position_analysis_results')
    .update({
      evidence: {
        ...evidence,
        stat_lines: tally.lines,
        stat_credits: tally.credits,
        team_stats: tally.team,
        stat_warnings: tally.warnings,
      },
      edited_by: user.id,
      edited_at: new Date().toISOString(),
    })
    .eq('id', analysisId)
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 403 })

  // The correction flywheel. One row per corrected credit, carrying what the
  // model said and what the coach said it should have been — the only training
  // signal in the product that comes from someone who was actually there.
  const corrections = [
    ...updates.map(({ id, before, after }) => ({
      team_id: analysis.team_id,
      result_id: analysisId,
      result_type: 'position_analysis_result' as const,
      field: `stat_credit:${id}`,
      ai_value: {
        position_id: before.positionId,
        yards: before.yards,
        touchdown: before.touchdown,
        stat: before.stat,
        note: before.note,
      },
      corrected_value: {
        position_id: after.positionId,
        yards: after.yards,
        touchdown: after.touchdown,
        stat: after.stat,
      },
      model: analysis.model_name,
      prompt_version: analysis.prompt_version ?? null,
      corrected_by: user.id,
    })),
    ...removedIds.map((id) => {
      const before = credits[rows.findIndex((r) => r.id === id)]
      return {
        team_id: analysis.team_id,
        result_id: analysisId,
        result_type: 'position_analysis_result' as const,
        field: `stat_credit:${id}`,
        ai_value: {
          position_id: before.positionId,
          yards: before.yards,
          touchdown: before.touchdown,
          stat: before.stat,
          note: before.note,
        },
        corrected_value: null,
        model: analysis.model_name,
        prompt_version: analysis.prompt_version ?? null,
        corrected_by: user.id,
      }
    }),
  ]
  if (corrections.length) {
    const { error } = await supabase.from('output_corrections').insert(corrections)
    if (error) console.error('output_corrections insert failed:', error)
  }

  return NextResponse.json({
    lines: tally.lines,
    team: tally.team,
    warnings: tally.warnings,
    credits: tally.credits,
  })
}
