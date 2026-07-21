-- 017b_revoke_team_helpers_from_anon.sql
--
-- Reconstructed from supabase_migrations.schema_migrations (version
-- 20260717225206) — this was applied directly via the DB tooling in an
-- earlier session and never saved as a local file. Content verified to
-- exactly match what's live. See supabase/migrations/README.md for the
-- full true-apply-order history and why this file exists.
--
-- These SECURITY DEFINER helpers were grantable to anon by default; closes
-- that off since they're only meant to be called by authenticated requests.

revoke execute on function public.can_access_team(uuid) from anon;
revoke execute on function public.is_org_admin(uuid) from anon;
revoke execute on function public.team_org_id(uuid) from anon;
