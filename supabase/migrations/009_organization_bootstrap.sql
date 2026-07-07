-- 009_organization_bootstrap.sql
-- Allows a user to add themselves as a member of an organization they just
-- created. Without this, there was no RLS-compliant way for a new coach to
-- ever get an organization_members row, which made team creation impossible
-- (teams.insert requires an existing organization_members row for the org).

create policy "Users can add themselves to orgs they created"
  on public.organization_members for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.organizations o
      where o.id = organization_members.organization_id
      and o.created_by = auth.uid()
    )
  );
