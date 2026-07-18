-- 018_org_wide_team_access.sql
-- Let admins grant a user access to EVERY team in the org (present and future),
-- as an alternative to picking specific teams. Stored as a flag on the user's
-- org membership; folded into can_access_team().

alter table public.organization_members
  add column if not exists all_teams boolean not null default false;

create or replace function public.can_access_team(t uuid)
  returns boolean language sql security definer stable set search_path = public as $$
  select
    -- owner/admin of the team's org
    public.is_org_admin(public.team_org_id(t))
    -- the creator
    or exists (select 1 from teams where id = t and created_by = auth.uid())
    -- granted access to this specific team
    or exists (select 1 from team_assignments where team_id = t and user_id = auth.uid())
    -- granted org-wide access (all teams under their org)
    or exists (
      select 1 from organization_members om
      where om.organization_id = public.team_org_id(t)
        and om.user_id = auth.uid() and om.all_teams
    );
$$;
