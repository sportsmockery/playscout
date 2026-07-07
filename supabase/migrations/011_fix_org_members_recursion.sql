-- 011_fix_org_members_recursion.sql
-- "Members can read org members" (002_rls.sql) queries organization_members
-- from within a policy defined on organization_members itself. Postgres has
-- to apply RLS to that inner query too, which re-triggers the same policy,
-- forever -> "infinite recursion detected in policy for relation
-- organization_members". Fix: move the membership check into a
-- security-definer function (owned by the migration role, which owns the
-- table and isn't subject to its RLS), so the inner lookup bypasses RLS
-- instead of re-entering the policy.

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org_id and user_id = auth.uid()
  );
$$;

drop policy "Members can read org members" on public.organization_members;

create policy "Members can read org members"
  on public.organization_members for select
  using (public.is_org_member(organization_id));
