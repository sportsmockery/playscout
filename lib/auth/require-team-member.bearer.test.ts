import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireTeamMember, WRITE_ROLES } from './require-team-member'

// If a caller passes opts.supabase (the request-scoped client a mobile Bearer
// request builds), the guard must use THAT client and never fall back to the
// cookie client. We assert this by mocking the cookie factory to throw — if the
// guard touched it, the test would fail — and by driving the whole decision
// through the injected client. This proves cookie/bearer parity: identical
// membership logic, different transport.
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => {
    throw new Error('cookie client must not be used when a request-scoped client is provided')
  },
}))

interface Row {
  data: unknown
}

/** Minimal chainable PostgREST/query stub returning a preset row per table. */
function makeClient(opts: {
  userId: string | null
  team?: Row
  membership?: Row
  assignment?: Row
}): SupabaseClient {
  const table = (data: unknown) => {
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq']) builder[m] = () => builder
    builder.maybeSingle = () => Promise.resolve({ data })
    return builder
  }
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: opts.userId ? { id: opts.userId } : null } }),
    },
    from: (name: string) => {
      if (name === 'teams') return table(opts.team?.data ?? null)
      if (name === 'organization_members') return table(opts.membership?.data ?? null)
      if (name === 'team_assignments') return table(opts.assignment?.data ?? null)
      return table(null)
    },
  } as unknown as SupabaseClient
}

describe('requireTeamMember with an injected request-scoped client', () => {
  it('grants a coach write access using only the provided client', async () => {
    const supabase = makeClient({
      userId: 'user-1',
      team: { data: { organization_id: 'org-1', created_by: 'someone-else' } },
      membership: { data: { role: 'coach', all_teams: false } },
      assignment: { data: { id: 'ta-1' } },
    })
    const res = await requireTeamMember('team-1', { supabase, writeRoles: WRITE_ROLES })
    expect(res.error).toBeUndefined()
    expect(res.role).toBe('coach')
    expect(res.user?.id).toBe('user-1')
  })

  it('rejects a viewer that lacks write access (403)', async () => {
    const supabase = makeClient({
      userId: 'user-2',
      team: { data: { organization_id: 'org-1', created_by: 'x' } },
      membership: { data: { role: 'viewer', all_teams: false } },
      assignment: { data: { id: 'ta-1' } }, // has access, but not write
    })
    const res = await requireTeamMember('team-1', { supabase, writeRoles: WRITE_ROLES })
    expect(res.error?.status).toBe(403)
  })

  it('rejects an unauthenticated request (401)', async () => {
    const supabase = makeClient({ userId: null })
    const res = await requireTeamMember('team-1', { supabase })
    expect(res.error?.status).toBe(401)
  })

  it('denies access when the user has no membership or grant (403)', async () => {
    const supabase = makeClient({
      userId: 'user-3',
      team: { data: { organization_id: 'org-1', created_by: 'x' } },
      membership: { data: null },
      assignment: { data: null },
    })
    const res = await requireTeamMember('team-1', { supabase })
    expect(res.error?.status).toBe(403)
  })
})
