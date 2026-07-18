-- 017_org_members_and_team_management.sql
--
-- Fixes two RLS gaps found in the go-live audit:
--
-- 1. organization_members had SELECT + INSERT (self-add) policies only — an
--    org owner/admin could never promote/demote a coach's role or remove a
--    member through the app, only via direct DB access.
-- 2. teams had SELECT/INSERT/UPDATE but no DELETE policy — a team could
--    never be removed once created.

-- Owners/admins can update a member's role within their own org. An
-- admin (not owner) may not grant the 'owner' role to anyone — only an
-- existing owner can create another owner, to avoid a lower-privileged
-- admin escalating themselves or someone else.
create policy "Admins can update member roles"
  on public.organization_members for update
  using (public.is_org_admin(organization_id))
  with check (
    public.is_org_admin(organization_id)
    and (
      role <> 'owner'
      or exists (
        select 1 from public.organization_members me
        where me.organization_id = organization_members.organization_id
          and me.user_id = auth.uid()
          and me.role = 'owner'
      )
    )
  );

-- Owners/admins can remove a member from their org; anyone can remove
-- their own membership row (leave an org).
create policy "Admins can remove members, members can leave"
  on public.organization_members for delete
  using (
    public.is_org_admin(organization_id)
    or user_id = auth.uid()
  );

-- Only owners/admins can delete a team, and only one they can already
-- access — matches the same role bar as "Coaches can update accessible
-- teams" plus admin-only for this more destructive action.
create policy "Admins can delete teams"
  on public.teams for delete
  using (
    can_access_team(id)
    and exists (
      select 1 from organization_members om
      where om.organization_id = teams.organization_id
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );
