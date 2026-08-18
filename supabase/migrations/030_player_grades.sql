-- 030_player_grades.sql
--
-- RANKERIQ: one row per player, per clip, per graded rep.
--
-- The other modules answer "how did this position group look?" RankerIQ
-- answers "who played well?" — so its output is inherently a LIST of players,
-- not a score, and it needs its own table for the same reason mistake_events
-- exists: a per-player grade buried in a jsonb blob can't be ranked across a
-- game, rolled up onto a player profile, or trended over a season.
--
-- player_id is nullable and ON DELETE SET NULL on purpose. Most youth film is
-- shot too wide to read every jersey, so a large share of grades are
-- identified by role ("left tackle") rather than matched to a roster row.
-- Those grades are still useful to a coach watching the clip, and losing the
-- rep entirely because the number wasn't legible would be worse than keeping
-- it unattributed.

create table if not exists public.player_grades (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  analysis_result_id uuid references public.position_analysis_results(id) on delete cascade,
  play_sequence_id uuid references public.play_sequences(id) on delete set null,
  -- Set only when a legible jersey number matched exactly one roster player
  -- (see matchRosterPlayer in lib/intelligence/player-grades.ts).
  player_id uuid references public.players(id) on delete set null,
  jersey_number text,
  identifier text not null,
  position text,
  role_on_play text,
  side text check (side in ('offense', 'defense', 'special_teams', 'unclear')),
  -- Computed server-side from the observed factors below, never taken from
  -- the model, so grades are comparable across clips.
  grade int not null,
  letter text,
  execution int,
  difficulty int,
  impact text,
  rank_in_clip int,
  note text,
  identification_confidence numeric,
  evidence jsonb,
  model_provider text,
  model_name text,
  created_at timestamptz not null default now()
);

create index if not exists player_grades_team_created_idx on public.player_grades (team_id, created_at desc);
create index if not exists player_grades_player_idx on public.player_grades (player_id) where player_id is not null;
create index if not exists player_grades_video_idx on public.player_grades (video_id);
create index if not exists player_grades_analysis_idx on public.player_grades (analysis_result_id);

alter table public.player_grades enable row level security;

drop policy if exists "Members can read player grades" on public.player_grades;
create policy "Members can read player grades"
  on public.player_grades for select
  using (public.can_access_team(team_id));

drop policy if exists "Coaches can manage player grades" on public.player_grades;
create policy "Coaches can manage player grades"
  on public.player_grades for all
  using (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = player_grades.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  )
  with check (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = player_grades.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  );

-- Registry metadata, matching how the other shipped modules are recorded.
insert into public.intelligence_modules (key, name, position_group, description) values
  ('RANKERIQ', 'Player Ranking Intelligence', 'TEAM',
   'Grades and ranks every player on the team''s unit in a clip — by position, execution, difficulty of the assignment, and value to the play — with a short note on how each grade was decided.')
on conflict (key) do nothing;
