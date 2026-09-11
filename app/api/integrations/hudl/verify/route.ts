import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTeamMember } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

/**
 * "Test connection" — queue a sign-in-only job against the team's Hudl account.
 *
 * Binding an account used to write a row and say "saved". Whether Hudl would
 * actually accept it was discovered by the first import, hours later, and for
 * an account that signs in with Google the answer was always no. This is the
 * same question asked immediately.
 *
 * Nothing is verified HERE. Signing in needs a real browser, which only the
 * Railway worker has — so this queues a `job_kind: 'verify'` row and returns.
 * The worker writes the answer to `hudl_credentials.last_verified_at` /
 * `last_error`, which is what the settings card already polls.
 */

const BIND_ROLES = ['owner', 'admin', 'coach'] as const

const VerifySchema = z.object({ teamId: z.string().uuid() })

/**
 * `target_key` for a verification. The existing partial unique index on
 * (team_id, target_key) over live statuses means a second press while one is
 * running joins it rather than queueing a second sign-in — and repeated
 * sign-ins are exactly what gets a coach's Hudl account flagged.
 */
const VERIFY_TARGET_KEY = 'verify'

export async function POST(req: NextRequest) {
  const parsed = VerifySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'teamId is required.' }, { status: 400 })
  const { teamId } = parsed.data

  const access = await requireTeamMember(teamId, { writeRoles: BIND_ROLES })
  if (access.error) return access.error

  const admin = createAdminClient()

  // Existence only — nothing about the credential is read or returned.
  const { data: credential } = await admin
    .from('hudl_credentials')
    .select('team_id')
    .eq('team_id', teamId)
    .maybeSingle()
  if (!credential) {
    return NextResponse.json(
      { error: 'Connect a Hudl account for this team first.' },
      { status: 409 }
    )
  }

  // Clear the last answer so the card cannot show a stale "signed in fine"
  // next to a spinner for the test that is about to contradict it.
  await admin
    .from('hudl_credentials')
    .update({ last_error: null, updated_at: new Date().toISOString() })
    .eq('team_id', teamId)

  const supabase = await createClient()
  const { data: job, error } = await supabase
    .from('hudl_import_jobs')
    .insert({
      team_id: teamId,
      created_by: access.user.id,
      job_kind: 'verify',
      source_url: null,
      target_key: VERIFY_TARGET_KEY,
      title: 'Hudl connection test',
      status: 'queued',
      // One attempt. A rejected password, a Google account and an expired
      // session all fail identically on a retry, and this is a question, not
      // work worth salvaging.
      max_attempts: 1,
    })
    .select('id, status')
    .single()

  if (error) {
    if (error.code === '23505') {
      // A test is already running for this team. Joining it is the right
      // answer; queueing a second sign-in is how an account gets flagged.
      return NextResponse.json({ queued: true, alreadyRunning: true })
    }
    console.error('[hudl] could not queue verification for team', teamId, error.message)
    return NextResponse.json({ error: 'Could not start the connection test.' }, { status: 500 })
  }

  return NextResponse.json({ queued: true, jobId: job.id })
}
