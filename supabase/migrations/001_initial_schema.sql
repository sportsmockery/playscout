-- PlayScout Initial Schema

-- Organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','coach','analyst','viewer')),
  created_at timestamptz default now(),
  unique (organization_id, user_id)
);

-- Teams
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  age_group text not null,
  season text,
  league text,
  state text,
  offensive_style text,
  defensive_style text,
  notes text,
  created_at timestamptz default now()
);

-- Players
create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  first_name text,
  last_name text,
  jersey_number text,
  primary_position text,
  secondary_position text,
  side_of_ball text check (side_of_ball in ('offense','defense','both','special_teams')),
  strengths text,
  weaknesses text,
  notes text,
  created_at timestamptz default now()
);

-- Videos
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  uploaded_by uuid references auth.users(id),
  title text not null,
  source_type text not null check (source_type in ('upload','hudl_link','external_url')),
  source_url text,
  storage_path text,
  thumbnail_path text,
  duration_seconds numeric,
  status text not null default 'uploaded'
    check (status in ('uploaded','processing','partially_ready','ready_for_review','analysis_complete','failed')),
  error_message text,
  created_at timestamptz default now()
);

-- Video uploads (TUS tracking)
create table public.video_uploads (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  user_id uuid references auth.users(id),
  original_filename text not null,
  file_size_bytes bigint,
  mime_type text,
  upload_status text not null default 'created'
    check (upload_status in ('created','uploading','uploaded','failed','cancelled')),
  storage_bucket text,
  storage_path text,
  tus_upload_url text,
  upload_progress numeric default 0,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Video frames
create table public.video_frames (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references public.videos(id) on delete cascade,
  frame_index int not null,
  timestamp_seconds numeric not null,
  storage_path text not null,
  width int,
  height int,
  created_at timestamptz default now()
);

-- Play sequences
create table public.play_sequences (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references public.videos(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  sequence_number int not null,
  start_time_seconds numeric,
  end_time_seconds numeric,
  possession_team_id uuid references public.teams(id),
  down int,
  distance int,
  yard_line text,
  result text,
  coach_label text,
  ai_summary text,
  confidence numeric,
  created_at timestamptz default now()
);

-- Processing jobs
create table public.video_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references public.videos(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  job_type text not null check (job_type in (
    'extract_metadata','extract_frames','detect_play_sequences',
    'analyze_sequences','generate_report','full_pipeline'
  )),
  status text not null default 'queued'
    check (status in ('queued','running','completed','failed','cancelled','retrying')),
  priority int default 5,
  attempts int default 0,
  max_attempts int default 3,
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

-- AI analysis jobs
create table public.ai_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references public.videos(id) on delete cascade,
  play_sequence_id uuid references public.play_sequences(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  module_key text,
  provider text,
  model text,
  job_type text not null check (job_type in (
    'frame_observation','sequence_analysis','assignment_grading',
    'mistake_detection','tendency_update','report_generation'
  )),
  status text not null default 'queued'
    check (status in ('queued','running','completed','failed','retrying')),
  input_tokens int,
  output_tokens int,
  cost_estimate numeric,
  confidence numeric,
  result jsonb,
  error_message text,
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- Intelligence modules registry
create table public.intelligence_modules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  position_group text,
  description text,
  active boolean default true,
  created_at timestamptz default now()
);

insert into public.intelligence_modules (key, name, position_group, description) values
('QBIQ',      'Quarterback Intelligence',    'QB',   'Evaluates QB mechanics, decision-making, pocket presence, ball security, and play execution.'),
('OLIQ',      'Offensive Line Intelligence', 'OL',   'Evaluates pass protection, run blocking, footwork, leverage, hand placement, and assignment execution.'),
('TEAMIQ',    'Team Intelligence',           'TEAM', 'Evaluates team tendencies, formations, play families, mistakes, and improvement priorities.'),
('MISTAKEIQ', 'Mistake Intelligence',        'TEAM', 'Detects game-changing mistakes and recurring issues from film evidence.');

-- Position analysis results
create table public.position_analysis_results (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  video_id uuid references public.videos(id) on delete cascade,
  play_sequence_id uuid references public.play_sequences(id) on delete set null,
  module_key text not null,
  overall_score int,
  position_scores jsonb,
  reasoning jsonb,
  strengths text[],
  weaknesses text[],
  drills text[],
  summary text,
  frames_analyzed int,
  evidence jsonb,
  model_provider text,
  model_name text,
  created_at timestamptz default now()
);

-- Mistake events
create table public.mistake_events (
  id uuid primary key default gen_random_uuid(),
  play_sequence_id uuid references public.play_sequences(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  severity text check (severity in ('minor','moderate','major','game_changing')),
  category text,
  title text,
  description text,
  likely_impact text,
  correction text,
  evidence jsonb,
  confidence numeric,
  created_at timestamptz default now()
);

-- Team tendencies
create table public.team_tendencies (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  tendency_type text,
  label text,
  value jsonb,
  sample_size int default 0,
  confidence numeric,
  updated_at timestamptz default now()
);

-- Team memory (pgvector)
create table public.team_memory (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  memory_type text,
  title text,
  content text,
  source text,
  embedding vector(1536),
  confidence numeric,
  created_at timestamptz default now()
);
