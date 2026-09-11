import { NextResponse } from 'next/server'
import { authenticateMobile, mobileError } from '@/lib/mobile/auth'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'

export const runtime = 'nodejs'

/**
 * Fields a coach may set on a team from the app. Everything else on the row
 * (id, organization_id, created_by) is derived server-side — a client that can
 * name organization_id can move a team into somebody else's organization.
 */
const EDITABLE = [
  'name',
  'age_group',
  'season',
  'level',
  'game_type',
  'league',
  'state',
  'offensive_style',
  'defensive_style',
  'home_jersey_color',
  'away_jersey_color',
  'notes',
] as const

/** Drives the contact-drill safety gate, so it cannot be free text. */
const GAME_TYPES = ['flag', 'tackle', 'rookie_tackle']

type Editable = (typeof EDITABLE)[number]

function pickFields(body: Record<string, unknown>): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const key of EDITABLE) {
    if (!(key in body)) continue
    const raw = body[key as Editable]
    const value = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw).trim()
    out[key] = value === '' ? null : value
  }
  return out
}

/**
 * POST /api/mobile/teams — create a team.
 *
 * The org is resolved server-side. The teams INSERT policy requires an
 * owner/admin/coach membership in the target org, so an existing membership
 * with a weaker role cannot be reused; when there is no usable org we bootstrap
 * one with this user as its owner. That mirrors the web's create flow, but here
 * it is one server round trip instead of three from a phone on a hotspot —
 * a half-completed bootstrap leaves an org with no team behind.
 */
export async function POST(req: Request) {
  const auth = await authenticateMobile(req)
  if (auth.error) return auth.error
  const { supabase, userId } = auth.ok

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const fields = pickFields(body)
  if (!fields.name) return mobileError('A team name is required.', 400)
  if (fields.game_type && !GAME_TYPES.includes(fields.game_type)) {
    return mobileError('That game type is not one we recognise.', 400)
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .in('role', ['owner', 'admin', 'coach'])
    .limit(1)
    .maybeSingle()

  let organizationId = membership?.organization_id

  if (!organizationId) {
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .insert({ name: `${fields.name} Organization`, created_by: userId })
      .select('id')
      .maybeSingle()
    if (orgErr || !org) return mobileError('Could not set up your organization.', 403)

    const { error: memberErr } = await supabase
      .from('organization_members')
      .insert({ organization_id: org.id, user_id: userId, role: 'owner' })
    if (memberErr) {
      // Without the membership the org is unreachable and every later team
      // create would find it and fail the INSERT policy. Leave nothing behind.
      await supabase.from('organizations').delete().eq('id', org.id)
      return mobileError('Could not set up your organization.', 403)
    }
    organizationId = org.id
  }

  const { data, error } = await supabase
    .from('teams')
    .insert({ ...fields, organization_id: organizationId, created_by: userId })
    .select()
    .maybeSingle()

  // RLS denies by returning no row rather than an error.
  if (error) return mobileError(error.message, 403)
  if (!data) {
    return mobileError(
      "That team wasn't created — your account doesn't have permission to add teams to this organization.",
      403,
    )
  }

  return NextResponse.json({ team: data })
}

/** PATCH /api/mobile/teams — update the team settings a coach can change. */
export async function PATCH(req: Request) {
  const auth = await authenticateMobile(req)
  if (auth.error) return auth.error
  const { supabase } = auth.ok

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const teamId = typeof body.teamId === 'string' ? body.teamId : null
  if (!teamId) return mobileError('teamId is required.', 400)

  const access = await requireTeamMember(teamId, { supabase, writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const fields = pickFields(body)
  if (Object.keys(fields).length === 0) return mobileError('Nothing to update.', 400)
  if ('name' in fields && !fields.name) return mobileError('A team name is required.', 400)
  if (fields.game_type && !GAME_TYPES.includes(fields.game_type)) {
    return mobileError('That game type is not one we recognise.', 400)
  }

  const { data, error } = await supabase
    .from('teams')
    .update(fields)
    .eq('id', teamId)
    .select()
    .maybeSingle()

  if (error) return mobileError(error.message, 403)
  if (!data) {
    return mobileError(
      "Those changes weren't saved — your account doesn't have write access to this team.",
      403,
    )
  }

  return NextResponse.json({ team: data })
}
