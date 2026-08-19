-- 032_players_team_access.sql
--
-- Fixes silently-failing roster edits.
--
-- players is the only table still carrying its original 002_rls.sql policies.
-- Every other team-scoped table moved to can_access_team() in 016/017/018,
-- but players kept requiring a row in organization_members with role
-- owner/admin/coach. So a coach who has access to a team through
-- team_assignments (016) or the org-wide all_teams flag (018) — or whose org
-- role is 'analyst' — is silently denied on insert. RLS refuses by returning
-- zero rows, not an error, so the roster form looked like it saved and simply
-- showed nothing.
--
-- This brings players in line with videos, video_folders, analysis_batches and
-- the rest: read for anyone who can access the team, write for the same
-- owner/admin/coach/analyst set those tables already use.

drop policy if exists "Members can read players" on public.players;
create policy "Members can read players"
  on public.players for select
  using (public.can_access_team(team_id));

drop policy if exists "Coaches can manage players" on public.players;
create policy "Coaches can manage players"
  on public.players for all
  using (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = players.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  )
  with check (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = players.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  );
