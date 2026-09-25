import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The guarantee behind scouting two opponents off one cut-up.
 *
 * `position_analysis_results` records the team, the video and the module —
 * never the SUBJECT. For every other module that is fine, because the subject
 * is the coach's own team. SCOUTIQ's subject is the OPPONENT, and the report
 * route used to gather "every SCOUTIQ result on the videos tagged to this
 * opponent".
 *
 * That holds only while a clip belongs to one opponent. Film of two opponents
 * playing each other is film of both, so the same clip gets scouted twice —
 * and without a subject on the row, team B's report silently ingests team A's
 * reads of the same snaps as extra evidence. More clips, wrong team, no
 * warning. These are the checks that it cannot happen again.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a scout result carries who it was scouting', () => {
  it('writes opponent_id on every saved analysis', () => {
    const save = read('lib/intelligence/save-analysis.ts')
    expect(save).toContain('opponent_id: input.opponentId ?? null')
  })

  it('has a migration that adds the column and backfills it', () => {
    const sql = read('supabase/migrations/20260925000000_scout_results_opponent.sql')
    expect(sql).toMatch(/add column if not exists opponent_id uuid references public\.opponents/)
    // The backfill is what makes everything scouted BEFORE this correct: a
    // clip has only ever had one opponent, so its results can only be about
    // that one.
    expect(sql).toMatch(/update public\.position_analysis_results/)
    expect(sql).toContain("r.module_key = 'SCOUTIQ'")
    expect(sql).toContain('r.opponent_id is null')
    // on delete set null, never cascade — deleting an opponent must not delete
    // the film analysis that was run.
    expect(sql).toContain('on delete set null')
  })
})

describe('the report gathers evidence by subject, not by film tag', () => {
  const route = read('app/api/scoutiq/report/route.ts')

  it('scopes SCOUTIQ results to the opponent being reported on', () => {
    expect(route).toContain(".eq('module_key', 'SCOUTIQ')")
    expect(route).toContain(".eq('opponent_id', opponentId)")
  })

  it('no longer gathers every result on the opponent-tagged videos', () => {
    // The exact line that would blend two opponents' reads of one clip.
    expect(route).not.toContain(".in('video_id', videoIds)")
  })
})

describe('the scouted badge is per opponent', () => {
  const queries = read('lib/db/queries.ts')

  it('filters by opponent when one is given', () => {
    expect(queries).toContain('opponentId?: string | null')
    expect(queries).toContain("q.eq('opponent_id', opponentId)")
  })

  it('keeps the old behaviour when no opponent is given', () => {
    // Callers that genuinely mean "any scout" still get that, rather than
    // silently getting an empty list.
    expect(queries).toMatch(/if \(opponentId\) q = q\.eq\('opponent_id', opponentId\)/)
  })

  it('is called with the selected opponent from the module screen', () => {
    const page = read('app/(app)/teams/[teamId]/modules/scoutiq/page.tsx')
    expect(page).toMatch(/getScoutedVideoIds\(\s*opponentVideos\.map\(\(v\) => v\.id\),\s*selectedOpponentId\s*\)/)
  })
})

describe('the picker shows the library but does not pre-select it', () => {
  const page = read('app/(app)/teams/[teamId]/modules/scoutiq/page.tsx')
  const client = read('app/(app)/teams/[teamId]/modules/scoutiq/ScoutIQClient.tsx')

  it('loads the whole team library rather than one opponent\'s film', () => {
    expect(page).toContain('getVideosByTeam(teamId)')
    expect(page).not.toContain('getVideosByOpponent')
  })

  it('still marks which clips are filed under this opponent', () => {
    expect(page).toContain('taggedVideoIds')
    expect(page).toMatch(/v\.opponent_id === selectedOpponentId/)
  })

  it('pre-selects only this opponent\'s film, never the whole library', () => {
    // Defaulting to everything would queue a paid vision call per clip of film
    // that has nothing to do with them.
    expect(client).toContain('const preferredIds = selectableIds.filter((id) => tagged.has(id))')
    expect(client).toContain('unscoutedIds.length ? unscoutedIds : preferredIds')
  })

  it('makes widening to the whole library a deliberate second press', () => {
    expect(client).toContain('Select all ${selectableIds.length} in library')
  })
})
