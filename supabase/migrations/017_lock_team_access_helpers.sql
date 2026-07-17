-- 017_lock_team_access_helpers.sql
-- The RLS helper functions from 016 are SECURITY DEFINER. Keep them callable by
-- signed-in users (RLS policy evaluation needs EXECUTE) but not by anonymous
-- visitors via the PostgREST RPC API. Addresses the security advisor warnings
-- (0028/0029). They only ever reveal the caller's own access, but there's no
-- reason to expose them to anon.
revoke execute on function public.can_access_team(uuid) from public, anon;
revoke execute on function public.is_org_admin(uuid) from public, anon;
revoke execute on function public.team_org_id(uuid) from public, anon;

grant execute on function public.can_access_team(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.team_org_id(uuid) to authenticated;
