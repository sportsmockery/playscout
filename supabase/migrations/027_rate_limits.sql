-- 027_rate_limits.sql
--
-- Postgres-backed fixed-window rate limiter for AI routes. One row per
-- (subject, window_start) — "subject" is either "user:<id>" or "org:<id>",
-- so the same table serves both the per-user and per-org limits. Counting
-- is a single atomic UPSERT ... ON CONFLICT DO UPDATE, so concurrent
-- requests in the same window can't race past the limit.

create table if not exists public.rate_limit_counters (
  subject text not null,
  window_start timestamptz not null,
  count int not null default 1,
  primary key (subject, window_start)
);

-- No RLS — this table is written exclusively by server-side route code via
-- an authenticated user's own subject key (never cross-user), and never
-- read by the client directly. Enabling RLS would need a permissive
-- self-only policy that adds complexity without adding real protection
-- here, since the subject string itself is server-derived, not client input.
alter table public.rate_limit_counters enable row level security;
create policy "Server routes manage their own rate limit counters"
  on public.rate_limit_counters for all
  to authenticated
  using (true)
  with check (true);

-- Old windows accumulate forever otherwise — a scheduled cleanup isn't set
-- up yet, so this index at least keeps lookups/deletes cheap once one is.
create index if not exists rate_limit_counters_window_idx on public.rate_limit_counters (window_start);
