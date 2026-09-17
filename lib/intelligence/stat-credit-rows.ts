import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computeStatLines,
  type CreditYardsBasis,
  type StatCredit,
  type StatKind,
  type StatTally,
} from './stat-lines'
import {
  isDefensivePosition,
  isOffensivePosition,
  positionLabel,
  type StatPosition,
} from './positions'

/**
 * Reading the stat ledger back out, and re-totalling from it.
 *
 * `play_stat_credits` is the record of what happened; the box score stored on
 * an analysis result is a rendering of it. So a correction changes the LEDGER
 * and the sheet is recomputed — never the other way round. That ordering is
 * what makes a coach's fix carry into a season total instead of living in one
 * report's jsonb.
 *
 * The same `computeStatLines` runs here as at charting time, so a corrected
 * sheet and a freshly charted one are the same arithmetic.
 */

export interface StatCreditRow {
  id: string
  play_index: number | null
  side: string
  stat: string
  position_id: string
  position_label: string | null
  position_detail: string | null
  role_on_play: string | null
  yards: number | string | null
  yards_basis: string | null
  touchdown: boolean | null
  mistake_category: string | null
  penalty_type: string | null
  player_id: string | null
  jersey_number: string | null
  number_verified: boolean | null
  identified_by: string | null
  number_rejected_reason: string | null
  identifier: string | null
  note: string | null
  evidence: { timestamps?: number[]; frames?: number[] } | null
}

export const STAT_CREDIT_COLUMNS =
  'id, play_index, side, stat, position_id, position_label, position_detail, role_on_play, ' +
  'yards, yards_basis, touchdown, mistake_category, penalty_type, player_id, jersey_number, ' +
  'number_verified, identified_by, number_rejected_reason, identifier, note, evidence'

export function statCreditFromRow(row: StatCreditRow): StatCredit {
  const yards = row.yards == null ? null : Number(row.yards)
  return {
    playIndex: row.play_index ?? 1,
    side: row.side === 'defense' ? 'defense' : 'offense',
    stat: row.stat as StatKind,
    positionId: row.position_id as StatPosition,
    positionLabel: row.position_label ?? positionLabel(row.position_id),
    positionDetail: row.position_detail,
    roleOnPlay: row.role_on_play,
    yards: yards != null && Number.isFinite(yards) ? yards : null,
    yardsBasis: (row.yards_basis ?? 'not_determinable') as CreditYardsBasis,
    touchdown: row.touchdown === true,
    mistakeCategory: row.mistake_category,
    penaltyType: row.penalty_type,
    playerId: row.player_id,
    jerseyNumber: row.jersey_number,
    numberVerified: row.number_verified === true,
    numberRejectedReason: row.number_rejected_reason,
    identifier: row.identifier ?? positionLabel(row.position_id),
    identifiedBy:
      row.identified_by === 'roster' || row.identified_by === 'number' ? row.identified_by : 'position',
    note: row.note,
    evidenceTimestamps: row.evidence?.timestamps ?? [],
    evidenceFrames: row.evidence?.frames ?? [],
  }
}

/** Every credit charted for one analysis, oldest play first. */
export async function readStatCredits(
  supabase: SupabaseClient,
  analysisResultId: string
): Promise<{ rows: StatCreditRow[]; credits: StatCredit[] }> {
  const { data } = await supabase
    .from('play_stat_credits')
    .select(STAT_CREDIT_COLUMNS)
    .eq('analysis_result_id', analysisResultId)
    .order('play_index', { ascending: true })
    .order('created_at', { ascending: true })

  const rows = (data ?? []) as unknown as StatCreditRow[]
  return { rows, credits: rows.map(statCreditFromRow) }
}

/**
 * A position may only move within its own side of the ball.
 *
 * Re-filing a rush under a cornerback would produce a row that cannot exist,
 * and the box score renders offense and defense from the credit's side — so
 * the correction would silently vanish from both tables. Rejecting it with a
 * reason a coach can read is better than accepting a change that does nothing.
 */
export function positionIsValidForSide(
  positionId: string,
  side: 'offense' | 'defense'
): boolean {
  return side === 'offense' ? isOffensivePosition(positionId) : isDefensivePosition(positionId)
}

export interface CreditPatch {
  /** Move the credit to a different position on the same side of the ball. */
  position_id?: string
  /** Fix the yardage. Null means "the film could not measure this". */
  yards?: number | null
  touchdown?: boolean
  /** Remove a credit for something that did not happen. */
  remove?: boolean
}

/**
 * Applies a coach's patch to a credit in memory, so the caller can re-tally
 * before writing. Returns null when the credit is being removed.
 *
 * Correcting the position also re-labels the row and drops any jersey number
 * attached to it: the number was read for the player the model thought it saw,
 * and once a coach says it was someone else that number is evidence about a
 * different child. Keeping it would put the wrong name on the corrected stat —
 * the exact failure the identity gates exist to prevent.
 */
export function applyCreditPatch(credit: StatCredit, patch: CreditPatch): StatCredit | null {
  if (patch.remove) return null

  let next = { ...credit }

  if (patch.position_id && patch.position_id !== credit.positionId) {
    next = {
      ...next,
      positionId: patch.position_id as StatPosition,
      positionLabel: positionLabel(patch.position_id),
      positionDetail: null,
      identifier: positionLabel(patch.position_id),
      jerseyNumber: null,
      playerId: null,
      numberVerified: false,
      identifiedBy: 'position',
      numberRejectedReason: credit.jerseyNumber
        ? 'a coach moved this stat to a different position'
        : credit.numberRejectedReason,
    }
  }

  if ('yards' in patch) {
    next = {
      ...next,
      yards: patch.yards ?? null,
      // A coach at the game is a better source than any read of the film, and
      // a number they typed is not an estimate — it stops counting as an
      // unmeasured play.
      yardsBasis: patch.yards == null ? 'not_determinable' : 'coach_breakdown',
    }
  }

  if (typeof patch.touchdown === 'boolean') next = { ...next, touchdown: patch.touchdown }

  return next
}

/** The corrected sheet, recomputed from the corrected ledger. */
export function retally(credits: StatCredit[], nullifiedPlays = 0): StatTally {
  return computeStatLines(credits, nullifiedPlays)
}
