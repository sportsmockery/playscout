-- 016_team_access.sql
-- Per-user team access. Admins/owners see every team in their org; everyone
-- else sees only the teams they CREATED or were ASSIGNED to by an admin.
--
-- Uses SECURITY DEFINER helper functions so the RLS policies don't reference
-- each other's tables directly (which would recurse — see 011/012).

-- 1) Track who created a team, and backfill existing teams to the org owner
--    (owners see everything anyway, so this never hides existing data).
alter table public.teams
  add column if not exists created_by uuid references auth.users(id);

update public.teams t
  set created_by = o.created_by
  from public.organizations o
  where t.organization_id = o.id and t.created_by is null;

-- 2) Assignment table: which users may access which team.
create table if not exists public.team_assignments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  created_at timestamptz default now(),
  unique (team_id, user_id)
);
alter table public.team_assignments enable row level security;

-- 3) SECURITY DEFINER helpers (bypass RLS internally → no policy recursion).
create or replace function public.is_org_admin(org uuid)
  returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from organization_members
    where organization_id = org and user_id = auth.uid() and role in ('owner','admin')
  );
$$;

create or replace function public.team_org_id(t uuid)
  returns uuid language sql security definer stable set search_path = public as $$
  select organization_id from teams where id = t;
$$;

create or replace function public.can_access_team(t uuid)
  returns boolean language sql security definer stable set search_path = public as $$
  select
    public.is_org_admin(public.team_org_id(t))
    or exists (select 1 from teams where id = t and created_by = auth.uid())
    or exists (select 1 from team_assignments where team_id = t and user_id = auth.uid());
$$;

-- 4) Teams: role-aware read + access-scoped update. Insert stays coach+.
drop policy if exists "Members can read teams" on public.teams;
create policy "Team read access"
  on public.teams for select
  using (public.can_access_team(id));

drop policy if exists "Coaches can update teams" on public.teams;
create policy "Coaches can update accessible teams"
  on public.teams for update
  using (
    public.can_access_team(id)
    and exists (
      select 1 from public.organization_members om
      where om.organization_id = teams.organization_id
        and om.user_id = auth.uid() and om.role in ('owner','admin','coach')
    )
  );

-- 5) team_assignments policies (helpers keep these non-recursive).
create policy "Read own or org-admin team_assignments"
  on public.team_assignments for select
  using (user_id = auth.uid() or public.is_org_admin(public.team_org_id(team_id)));

create policy "Admins insert team_assignments"
  on public.team_assignments for insert
  with check (public.is_org_admin(public.team_org_id(team_id)));

create policy "Admins delete team_assignments"
  on public.team_assignments for delete
  using (public.is_org_admin(public.team_org_id(team_id)));

create index if not exists team_assignments_user_idx on public.team_assignments(user_id);
create index if not exists team_assignments_team_idx on public.team_assignments(team_id);
create index if not exists teams_created_by_idx on public.teams(created_by);
