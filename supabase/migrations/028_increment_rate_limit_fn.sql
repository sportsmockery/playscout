-- 028_increment_rate_limit_fn.sql
--
-- PostgREST upsert payloads are static values, not expressions, so
-- `count = count + 1` can't be done as a plain .upsert() call from
-- supabase-js without a race between two requests in the same window each
-- reading the same pre-increment value. This RPC does the atomic
-- insert-or-increment server-side in one statement.

create or replace function public.increment_rate_limit(p_subject text, p_window_start timestamptz)
returns int
language sql
security definer
set search_path = public
as $$
  insert into public.rate_limit_counters (subject, window_start, count)
  values (p_subject, p_window_start, 1)
  on conflict (subject, window_start)
  do update set count = rate_limit_counters.count + 1
  returning count;
$$;

grant execute on function public.increment_rate_limit(text, timestamptz) to authenticated;
