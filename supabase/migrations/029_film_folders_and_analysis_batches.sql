-- 029_film_folders_and_analysis_batches.sql
--
-- Two related capabilities:
--
-- 1) FILM FOLDERS. A coach who uploads a whole game as 60 single-play clips
--    ends up with an unnavigable flat library. video_folders gives the team a
--    place to group them ("Week 3 vs Wildcats", "QB cutups"), and every
--    folder is a first-class analysis target — "run MISTAKEIQ on this folder"
--    is the batch primitive coaches actually think in.
--
-- 2) BACKGROUND BATCH ANALYSIS. Until now every module run happened inside
--    the request that started it: the coach had to sit on the page, and one
--    clip per click. analysis_batches + analysis_batch_jobs move that onto
--    the same queue-and-claim architecture video processing already uses
--    (video_processing_jobs), so a batch survives navigating away, closing
--    the laptop, or the request timing out, and the coach sees results when
--    they come back.
--
-- ai_analysis_jobs (001_initial_schema) is deliberately left alone: it has no
-- lock/attempt/batch columns and nothing has ever read or written it, so
-- adding the missing half-dozen columns and rewriting its status constraint
-- would be more churn than a purpose-built table with the exact lifecycle
-- this queue needs.

-- ── Film folders ────────────────────────────────────────────────────

create table if not exists public.video_folders (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_folders_team_idx on public.video_folders (team_id, name);
-- Case-insensitive uniqueness per team: "Week 3" and "week 3" are the same
-- folder to a coach, and two of them is a bug report waiting to happen.
create unique index if not exists video_folders_team_name_key
  on public.video_folders (team_id, lower(name));

-- on delete set null: deleting a folder must never delete a coach's film.
-- The videos simply return to the unfiled library.
alter table public.videos
  add column if not exists folder_id uuid references public.video_folders(id) on delete set null;
create index if not exists videos_folder_idx on public.videos (folder_id);

alter table public.video_folders enable row level security;

drop policy if exists "Members can read film folders" on public.video_folders;
create policy "Members can read film folders"
  on public.video_folders for select
  using (public.can_access_team(team_id));

drop policy if exists "Coaches can manage film folders" on public.video_folders;
create policy "Coaches can manage film folders"
  on public.video_folders for all
  using (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = video_folders.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  )
  with check (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = video_folders.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  );

-- ── Analysis batches ────────────────────────────────────────────────

create table if not exists public.analysis_batches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by uuid references auth.users(id),
  module_key text not null,
  player_id uuid references public.players(id) on delete set null,
  folder_id uuid references public.video_folders(id) on delete set null,
  title text,
  -- The module input template the coach configured once (team context,
  -- jersey color, side of ball, coach note...). The runner replays it per
  -- video, injecting that video's frames — so every clip in a batch is
  -- graded under exactly the same context the coach set up.
  context jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  total_jobs int not null default 0,
  completed_jobs int not null default 0,
  failed_jobs int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists analysis_batches_team_created_idx
  on public.analysis_batches (team_id, created_at desc);

create table if not exists public.analysis_batch_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.analysis_batches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  module_key text not null,
  player_id uuid references public.players(id) on delete set null,
  -- waiting_for_film: the clip was queued before its frame extraction
  -- finished. That's not an error — the coach selected film that's still
  -- processing — so the job parks here and is retried without burning an
  -- attempt, instead of failing in front of them.
  status text not null default 'queued'
    check (status in ('queued', 'waiting_for_film', 'running', 'completed', 'failed', 'cancelled')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  locked_by text,
  locked_at timestamptz,
  error_message text,
  analysis_result_id uuid references public.position_analysis_results(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists analysis_batch_jobs_batch_idx on public.analysis_batch_jobs (batch_id);
create index if not exists analysis_batch_jobs_claim_idx on public.analysis_batch_jobs (status, updated_at);
-- One analysis per video per batch — re-queueing the same folder twice in one
-- batch (folder + individually selected clip) must not double-charge the AI.
create unique index if not exists analysis_batch_jobs_batch_video_key
  on public.analysis_batch_jobs (batch_id, video_id);

alter table public.analysis_batches enable row level security;
alter table public.analysis_batch_jobs enable row level security;

drop policy if exists "Members can read analysis batches" on public.analysis_batches;
create policy "Members can read analysis batches"
  on public.analysis_batches for select
  using (public.can_access_team(team_id));

drop policy if exists "Coaches can manage analysis batches" on public.analysis_batches;
create policy "Coaches can manage analysis batches"
  on public.analysis_batches for all
  using (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = analysis_batches.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  )
  with check (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = analysis_batches.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  );

drop policy if exists "Members can read analysis batch jobs" on public.analysis_batch_jobs;
create policy "Members can read analysis batch jobs"
  on public.analysis_batch_jobs for select
  using (public.can_access_team(team_id));

drop policy if exists "Coaches can manage analysis batch jobs" on public.analysis_batch_jobs;
create policy "Coaches can manage analysis batch jobs"
  on public.analysis_batch_jobs for all
  using (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = analysis_batch_jobs.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  )
  with check (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = analysis_batch_jobs.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach', 'analyst'])
    )
  );

-- ── Batch roll-up ───────────────────────────────────────────────────
--
-- The parent batch's status and counters are derived, never hand-maintained:
-- every job row change recomputes them from the jobs themselves. Two workers
-- finishing at the same instant therefore can't lose a count the way
-- read-modify-write increments would.

create or replace function public.refresh_analysis_batch_status()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  b uuid;
  n_total int; n_done int; n_failed int; n_running int; n_pending int; n_cancelled int;
  next_status text;
begin
  b := coalesce(new.batch_id, old.batch_id);
  if b is null then return null; end if;

  select
    count(*),
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'failed'),
    count(*) filter (where status = 'running'),
    count(*) filter (where status in ('queued', 'waiting_for_film')),
    count(*) filter (where status = 'cancelled')
  into n_total, n_done, n_failed, n_running, n_pending, n_cancelled
  from analysis_batch_jobs where batch_id = b;

  if n_pending > 0 or n_running > 0 then
    next_status := case when n_running > 0 or n_done > 0 or n_failed > 0 then 'running' else 'queued' end;
  elsif n_done > 0 and n_failed = 0 then
    next_status := 'completed';
  elsif n_done > 0 then
    next_status := 'completed_with_errors';
  elsif n_failed > 0 then
    next_status := 'failed';
  elsif n_cancelled > 0 then
    next_status := 'cancelled';
  else
    next_status := 'queued';
  end if;

  update analysis_batches set
    total_jobs = n_total,
    completed_jobs = n_done,
    failed_jobs = n_failed,
    status = next_status,
    completed_at = case
      when next_status in ('completed', 'completed_with_errors', 'failed', 'cancelled') then coalesce(completed_at, now())
      else null
    end,
    updated_at = now()
  where id = b
    -- A batch the coach cancelled stays cancelled even as in-flight jobs
    -- land; it must not resurrect itself into 'running'.
    and status <> 'cancelled';

  return null;
end $$;

drop trigger if exists analysis_batch_jobs_rollup on public.analysis_batch_jobs;
create trigger analysis_batch_jobs_rollup
  after insert or update or delete on public.analysis_batch_jobs
  for each row execute function public.refresh_analysis_batch_status();
