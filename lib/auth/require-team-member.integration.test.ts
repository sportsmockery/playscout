import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Real RLS/security integration tests (0A.1) — exercise the actual PostgREST
 * + RLS path with real signed-in sessions, not mocks or raw SQL. Every
 * fixture (org, teams, users) is created and torn down inside this file, so
 * running it repeatedly against the live project leaves no residue —
 * verified by querying for leftovers in afterAll.
 *
 * Skipped by default (RUN_INTEGRATION_TESTS unset — every `it` below shows
 * as skipped, not run): creating/deleting real auth users needs
 * SUPABASE_SERVICE_ROLE_KEY, which CI doesn't have configured against a
 * dedicated test project yet — there's no local Supabase stack or Docker
 * available to spin up an isolated one instead. Run manually against a real
 * project with:
 *   RUN_INTEGRATION_TESTS=true npx vitest run lib/auth/require-team-member.integration.test.ts
 * (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SERVICE_ROLE_KEY already
 * need to be set in the environment for the app itself to run.)
 */
const RUN = process.env.RUN_INTEGRATION_TESTS === 'true'
const describeIntegration = RUN ? describe : describe.skip

describeIntegration('0A.1 security: admin/team-access RLS (real sessions, self-cleaning fixtures)', () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  let admin: SupabaseClient
  let orgAId: string
  let orgBId: string
  let teamAId: string
  let teamBId: string
  let ownerAEmail: string
  let coachAEmail: string
  let ownerBEmail: string
  let ownerAId: string
  let coachAId: string
  let ownerBId: string
  const TEST_PASSWORD = `Test-${crypto.randomUUID()}!`
  const createdUserIds: string[] = []

  async function signInAs(email: string): Promise<SupabaseClient> {
    const client = createClient(supabaseUrl, anonKey)
    const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
    if (error) throw error
    return client
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // A wrong/empty fixture id must fail LOUDLY here, not silently make every
  // downstream RLS assertion a false positive (e.g. `.eq('id', undefined)`
  // matching zero rows for the wrong reason). Every id is asserted valid
  // and, where it matters, distinct from its sibling immediately after
  // creation — this function is the single chokepoint for that check.
  function assertRealId(label: string, id: string | undefined): asserts id is string {
    if (!id || !UUID_RE.test(id)) throw new Error(`beforeAll fixture setup failed: ${label} is not a real id (got ${JSON.stringify(id)})`)
  }

  beforeAll(async () => {
    admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const stamp = Date.now()

    const { data: orgA, error: orgAErr } = await admin.from('organizations').insert({ name: `0A1-test-org-A-${stamp}` }).select().single()
    if (orgAErr) throw orgAErr
    const { data: orgB, error: orgBErr } = await admin.from('organizations').insert({ name: `0A1-test-org-B-${stamp}` }).select().single()
    if (orgBErr) throw orgBErr
    orgAId = orgA.id
    orgBId = orgB.id
    assertRealId('orgAId', orgAId)
    assertRealId('orgBId', orgBId)
    if (orgAId === orgBId) throw new Error('beforeAll fixture setup failed: orgAId === orgBId')

    const { data: teamA, error: teamAErr } = await admin.from('teams').insert({ organization_id: orgAId, name: 'Test Team A', age_group: '10U' }).select().single()
    if (teamAErr) throw teamAErr
    const { data: teamB, error: teamBErr } = await admin.from('teams').insert({ organization_id: orgBId, name: 'Test Team B', age_group: '10U' }).select().single()
    if (teamBErr) throw teamBErr
    teamAId = teamA.id
    teamBId = teamB.id
    assertRealId('teamAId', teamAId)
    assertRealId('teamBId', teamBId)
    if (teamAId === teamBId) throw new Error('beforeAll fixture setup failed: teamAId === teamBId')

    ownerAEmail = `0a1-owner-a-${stamp}@example.test`
    coachAEmail = `0a1-coach-a-${stamp}@example.test`
    ownerBEmail = `0a1-owner-b-${stamp}@example.test`

    const { data: ownerA, error: ownerAUserErr } = await admin.auth.admin.createUser({ email: ownerAEmail, password: TEST_PASSWORD, email_confirm: true })
    if (ownerAUserErr) throw ownerAUserErr
    const { data: coachA, error: coachAUserErr } = await admin.auth.admin.createUser({ email: coachAEmail, password: TEST_PASSWORD, email_confirm: true })
    if (coachAUserErr) throw coachAUserErr
    const { data: ownerB, error: ownerBUserErr } = await admin.auth.admin.createUser({ email: ownerBEmail, password: TEST_PASSWORD, email_confirm: true })
    if (ownerBUserErr) throw ownerBUserErr
    ownerAId = ownerA.user.id
    coachAId = coachA.user.id
    ownerBId = ownerB.user.id
    assertRealId('ownerAId', ownerAId)
    assertRealId('coachAId', coachAId)
    assertRealId('ownerBId', ownerBId)
    createdUserIds.push(ownerAId, coachAId, ownerBId)

    const { error: memberErr } = await admin.from('organization_members').insert([
      { organization_id: orgAId, user_id: ownerAId, role: 'owner' },
      { organization_id: orgAId, user_id: coachAId, role: 'coach' },
      { organization_id: orgBId, user_id: ownerBId, role: 'owner' },
    ])
    if (memberErr) throw memberErr
  }, 30000)

  afterAll(async () => {
    for (const id of createdUserIds) {
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) console.error(`cleanup: failed to delete user ${id}:`, error.message)
    }
    const { error: teamDeleteErr } = await admin.from('teams').delete().in('id', [teamAId, teamBId])
    if (teamDeleteErr) console.error('cleanup: failed to delete teams:', teamDeleteErr.message)
    const { error: orgDeleteErr } = await admin.from('organizations').delete().in('id', [orgAId, orgBId])
    if (orgDeleteErr) console.error('cleanup: failed to delete organizations:', orgDeleteErr.message)

    // Prove cleanup actually worked, not just that the calls didn't throw —
    // this must be checked in a run separate from the beforeAll/it calls
    // that used the same in-memory ids, which is why CI/manual runs should
    // also spot-check via the Supabase dashboard after the first real run.
    const { data: leftoverOrgs } = await admin.from('organizations').select('id').in('id', [orgAId, orgBId])
    const { data: leftoverTeams } = await admin.from('teams').select('id').in('id', [teamAId, teamBId])
    expect(leftoverOrgs ?? []).toHaveLength(0)
    expect(leftoverTeams ?? []).toHaveLength(0)
  }, 30000)

  it('org A user cannot READ org B data (cross-org isolation)', async () => {
    const asOwnerA = await signInAs(ownerAEmail)
    const { data, error } = await asOwnerA.from('teams').select('*').eq('id', teamBId).maybeSingle()
    expect(error).toBeNull() // RLS denies by returning no rows, not an error
    expect(data).toBeNull()
  })

  it('org A user cannot WRITE to org B data (cross-org isolation)', async () => {
    const asOwnerA = await signInAs(ownerAEmail)
    const { data } = await asOwnerA
      .from('teams')
      .update({ notes: 'should not be allowed' })
      .eq('id', teamBId)
      .select()
    expect(data ?? []).toHaveLength(0)
  })

  it('a non-admin (coach) cannot grant team access to another user', async () => {
    const asCoachA = await signInAs(coachAEmail)
    // Coaches aren't allowed to write organization_members rows at all —
    // this mirrors what the /api/admin/team-access route's requireAdmin()
    // gate protects, exercised here at the RLS layer directly.
    const { data } = await asCoachA
      .from('organization_members')
      .update({ role: 'admin' })
      .eq('user_id', coachAId)
      .eq('organization_id', orgAId)
      .select()
    expect(data ?? []).toHaveLength(0)
  })

  it('an org owner CAN read their own org team (positive control — proves the denials above are real, not a broken test)', async () => {
    const asOwnerA = await signInAs(ownerAEmail)
    const { data, error } = await asOwnerA.from('teams').select('*').eq('id', teamAId).maybeSingle()
    expect(error).toBeNull()
    expect(data?.id).toBe(teamAId)
  })
})
