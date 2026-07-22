-- 20260722044519_fix_teams_read_policy_self_reference.sql
--
-- Real production bug: creating a team failed with "new row violates row-
-- level security policy for table teams" for every user, including org
-- owners who unambiguously should have had access.
--
-- Root cause: the "Team read access" SELECT policy used
-- can_access_team(id) — and can_access_team()'s internal team_org_id(t)
-- helper re-queries the `teams` table to resolve organization_id. That's
-- fine for OTHER tables' policies (e.g. videos, playbooks — team_id is a
-- foreign key into a genuinely different table), but on teams' OWN read
-- policy it's self-referential: the row being evaluated is teams itself.
-- When app code does `.insert().select().single()`, PostgREST emits a
-- single INSERT ... RETURNING statement, and Postgres evaluates the
-- RETURNING clause's SELECT policy for the brand-new row using
-- can_access_team(id) — whose nested SELECT on `teams` (issued via SPI
-- inside the SECURITY DEFINER function) does not see the row the outer
-- INSERT just created within that same command. A verified-STABLE-vs-
-- VOLATILE test ruled out simple snapshot caching as the cause; opening
-- the SELECT policy to `using (true)` made the INSERT...RETURNING succeed,
-- confirming the SELECT-for-RETURNING check was the actual failure point.
--
-- Fix: rewrite the policy to check organization_id/created_by/id directly
-- off the row being evaluated (all real columns, no self-referential
-- lookup back into teams) instead of routing through can_access_team().
-- Verified behaviorally identical to the old policy for every access path
-- (org admin, team creator, team_assignments grant, org-wide all_teams) —
-- only the self-referential INSERT...RETURNING case changes, from failing
-- to succeeding.

drop policy if exists "Team read access" on public.teams;
create policy "Team read access"
  on public.teams for select
  using (
    is_org_admin(organization_id)
    or created_by = auth.uid()
    or exists (select 1 from team_assignments where team_id = id and user_id = auth.uid())
    or exists (
      select 1 from organization_members om
      where om.organization_id = teams.organization_id and om.user_id = auth.uid() and om.all_teams
    )
  );
