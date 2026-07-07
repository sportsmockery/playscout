-- 013_analysis_write_policies.sql
-- position_analysis_results and team_memory only ever got a SELECT policy
-- (002_rls.sql). With RLS enabled and no INSERT policy, every insert is
-- denied by default — no module's "Run Analysis" could ever save a result,
-- and PlayScoutIQ's team-memory embeddings could never be written. Mirrors
-- the existing "Coaches can manage videos" role gate (owner/admin/coach/
-- analyst) via the same teams -> organization_members join pattern.

create policy "Coaches can insert analysis results"
  on public.position_analysis_results for insert
  with check (exists (
    select 1 from public.teams t
    join public.organization_members om on om.organization_id = t.organization_id
    where t.id = position_analysis_results.team_id
    and om.user_id = auth.uid()
    and om.role in ('owner','admin','coach','analyst')
  ));

create policy "Coaches can insert team memory"
  on public.team_memory for insert
  with check (exists (
    select 1 from public.teams t
    join public.organization_members om on om.organization_id = t.organization_id
    where t.id = team_memory.team_id
    and om.user_id = auth.uid()
    and om.role in ('owner','admin','coach','analyst')
  ));
