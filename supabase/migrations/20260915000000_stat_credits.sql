-- 20260915000000_stat_credits.sql
--
-- STATSIQ: one row per stat credit — one player, one play, one thing they did.
--
-- This is deliberately an event ledger and not a stats table. A `player_stats`
-- row holding "carries: 14" can only ever answer the question it was written
-- to answer; the credits it was built from answer every other one — this
-- player's yards on first down, the left guard's pull count, a season total,
-- the same box score recomputed after a coach fixes a jersey number. Rolling
-- credits up is cheap; taking a total apart is impossible.
--
-- It is also what makes the numbers auditable. Each row carries the position
-- it was credited to, whether a jersey number survived verification, and the
-- basis for its yardage — so "84 rushing yards" can always be expanded into
-- the carries that made it and the moments in the film they were seen at.
--
-- player_id is nullable and ON DELETE SET NULL for the same reason it is on
-- player_grades: most film cannot resolve a jersey number, so most credits are
-- filed under a position. A credit with no roster match is still true.

create table if not exists public.play_stat_credits (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  analysis_result_id uuid references public.position_analysis_results(id) on delete cascade,
  play_sequence_id uuid references public.play_sequences(id) on delete set null,
  -- Position of this play within the analyzed clip, 1-based.
  play_index int not null default 1,
  side text not null check (side in ('offense', 'defense')),
  -- One of lib/intelligence/stat-lines.ts STAT_KINDS. Left as text rather than
  -- an enum so adding a stat is a code change, not a migration + deploy race.
  stat text not null,
  -- The closed vocabulary in lib/intelligence/positions.ts. This is the
  -- primary subject of a credit; the jersey number below is the exception.
  position_id text not null,
  position_label text,
  position_detail text,
  role_on_play text,
  -- Null when the film could not measure the gain. NOT zero: a carry we could
  -- not measure is not a carry for no gain, and averaging it as one would
  -- understate every back on wide film.
  yards numeric,
  yards_basis text check (yards_basis in ('coach_breakdown', 'field_landmarks', 'not_determinable')),
  touchdown boolean not null default false,
  mistake_category text,
  -- Set only when a legible jersey number cleared every gate in
  -- resolvePlayerIdentity and matched exactly one roster player.
  player_id uuid references public.players(id) on delete set null,
  jersey_number text,
  identified_by text check (identified_by in ('roster', 'number', 'position')),
  number_rejected_reason text,
  identifier text not null,
  note text,
  evidence jsonb,
  model_provider text,
  model_name text,
  created_at timestamptz not null default now()
);

create index if not exists play_stat_credits_team_created_idx
  on public.play_stat_credits (team_id, created_at desc);
create index if not exists play_stat_credits_player_idx
  on public.play_stat_credits (player_id) where player_id is not null;
create index if not exists play_stat_credits_video_idx on public.play_stat_credits (video_id);
create index if not exists play_stat_credits_analysis_idx on public.play_stat_credits (analysis_result_id);
-- The season box score: every credit for a team at a position.
create index if not exists play_stat_credits_team_position_idx
  on public.play_stat_credits (team_id, side, position_id);

alter table public.play_stat_credits enable row level security;

drop policy if exists "Members can read stat credits" on public.play_stat_credits;
create policy "Members can read stat credits"
  on public.play_stat_credits for select
  using (public.can_access_team(team_id));

drop policy if exists "Coaches can manage stat credits" on public.play_stat_credits;
create policy "Coaches can manage stat credits"
  on public.play_stat_credits for all
  using (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = play_stat_credits.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  )
  with check (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = play_stat_credits.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  );

-- Registry metadata, matching how every other shipped module is recorded.
insert into public.intelligence_modules (key, name, position_group, description) values
  ('STATSIQ', 'Statistical Intelligence', 'TEAM',
   'Charts every play off the film — formation, then positions, then what each player did — and keeps the offensive and defensive box score by position, since jersey numbers usually are not legible.')
on conflict (key) do nothing;
