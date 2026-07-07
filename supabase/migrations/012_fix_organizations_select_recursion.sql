-- 012_fix_organizations_select_recursion.sql
-- Creating a team bootstraps a brand-new organization, then immediately
-- reads it back via INSERT ... RETURNING (Supabase client's .select()).
-- "Members can read organizations" only allows reads once an
-- organization_members row exists — but that row is created in the very
-- next step, so at RETURNING-time no membership exists yet and Postgres
-- raises "new row violates row-level security policy for table
-- organizations" (RETURNING is subject to the table's SELECT policy).
-- Fix: let the creator always read the org they created, in addition to
-- members.

drop policy "Members can read organizations" on public.organizations;

create policy "Members can read organizations"
  on public.organizations for select
  using (
    created_by = auth.uid()
    or public.is_org_member(id)
  );
