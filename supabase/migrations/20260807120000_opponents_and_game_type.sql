-- Adds the data model ScoutIQ and the safety gate (flag vs tackle) depend on.
-- 1. opponents: first-class opponent concept, scoped to a team, so film and
--    scouting reports can be attached to a specific upcoming opponent.
-- 2. videos.film_type/opponent_id: lets a video be tagged as the team's own
--    film ('self', default) or an opponent's film, and which opponent.
-- 3. teams.game_type: flag/tackle/rookie_tackle — makes the contact-drill
--    safety gate possible (today nothing in the schema captures this).
-- 4. INSERT policies for mistake_events/team_tendencies: these tables only
--    ever got a SELECT policy (002_rls.sql), so with RLS on and no INSERT
--    policy every write was denied by default and both tables were dead —
--    read but never written. Mirrors the existing "Coaches can manage
--    videos" role gate via the teams -> organization_members join.

create table public.opponents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  age_group text,
  next_game_date date,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.opponents enable row level security;

create policy "Members can read opponents"
  on public.opponents for select
  using (
    exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = opponents.team_id
      and om.user_id = auth.uid()
    )
  );

create policy "Coaches can manage opponents"
  on public.opponents for all
  using (
    exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = opponents.team_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin','coach','analyst')
    )
  )
  with check (
    exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = opponents.team_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin','coach','analyst')
    )
  );

alter table public.videos
  add column if not exists film_type text not null default 'self'
    check (film_type in ('self','opponent')),
  add column if not exists opponent_id uuid references public.opponents(id) on delete set null;

alter table public.teams
  add column if not exists game_type text
    check (game_type in ('flag','tackle','rookie_tackle'));

create policy "Coaches can insert mistakes"
  on public.mistake_events for insert
  with check (
    exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = mistake_events.team_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin','coach','analyst')
    )
  );

create policy "Coaches can insert tendencies"
  on public.team_tendencies for insert
  with check (
    exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = team_tendencies.team_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin','coach','analyst')
    )
  );

create policy "Coaches can update tendencies"
  on public.team_tendencies for update
  using (
    exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = team_tendencies.team_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin','coach','analyst')
    )
  )
  with check (
    exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = team_tendencies.team_id
      and om.user_id = auth.uid()
      and om.role in ('owner','admin','coach','analyst')
    )
  );
