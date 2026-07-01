-- Row Level Security for all tables

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.videos enable row level security;
alter table public.video_uploads enable row level security;
alter table public.video_frames enable row level security;
alter table public.play_sequences enable row level security;
alter table public.video_processing_jobs enable row level security;
alter table public.ai_analysis_jobs enable row level security;
alter table public.position_analysis_results enable row level security;
alter table public.mistake_events enable row level security;
alter table public.team_tendencies enable row level security;
alter table public.team_memory enable row level security;

-- Organizations: members can read their own orgs
create policy "Members can read organizations"
  on public.organizations for select
  using (exists (
    select 1 from public.organization_members om
    where om.organization_id = organizations.id and om.user_id = auth.uid()
  ));

create policy "Owners can update organizations"
  on public.organizations for update
  using (exists (
    select 1 from public.organization_members om
    where om.organization_id = organizations.id
    and om.user_id = auth.uid() and om.role in ('owner','admin')
  ));

create policy "Users can create organizations"
  on public.organizations for insert
  with check (created_by = auth.uid());

-- Organization members
create policy "Members can read org members"
  on public.organization_members for select
  using (exists (
    select 1 from public.organization_members om
    where om.organization_id = organization_members.organization_id and om.user_id = auth.uid()
  ));

-- Teams
create policy "Members can read teams"
  on public.teams for select
  using (exists (
    select 1 from public.organization_members om
    where om.organization_id = teams.organization_id and om.user_id = auth.uid()
  ));

create policy "Coaches can insert teams"
  on public.teams for insert
  with check (exists (
    select 1 from public.organization_members om
    where om.organization_id = teams.organization_id
    and om.user_id = auth.uid() and om.role in ('owner','admin','coach')
  ));

create policy "Coaches can update teams"
  on public.teams for update
  using (exists (
    select 1 from public.organization_members om
    where om.organization_id = teams.organization_id
    and om.user_id = auth.uid() and om.role in ('owner','admin','coach')
  ));

-- Players
create policy "Members can read players"
  on public.players for select
  using (exists (
    select 1 from public.teams t
    join public.organization_members om on om.organization_id = t.organization_id
    where t.id = players.team_id and om.user_id = auth.uid()
  ));

create policy "Coaches can manage players"
  on public.players for all
  using (exists (
    select 1 from public.teams t
    join public.organization_members om on om.organization_id = t.organization_id
    where t.id = players.team_id
    and om.user_id = auth.uid() and om.role in ('owner','admin','coach')
  ));

-- Videos
create policy "Members can read videos"
  on public.videos for select
  using (exists (
    select 1 from public.teams t
    join public.organization_members om on om.organization_id = t.organization_id
    where t.id = videos.team_id and om.user_id = auth.uid()
  ));

create policy "Coaches can manage videos"
  on public.videos for all
  using (exists (
    select 1 from public.teams t
    join public.organization_members om on om.organization_id = t.organization_id
    where t.id = videos.team_id
    and om.user_id = auth.uid() and om.role in ('owner','admin','coach','analyst')
  ));

-- Video uploads
create policy "Users can manage their own uploads"
  on public.video_uploads for all
  using (user_id = auth.uid());

-- Video frames
create policy "Members can read frames"
  on public.video_frames for select
  using (exists (
    select 1 from public.videos v
    join public.teams t on t.id = v.team_id
    join public.organization_members om on om.organization_id = t.organization_id
    where v.id = video_frames.video_id and om.user_id = auth.uid()
  ));

-- Play sequences
create policy "Members can read play sequences"
  on public.play_sequences for select
  using (exists (
    select 1 from public.teams t
    join public.organization_members om on om.organization_id = t.organization_id
    where t.id = play_sequences.team_id and om.user_id = auth.uid()
  ));

create policy "Coaches can manage play sequences"
  on public.play_sequences for all
  using (exists (
    select 1 from public.teams t
    join public.organization_members om on om.organization_id = t.organization_id
    where t.id = play_sequences.team_id
    and om.user_id = auth.uid() and om.role in ('owner','admin','coach','analyst')
  ));

-- Processing jobs, AI jobs, analysis results, mistakes, tendencies, memory — members read, coaches manage
create policy "Members can read processing jobs"
  on public.video_processing_jobs for select
  using (exists (
    select 1 from public.teams t
    join public.organization_members om on om.organization_id = t.organization_id
    where t.id = video_processing_jobs.team_id and om.user_id = auth.uid()
  ));

create policy "Members can read AI jobs"
  on public.ai_analysis_jobs for select
  using (exists (
    select 1 from public.teams t
    join public.organization_members om on om.organization_id = t.organization_id
    where t.id = ai_analysis_jobs.team_id and om.user_id = auth.uid()
  ));

create policy "Members can read analysis results"
  on public.position_analysis_results for select
  using (exists (
    select 1 from public.teams t
    join public.organization_members om on om.organization_id = t.organization_id
    where t.id = position_analysis_results.team_id and om.user_id = auth.uid()
  ));

create policy "Members can read mistakes"
  on public.mistake_events for select
  using (exists (
    select 1 from public.teams t
    join public.organization_members om on om.organization_id = t.organization_id
    where t.id = mistake_events.team_id and om.user_id = auth.uid()
  ));

create policy "Members can read tendencies"
  on public.team_tendencies for select
  using (exists (
    select 1 from public.teams t
    join public.organization_members om on om.organization_id = t.organization_id
    where t.id = team_tendencies.team_id and om.user_id = auth.uid()
  ));

create policy "Members can read team memory"
  on public.team_memory for select
  using (exists (
    select 1 from public.teams t
    join public.organization_members om on om.organization_id = t.organization_id
    where t.id = team_memory.team_id and om.user_id = auth.uid()
  ));
