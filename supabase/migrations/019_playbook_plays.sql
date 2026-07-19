-- 019_playbook_plays.sql
--
-- Adds per-play, per-position data to PlaybookIQ. Until now the module was
-- pure text-in/text-out (whole-book scores + prose) and never looked at the
-- actual diagrams a coach uploads. This adds:
--
--   - playbook_processing_jobs: async job queue (mirrors video_processing_jobs)
--     for the Railway worker to rasterize PDF pages and run per-play vision
--     analysis — this is real work (PDF rendering + N vision calls per
--     playbook) and must not run inside a Vercel function.
--   - playbooks.pages_status: lets the app show processing progress without
--     polling the jobs table directly.
--   - playbook_plays: one row per identified play — page image, blocking
--     summary, and a structured per-position assignment list.

alter table public.playbooks
  add column if not exists pages_status text not null default 'not_started'
    check (pages_status in ('not_started', 'queued', 'processing', 'ready', 'failed')),
  add column if not exists pages_error text;

create table if not exists public.playbook_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'retrying')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  progress numeric default 0,
  current_step text,
  error_message text,
  locked_by text,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.playbook_plays (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  page_number int not null,
  play_name text,
  formation text,
  image_path text,
  blocking_summary text,
  -- [{ position: "QB", assignment: "Fake dive, boot right, keep on edge" }, ...]
  assignments jsonb not null default '[]',
  confidence numeric,
  created_at timestamptz default now()
);

create index if not exists playbook_plays_playbook_id_idx on public.playbook_plays (playbook_id, page_number);
create index if not exists playbook_processing_jobs_status_idx on public.playbook_processing_jobs (status, created_at);

alter table public.playbook_processing_jobs enable row level security;
alter table public.playbook_plays enable row level security;

-- The upload route queues the initial job as the signed-in coach (regular
-- session client, not service role), so team members need insert/read here —
-- mirrors video_processing_jobs' "Members can manage processing jobs" ALL
-- policy. The worker itself uses the service-role key, which bypasses RLS.
create policy "Team members can manage playbook processing jobs"
  on public.playbook_processing_jobs for all
  using (can_access_team(team_id))
  with check (can_access_team(team_id));

create policy "Team members can read playbook plays"
  on public.playbook_plays for select
  using (can_access_team(team_id));
