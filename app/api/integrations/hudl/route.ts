import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTeamMember } from '@/lib/auth/require-team-member'
import { seal, secretBoxReady } from '@/lib/crypto/secret-box'

export const runtime = 'nodejs'

/**
 * Connect, inspect and disconnect a team's Hudl account.
 *
 * `hudl_credentials` has no SELECT policy for any client role, so reads here go
 * through the service role AFTER this route has checked team membership itself.
 * That puts the authorization in code that is tested rather than in a view or a
 * definer function that a later migration could quietly widen.
 *
 * The sealed columns never appear in a response from this file. GET returns
 * status only; there is no endpoint anywhere that hands a stored password back,
 * which is deliberate — a coach re-enters it rather than reading it out.
 */

// Coaches with owner/admin/coach can bind an account; analysts and viewers
// cannot, since a bound account spends the team's Hudl access unattended.
const BIND_ROLES = ['owner', 'admin', 'coach'] as const

const ConnectSchema = z.object({
  teamId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(1).max(512),
})

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId')
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const access = await requireTeamMember(teamId)
  if (access.error) return access.error

  const { data } = await createAdminClient()
    .from('hudl_credentials')
    // Never `select *` here. The sealed columns must not be able to reach a
    // response by someone later adding a field to the JSON below.
    .select('hudl_email, session_expires_at, last_verified_at, last_error, created_at')
    .eq('team_id', teamId)
    .maybeSingle()

  if (!data) return NextResponse.json({ connected: false, keyConfigured: secretBoxReady() })

  return NextResponse.json({
    connected: true,
    keyConfigured: secretBoxReady(),
    email: data.hudl_email,
    lastVerifiedAt: data.last_verified_at,
    sessionExpiresAt: data.session_expires_at,
    lastError: data.last_error,
    connectedAt: data.created_at,
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const parsed = ConnectSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email and password.' }, { status: 400 })
  }
  const { teamId, email, password } = parsed.data

  const access = await requireTeamMember(teamId, { writeRoles: BIND_ROLES })
  if (access.error) return access.error

  // Refuse before touching the password if there is nowhere safe to put it.
  // Storing it unencrypted "just this once" is the failure this guards.
  if (!secretBoxReady()) {
    return NextResponse.json(
      {
        error:
          'Credential encryption is not configured on this deployment (HUDL_CREDENTIAL_KEY). ' +
          'Nothing was saved.',
      },
      { status: 503 }
    )
  }

  const { error } = await createAdminClient()
    .from('hudl_credentials')
    .upsert(
      {
        team_id: teamId,
        hudl_email: email,
        sealed_password: seal(password),
        // A new password invalidates whatever session we had cached.
        sealed_session: null,
        session_expires_at: null,
        last_verified_at: null,
        last_error: null,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'team_id' }
    )

  if (error) {
    // The error is logged without the row, because the row contains the
    // ciphertext and supabase-js error objects can echo the payload back.
    console.error('[hudl] failed to store credentials for team', teamId, error.message)
    return NextResponse.json({ error: 'Could not save the connection.' }, { status: 500 })
  }

  // Not verified yet — the worker proves the login works on the first job, and
  // the UI says "not verified" until it does. Claiming success here would mean
  // a coach discovers a typo three days later when a batch silently fails.
  return NextResponse.json({ connected: true, email, verified: false })
}

export async function DELETE(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId')
  if (!teamId) return NextResponse.json({ error: 'teamId is required' }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const access = await requireTeamMember(teamId, { writeRoles: BIND_ROLES })
  if (access.error) return access.error

  const { error } = await createAdminClient().from('hudl_credentials').delete().eq('team_id', teamId)
  if (error) {
    console.error('[hudl] failed to disconnect team', teamId, error.message)
    return NextResponse.json({ error: 'Could not disconnect.' }, { status: 500 })
  }

  return NextResponse.json({ connected: false })
}
