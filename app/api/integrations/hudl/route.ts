import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTeamMember } from '@/lib/auth/require-team-member'
import { seal, secretBoxReady } from '@/lib/crypto/secret-box'
import { normalizeHudlSessionPaste } from '@/lib/import/hudl-session-paste'

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
 * status only; there is no endpoint anywhere that hands a stored password or
 * session back, which is deliberate — a coach re-enters it rather than reading
 * it out.
 *
 * A connection comes in one of two shapes, and POST takes exactly one of them:
 *
 *   password — PlayScout signs in to Hudl itself, unattended, forever.
 *   session  — the coach pastes the session their own browser already holds.
 *              This is the only option for an account that signs in with
 *              Google: it has no Hudl password, and Google blocks automated
 *              browsers, so driving that sign-in would risk the coach's GOOGLE
 *              account rather than simply failing. The trade is that a pasted
 *              session eventually expires and has to be pasted again.
 */

// Coaches with owner/admin/coach can bind an account; analysts and viewers
// cannot, since a bound account spends the team's Hudl access unattended.
const BIND_ROLES = ['owner', 'admin', 'coach'] as const

const ConnectSchema = z.object({
  teamId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(1).max(512).optional(),
  // The raw paste. Normalised and re-serialised below — what gets sealed is
  // never the bytes the client sent.
  session: z.string().min(1).max(256 * 1024).optional(),
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

  const admin = createAdminClient()
  const { data } = await admin
    .from('hudl_credentials')
    // Never `select *` here. The sealed columns must not be able to reach a
    // response by someone later adding a field to the JSON below. `auth_mode`
    // exists as its own column precisely so this list never needs one.
    .select(
      'hudl_email, auth_mode, session_expires_at, session_pasted_at, last_verified_at, last_error, created_at'
    )
    .eq('team_id', teamId)
    .maybeSingle()

  if (!data) return NextResponse.json({ connected: false, keyConfigured: secretBoxReady() })

  // Whether a "test connection" job is still in flight, so the card can keep
  // showing a spinner across a reload rather than only inside one page session.
  const { data: liveVerify } = await admin
    .from('hudl_import_jobs')
    .select('id')
    .eq('team_id', teamId)
    .eq('job_kind', 'verify')
    .in('status', ['queued', 'running', 'retrying'])
    .maybeSingle()

  return NextResponse.json({
    connected: true,
    keyConfigured: secretBoxReady(),
    email: data.hudl_email,
    authMode: data.auth_mode ?? 'password',
    lastVerifiedAt: data.last_verified_at,
    sessionExpiresAt: data.session_expires_at,
    sessionPastedAt: data.session_pasted_at,
    lastError: data.last_error,
    connectedAt: data.created_at,
    verifying: Boolean(liveVerify),
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
    return NextResponse.json({ error: 'Enter a valid Hudl email.' }, { status: 400 })
  }
  const { teamId, email, password, session } = parsed.data

  // Exactly one. Both would mean storing a password for an account the coach
  // just told us signs in with Google, and neither is not a connection.
  if (Boolean(password) === Boolean(session)) {
    return NextResponse.json(
      {
        error: password
          ? 'Choose one: a Hudl password, or a pasted Hudl session — not both.'
          : 'Enter a Hudl password, or paste a Hudl session.',
      },
      { status: 400 }
    )
  }

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

  // Every field is written on both branches, including the ones being cleared.
  // Switching a team from a password to a pasted session must actually DELETE
  // the stored password, not leave it behind under a row that now claims to be
  // session-authenticated.
  const now = new Date().toISOString()
  let row: Record<string, unknown>
  let sessionCookies = 0
  let sessionDropped = 0

  if (session) {
    const normalized = normalizeHudlSessionPaste(session)
    // `reason` is hand-written and mentions only counts and domains — the
    // normalizer never echoes a cookie value into one.
    if (!normalized.ok) return NextResponse.json({ error: normalized.reason }, { status: 400 })

    sessionCookies = normalized.cookieCount
    sessionDropped = normalized.droppedCount
    row = {
      team_id: teamId,
      hudl_email: email,
      auth_mode: 'session',
      // No password to fall back on, and saying so in the row is what lets the
      // worker report "re-paste your session" instead of "wrong password".
      sealed_password: null,
      sealed_session: seal(normalized.storageState),
      session_expires_at: normalized.expiresAt?.toISOString() ?? null,
      session_pasted_at: now,
      last_verified_at: null,
      last_error: null,
      created_by: user.id,
      updated_at: now,
    }
  } else {
    row = {
      team_id: teamId,
      hudl_email: email,
      auth_mode: 'password',
      sealed_password: seal(password as string),
      // A new password invalidates whatever session we had cached.
      sealed_session: null,
      session_expires_at: null,
      session_pasted_at: null,
      last_verified_at: null,
      last_error: null,
      created_by: user.id,
      updated_at: now,
    }
  }

  const { error } = await createAdminClient()
    .from('hudl_credentials')
    .upsert(row, { onConflict: 'team_id' })

  if (error) {
    // The error is logged without the row, because the row contains the
    // ciphertext and supabase-js error objects can echo the payload back.
    console.error('[hudl] failed to store credentials for team', teamId, error.message)
    return NextResponse.json({ error: 'Could not save the connection.' }, { status: 500 })
  }

  // Not verified yet. Nothing here has touched Hudl — only the worker has a
  // browser — so claiming success would mean a coach discovers a typo three
  // days later when a batch silently fails. The card's "Test connection"
  // button is what turns that into an answer in under a minute.
  return NextResponse.json({
    connected: true,
    email,
    authMode: session ? 'session' : 'password',
    verified: false,
    // Counts only, so a coach can see the paste was read the way they expected
    // and that their other sites' cookies were thrown away.
    ...(session ? { cookiesStored: sessionCookies, cookiesDropped: sessionDropped } : {}),
  })
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
