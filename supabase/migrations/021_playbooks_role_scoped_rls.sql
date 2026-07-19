-- 021_playbooks_role_scoped_rls.sql
--
-- playbooks/playbook_analyses previously had a single permissive "ALL"
-- policy keyed only on org membership — any org member (including a
-- viewer, or a coach with no access grant to this specific team) could
-- upload, edit, or delete a team's playbooks. Replaces it with the same
-- can_access_team + write-role pattern already used by playbook_plays
-- and position_analysis_results (migration 020), needed so Priority 4's
-- delete UI is actually write-permission gated rather than relying on
-- the API route alone.

drop policy if exists "team_members_playbooks" on public.playbooks;
drop policy if exists "team_members_playbook_analyses" on public.playbook_analyses;

create policy "Team members can read playbooks"
  on public.playbooks for select
  using (can_access_team(team_id));

create policy "Coaches can manage playbooks"
  on public.playbooks for all
  using (
    can_access_team(team_id)
    and exists (
      select 1 from teams t join organization_members om on om.organization_id = t.organization_id
      where t.id = playbooks.team_id and om.user_id = auth.uid()
      and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  )
  with check (
    can_access_team(team_id)
    and exists (
      select 1 from teams t join organization_members om on om.organization_id = t.organization_id
      where t.id = playbooks.team_id and om.user_id = auth.uid()
      and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  );

create policy "Team members can read playbook analyses"
  on public.playbook_analyses for select
  using (can_access_team(team_id));

create policy "Coaches can manage playbook analyses"
  on public.playbook_analyses for all
  using (
    can_access_team(team_id)
    and exists (
      select 1 from teams t join organization_members om on om.organization_id = t.organization_id
      where t.id = playbook_analyses.team_id and om.user_id = auth.uid()
      and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  )
  with check (
    can_access_team(team_id)
    and exists (
      select 1 from teams t join organization_members om on om.organization_id = t.organization_id
      where t.id = playbook_analyses.team_id and om.user_id = auth.uid()
      and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  );
