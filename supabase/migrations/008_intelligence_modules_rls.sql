-- intelligence_modules was created without RLS in 001_initial_schema.sql,
-- which the Supabase security linter flags as an error for public-schema
-- tables exposed to PostgREST. It's a static reference table, so allow any
-- authenticated user to read it.
alter table public.intelligence_modules enable row level security;

create policy "Anyone authenticated can read intelligence modules"
  on public.intelligence_modules for select
  using (auth.role() = 'authenticated');
