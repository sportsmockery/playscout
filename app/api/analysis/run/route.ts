import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'
import { guardAIRequest } from '@/lib/ai/guard'
import { drainAnalysisJobs, reapStuckAnalysisJobs } from '@/lib/intelligence/run-analysis-job'

export const runtime = 'nodejs'
export const maxDuration = 300

// Leave headroom under maxDuration so the response still gets sent after the
// last clip lands; a job cut off mid-run is reaped and retried anyway.
const DEADLINE_MS = 230_000
const MAX_JOBS_PER_POKE = 3

/**
 * POST /api/analysis/run — drains this team's analysis queue for a while.
 *
 * The Railway worker (workers/process-analysis.ts) is what makes a batch
 * finish when nobody's watching. This endpoint is the companion for when the
 * coach IS watching: the queue view pokes it so a batch starts moving
 * immediately instead of waiting on a poll cycle, and so batches still drain
 * on a deployment where the worker isn't running. Both claim jobs the same
 * atomic way, so running both at once never double-analyzes a clip.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { teamId } = body as { teamId?: string }
  if (!teamId) return NextResponse.json({ error: 'teamId is required.' }, { status: 400 })

  const access = await requireTeamMember(teamId, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const supabase = await createClient()
  const blocked = await guardAIRequest(supabase, access.user.id, teamId)
  if (blocked) return blocked

  await reapStuckAnalysisJobs(supabase, { teamId }).catch(() => {})

  const { processed, outcomes } = await drainAnalysisJobs(supabase, {
    workerId: `web-${access.user.id.slice(0, 8)}`,
    teamId,
    maxJobs: MAX_JOBS_PER_POKE,
    deadlineMs: DEADLINE_MS,
  })

  return NextResponse.json({ processed, outcomes })
}
