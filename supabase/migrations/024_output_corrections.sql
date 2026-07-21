-- 024_output_corrections.sql
--
-- Every coach edit to an AI analysis is proprietary training data — this is
-- the correction flywheel's first real rows (see CLAUDE.md's "defensible
-- assets"). One row per changed FIELD (not per edit), so a single Save that
-- changes three fields writes three rows. ai_value always holds the model's
-- true original output for that field, never a previously-corrected value —
-- the PATCH routes source it from original_result/original_play (migration
-- 020), which is itself only ever snapshotted once.
--
-- team_id is denormalized from the parent row rather than joined through
-- result_type at query time, so RLS can be a single can_access_team() check
-- regardless of which table result_id points into.

create table if not exists public.output_corrections (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  result_id uuid not null,
  result_type text not null check (result_type in ('position_analysis_result', 'playbook_play')),
  field text not null,
  ai_value jsonb,
  corrected_value jsonb,
  ai_confidence numeric,
  model text,
  prompt_version text,
  corrected_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists output_corrections_result_idx on public.output_corrections (result_type, result_id);
create index if not exists output_corrections_team_idx on public.output_corrections (team_id);

alter table public.output_corrections enable row level security;

create policy "Team members can read output corrections"
  on public.output_corrections for select
  using (can_access_team(team_id));

create policy "Coaches can write output corrections"
  on public.output_corrections for insert
  with check (
    can_access_team(team_id)
    and exists (
      select 1 from teams t join organization_members om on om.organization_id = t.organization_id
      where t.id = output_corrections.team_id and om.user_id = auth.uid()
      and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  );

-- No update/delete policy — corrections are an append-only audit log.
