-- 20260904020000_hudl_import_jobs.sql
--
-- One row per "pull this Hudl playlist into PlayScout".
--
-- Shaped like video_processing_jobs on purpose: the worker claims a row with a
-- conditional UPDATE on a claimable status, so two workers racing means one
-- wins and no stored procedure is needed. locked_at is written on claim and
-- READ by a reaper, which video_processing_jobs had to learn the hard way — a
-- worker that dies mid-job otherwise leaves the coach's import stuck forever.

create table if not exists public.hudl_import_jobs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by uuid references auth.users(id),

  -- The pasted link, canonicalized (tracking parameters stripped) by
  -- lib/import/hudl-url.ts before it gets here.
  source_url text not null,
  -- Ids re-derived from that URL. Stored so the worker never has to trust a
  -- client-supplied id, and so a duplicate paste is recognisable.
  hudl_team_id text,
  hudl_video_id text,
  hudl_playlist_id text,
  -- "playlist:<team>:<video>:<playlist>" — the same key for the same playlist,
  -- so pasting a link twice does not pull fifty clips twice.
  target_key text not null,

  -- Where the imported film lands, same choices as any other upload.
  title text,
  folder_id uuid references public.video_folders(id) on delete set null,
  opponent_id uuid references public.opponents(id) on delete set null,
  film_type text not null default 'opponent' check (film_type in ('self', 'opponent')),

  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled', 'retrying')),
  -- Coach-friendly, matching the video pipeline's vocabulary:
  -- "Signing in to Hudl" -> "Finding Clips" -> "Downloading Clip 12 of 48".
  current_step text,

  clips_found int not null default 0,
  clips_imported int not null default 0,
  clips_failed int not null default 0,

  -- NEVER a raw exception and never a credential. Hudl's URLs and Playwright's
  -- error messages both carry session tokens; only hand-written coach-facing
  -- sentences go here.
  error_message text,
  -- Redacted request URLs (query VALUES stripped) captured when enumeration
  -- fails. Hudl's payload shape is undocumented, so the first real run is a
  -- discovery run — this is what keeps the second attempt from being blind.
  diagnostics jsonb,

  attempts int not null default 0,
  max_attempts int not null default 2,
  locked_by text,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The poller's only query: claimable rows, oldest first.
create index if not exists hudl_import_jobs_claimable_idx
  on public.hudl_import_jobs (status, created_at);

create index if not exists hudl_import_jobs_team_idx
  on public.hudl_import_jobs (team_id, created_at desc);

-- One live import per playlist per team. A finished or failed one can be
-- re-run; a queued or running one should be joined, not duplicated.
create unique index if not exists hudl_import_jobs_active_target_idx
  on public.hudl_import_jobs (team_id, target_key)
  where status in ('queued', 'running', 'retrying');

alter table public.hudl_import_jobs enable row level security;

-- Unlike hudl_credentials, this table holds no secret — it is progress, and
-- the coach needs to watch it.
create policy "Team members can see their imports"
  on public.hudl_import_jobs for select
  using (public.can_access_team(team_id));

create policy "Coaches can start an import"
  on public.hudl_import_jobs for insert
  with check (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = hudl_import_jobs.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach'])
    )
  );

-- Cancelling is the only update a client makes; the worker uses the service
-- role for everything else.
create policy "Coaches can cancel an import"
  on public.hudl_import_jobs for update
  using (
    public.can_access_team(team_id)
    and exists (
      select 1 from public.teams t
      join public.organization_members om on om.organization_id = t.organization_id
      where t.id = hudl_import_jobs.team_id
        and om.user_id = auth.uid()
        and om.role = any (array['owner', 'admin', 'coach'])
    )
  )
  with check (public.can_access_team(team_id));

comment on table public.hudl_import_jobs is
  'Queue for pulling a Hudl playlist into PlayScout. error_message and diagnostics are hand-written / redacted — never raw exceptions, which carry session tokens.';
