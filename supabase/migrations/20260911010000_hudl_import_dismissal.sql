-- 20260911010000_hudl_import_dismissal.sql
--
-- Let a coach clear a finished Hudl import off their screen.
--
-- Failed and partial imports rendered with no dismiss control at all — only a
-- QUEUED job could be cancelled — and ImportFromHudl appears on both the film
-- library and the ScoutIQ screen. So one failed import from a fortnight ago
-- sat on two pages indefinitely, next to film that imported perfectly well.
--
-- Why a column rather than reusing `status`: setting a failed job to
-- 'cancelled' to make it disappear would be free, and would also destroy the
-- record that it failed and why. `diagnostics` exists precisely because the
-- reason an import broke is gone by the time anyone looks for it. Dismissal is
-- a display decision and belongs in its own column.

alter table public.hudl_import_jobs
  add column if not exists dismissed_at timestamptz;

comment on column public.hudl_import_jobs.dismissed_at is
  'When a coach cleared this finished job off their screen. Display only — status, error_message and diagnostics are left exactly as they were, so a dismissed failure is still there to debug.';

-- The listing query is "this team's imports, newest first, not dismissed".
create index if not exists hudl_import_jobs_team_visible_idx
  on public.hudl_import_jobs (team_id, created_at desc)
  where dismissed_at is null;
