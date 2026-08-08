-- ScoutIQ output store (System A aggregation stage — see Phase 6). One row
-- per generated game plan for a team/opponent pair, built from all opponent
-- clips scouted so far.

create table if not exists public.scout_reports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  opponent_id uuid not null references public.opponents(id) on delete cascade,
  based_on_video_ids uuid[] not null default '{}',
  offensive_tendencies jsonb,
  defensive_tendencies jsonb,
  formations jsonb,
  plays jsonb,
  target_players jsonb,
  situational_tells jsonb,
  game_plan jsonb,
  evidence_sufficiency jsonb,
  summary text,
  model_provider text,
  model_name text,
  created_at timestamptz not null default now()
);

alter table public.scout_reports enable row level security;

drop policy if exists "Members can read scout reports" on public.scout_reports;
create policy "Members can read scout reports"
  on public.scout_reports for select
  using (
    exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = scout_reports.team_id
      and om.user_id = auth.uid()
    )
  );

drop policy if exists "Coaches can insert scout reports" on public.scout_reports;
create policy "Coaches can insert scout reports"
  on public.scout_reports for insert
  with check (
    exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = scout_reports.team_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin','coach','analyst')
    )
  );

insert into public.intelligence_modules (key, name, position_group, description) values
  ('SCOUTIQ', 'Opponent Scout Intelligence', 'TEAM', 'Scouts an opponent''s film for formations, tendencies, target players, and situational tells, then builds a game plan against the team''s own roster and playbook.')
on conflict (key) do nothing;
