import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { ASSIGNABLE_ROLES } from '@/lib/auth/roles'
import { requireAdmin } from '@/lib/auth/require-admin'

export const runtime = 'nodejs'

function genTempPassword() {
  // 14 chars, guaranteed to satisfy typical policies.
  const base = randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 11)
  return `${base}9!Aa`.slice(0, 14)
}

/** List the members of the caller's organization, with emails. */
export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const admin = createAdminClient()

  const { data: rows, error } = await admin
    .from('organization_members')
    .select('id, user_id, role, created_at')
    .eq('organization_id', auth.organizationId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Org teams + all assignments, so the UI can show/assign per member.
  const { data: teams } = await admin
    .from('teams')
    .select('id, name')
    .eq('organization_id', auth.organizationId)
    .order('name', { ascending: true })
  const teamIds = new Set((teams ?? []).map((t) => t.id))
  const { data: assigns } = await admin
    .from('team_assignments')
    .select('team_id, user_id')
    .in('team_id', teamIds.size ? [...teamIds] : ['00000000-0000-0000-0000-000000000000'])
  const byUser = new Map<string, string[]>()
  for (const a of assigns ?? []) {
    byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a.team_id])
  }

  const members = await Promise.all(
    (rows ?? []).map(async (r) => {
      const { data } = await admin.auth.admin.getUserById(r.user_id)
      return {
        id: r.id,
        userId: r.user_id,
        role: r.role,
        email: data?.user?.email ?? '(unknown)',
        lastSignInAt: data?.user?.last_sign_in_at ?? null,
        isSelf: r.user_id === auth.user.id,
        teamIds: byUser.get(r.user_id) ?? [],
      }
    })
  )
  return NextResponse.json({ members, teams: teams ?? [] })
}

/** Create (or attach an existing) user to the org with a role. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const admin = createAdminClient()

  const body = await req.json().catch(() => ({}))
  const email = String(body.email ?? '').trim().toLowerCase()
  const role = String(body.role ?? '')

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }
  if (!ASSIGNABLE_ROLES.includes(role as (typeof ASSIGNABLE_ROLES)[number])) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }

  // Create the auth user, or find them if they already exist.
  let userId: string | null = null
  let tempPassword: string | null = null

  const tempPass = genTempPassword()
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPass,
    email_confirm: true,
  })

  if (created?.user) {
    userId = created.user.id
    tempPassword = tempPass
  } else if (createErr) {
    // Already registered → locate the existing user and just add membership.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const existing = list?.users.find((u) => u.email?.toLowerCase() === email)
    if (!existing) {
      return NextResponse.json({ error: createErr.message }, { status: 400 })
    }
    userId = existing.id
  }

  if (!userId) return NextResponse.json({ error: 'Could not create user.' }, { status: 500 })

  const { error: memErr } = await admin
    .from('organization_members')
    .insert({ organization_id: auth.organizationId, user_id: userId, role })

  if (memErr) {
    if (memErr.code === '23505') {
      return NextResponse.json({ error: 'That user is already in your organization.' }, { status: 409 })
    }
    return NextResponse.json({ error: memErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, userId, email, role, tempPassword })
}

/** Change a member's role. */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const admin = createAdminClient()

  const body = await req.json().catch(() => ({}))
  const userId = String(body.userId ?? '')
  const role = String(body.role ?? '')

  if (!ASSIGNABLE_ROLES.includes(role as (typeof ASSIGNABLE_ROLES)[number])) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }
  if (userId === auth.user.id) {
    return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 400 })
  }

  // Never modify the owner via this endpoint.
  const { data: target } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', auth.organizationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!target) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'The owner role cannot be changed.' }, { status: 400 })
  }

  const { error } = await admin
    .from('organization_members')
    .update({ role })
    .eq('organization_id', auth.organizationId)
    .eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** Remove a member from the org (does not delete their auth account). */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const admin = createAdminClient()

  const body = await req.json().catch(() => ({}))
  const userId = String(body.userId ?? '')

  if (userId === auth.user.id) {
    return NextResponse.json({ error: 'You cannot remove yourself.' }, { status: 400 })
  }
  const { data: target } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', auth.organizationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!target) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'The owner cannot be removed.' }, { status: 400 })
  }

  const { error } = await admin
    .from('organization_members')
    .delete()
    .eq('organization_id', auth.organizationId)
    .eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
