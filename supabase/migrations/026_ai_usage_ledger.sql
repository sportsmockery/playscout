-- 026_ai_usage_ledger.sql
--
-- Makes AI spend measurable and cache-deduplicated. Every provider call
-- that goes through lib/ai/record-usage.ts's recordUsage() writes one row
-- here — the single source of truth for "what did this cost."
--
-- ai_response_cache is content-addressed (sha256 of frames + module +
-- prompt version) and deliberately NOT org-scoped: a cache hit only reveals
-- "this exact frame set + prompt was seen before," never any team's film or
-- analysis content beyond what the requester already sent in this call, so
-- there's no cross-org leak from sharing it.

create table if not exists public.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  job_type text not null,
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  cache_hit boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_ledger_org_created_idx on public.ai_usage_ledger (organization_id, created_at);
create index if not exists ai_usage_ledger_team_created_idx on public.ai_usage_ledger (team_id, created_at);

alter table public.ai_usage_ledger enable row level security;

create policy "Org members can read own org usage"
  on public.ai_usage_ledger for select
  using (
    exists (
      select 1 from organization_members om
      where om.organization_id = ai_usage_ledger.organization_id and om.user_id = auth.uid()
    )
  );

create policy "Org members can log their own org's usage"
  on public.ai_usage_ledger for insert
  with check (
    exists (
      select 1 from organization_members om
      where om.organization_id = ai_usage_ledger.organization_id and om.user_id = auth.uid()
    )
  );

create table if not exists public.ai_response_cache (
  hash text primary key,
  job_type text not null,
  response jsonb not null,
  hit_count int not null default 1,
  created_at timestamptz not null default now(),
  last_hit_at timestamptz not null default now()
);

alter table public.ai_response_cache enable row level security;

create policy "Authenticated users can read the response cache"
  on public.ai_response_cache for select
  to authenticated
  using (true);

create policy "Authenticated users can write the response cache"
  on public.ai_response_cache for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update cache hit counts"
  on public.ai_response_cache for update
  to authenticated
  using (true)
  with check (true);
