-- 020_analysis_corrections.sql
--
-- Lets a coach correct an AI analysis (QBIQ/OLIQ result, or a playbook play)
-- without losing the original AI output. Neither table had an UPDATE policy
-- at all before this, so edits were impossible even at the DB layer.

alter table public.position_analysis_results
  add column if not exists edited_by uuid references auth.users(id),
  add column if not exists edited_at timestamptz,
  -- Snapshot of the AI's original fields, written once on the first edit —
  -- never overwritten again, so "what the AI actually said" is never lost.
  add column if not exists original_result jsonb;

alter table public.playbook_plays
  add column if not exists edited_by uuid references auth.users(id),
  add column if not exists edited_at timestamptz,
  add column if not exists original_play jsonb;

-- Same write-role bar as each table's existing insert policy / video-management
-- policy (owner/admin/coach/analyst) — read-only 'viewer' members cannot edit.
create policy "Coaches can update analysis results"
  on public.position_analysis_results for update
  using (
    exists (
      select 1 from teams t
      join organization_members om on om.organization_id = t.organization_id
      where t.id = position_analysis_results.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  )
  with check (
    exists (
      select 1 from teams t
      join organization_members om on om.organization_id = t.organization_id
      where t.id = position_analysis_results.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  );

create policy "Coaches can update playbook plays"
  on public.playbook_plays for update
  using (
    exists (
      select 1 from teams t
      join organization_members om on om.organization_id = t.organization_id
      where t.id = playbook_plays.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  )
  with check (
    exists (
      select 1 from teams t
      join organization_members om on om.organization_id = t.organization_id
      where t.id = playbook_plays.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  );
