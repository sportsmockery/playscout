-- 20260904010000_hudl_credentials.sql
--
-- A coach's Hudl login, so the worker can pull their film unattended.
--
-- This is the first third-party secret PlayScout holds, so the protections are
-- deliberate rather than inherited:
--
--   * Values arrive already encrypted (AES-256-GCM, lib/crypto/secret-box.ts).
--     Postgres never sees the plaintext, and neither does a database backup,
--     a log drain, or anyone with read access to the table.
--   * There is NO SELECT POLICY. Not a narrow one — none. No authenticated
--     client can read this table under any role. Only the service role, which
--     bypasses RLS, and that runs solely inside the Railway worker.
--   * The UI needs status, not secrets, so it never touches this table at
--     all — see the note above the trailing comment for how status is served.
--
-- Storing a password is a real cost and it was chosen knowingly over
-- session-only capture, because unattended re-login is the point. The session
-- is cached alongside so the password is used rarely rather than every job.

create table if not exists public.hudl_credentials (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,

  -- Not sealed: the UI has to show which account is connected, and it is not
  -- a secret on its own.
  hudl_email text not null,

  -- `v1:<iv>:<authTag>:<ciphertext>` — see lib/crypto/secret-box.ts.
  sealed_password text not null,

  -- Cookies from the last successful login. Kept so most jobs reuse a live
  -- session instead of re-authenticating, which is both faster and a lot less
  -- likely to trip Hudl's own abuse detection.
  sealed_session text,
  session_expires_at timestamptz,

  last_verified_at timestamptz,
  -- Coach-readable, e.g. "Hudl asked for a verification code". NEVER a raw
  -- exception: those carry URLs with session tokens in them.
  last_error text,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One Hudl account per team. Re-binding replaces rather than accumulating.
  unique (team_id)
);

alter table public.hudl_credentials enable row level security;

-- Deliberately no SELECT policy. Reading is the service role's job alone.

create policy "Coaches can connect a Hudl account"
  on public.hudl_credentials for insert
  with check (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = hudl_credentials.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach'])
    )
  );

create policy "Coaches can update their team's Hudl connection"
  on public.hudl_credentials for update
  using (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = hudl_credentials.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach'])
    )
  )
  with check (public.can_access_team(team_id));

-- Disconnecting must always be possible: it is the kill switch for every
-- future job, and a coach should never have to ask someone to run SQL for it.
create policy "Coaches can disconnect their team's Hudl account"
  on public.hudl_credentials for delete
  using (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = hudl_credentials.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach'])
    )
  );

-- No view, and deliberately so. A `security_invoker` view inherits the base
-- table's RLS, and with no SELECT policy it would return nothing; a
-- `security_definer` one would bypass RLS entirely and leak every team's row
-- unless the view re-implemented the access check. Both are ways to get this
-- subtly wrong in a migration nobody re-reads.
--
-- Status is served instead by an API route that does its own team check and
-- then reads with the service role (lib/supabase/admin.ts), returning only the
-- non-secret fields. The authorization lives in code that is tested, and the
-- table keeps the simplest possible rule: no client reads it, ever.

comment on table public.hudl_credentials is
  'Encrypted third-party credentials. No SELECT policy on purpose — service role only. Status is served by /api/integrations/hudl, which authorizes then reads with the service role.';
