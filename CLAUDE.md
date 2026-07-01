# PlayScout — Claude Development Guide

## Identity
- **Product**: PlayScout
- **URL**: playscout.ai
- **GitHub**: https://github.com/sportsmockery/playscout
- **Supabase**: https://supabase.com/dashboard/project/rapuqqztreaefzysetju
- **Vercel**: chris-burhans-projects / playscout
- **Mission**: Youth football intelligence built from film, evidence, assignments, tendencies, mistakes, and team memory.
- **Initial focus**: 9U–10U football

---

## Core Product Philosophy

Evidence first. Football interpretation second. Coaching recommendation third. Team memory forever.

PlayScout never says "AI watched your game." It says:
> Here are the frames. Here is what was visible. Here is the likely football meaning. Here is the confidence level. Here is what to fix. Here is what we are learning over time.

**Anti-hallucination rules — enforce in every AI call:**
1. Never invent jersey numbers, player names, scores, stats, or results
2. Separate observation from interpretation
3. Use confidence scores
4. Identify which frames support each conclusion
5. If the subject is unclear, say so
6. Explain mistakes in coachable language
7. Recommend simple fixes coaches can install at practice
8. Never claim certainty when video evidence is limited

---

## Technical Stack

### Frontend
- Next.js App Router, React, TypeScript
- Tailwind CSS v4, shadcn/ui, Framer Motion
- Lucide React, TanStack Query, TanStack Table
- React Hook Form + Zod, Recharts
- Font: **Space Grotesk** (`next/font/google`)
- Uppy (TUS resumable uploads)

### Backend
- Supabase Auth, Postgres, Storage, Realtime, pgvector
- Supabase Row Level Security (every table)
- Vercel (web app only — never video processing)
- Background workers (Railway for MVP, ECS/Fargate later)
- FFmpeg via `ffmpeg-static` for server-side frame extraction

### AI Provider Router
Never hardcode a single model. Route by job type:

```typescript
// lib/ai/model-router.ts
export type AIJob =
  | 'frame_observation'
  | 'sequence_analysis'
  | 'assignment_grading'
  | 'mistake_detection'
  | 'tendency_update'
  | 'report_generation';

// Default routing
const DEFAULT_ROUTES: Record<AIJob, { provider: string; model: string }> = {
  frame_observation:   { provider: 'google',    model: 'gemini-2.5-pro' },
  sequence_analysis:   { provider: 'google',    model: 'gemini-2.5-pro' },
  assignment_grading:  { provider: 'anthropic', model: 'claude-opus-4' },
  mistake_detection:   { provider: 'anthropic', model: 'claude-opus-4' },
  tendency_update:     { provider: 'openai',    model: 'gpt-4o' },
  report_generation:   { provider: 'anthropic', model: 'claude-opus-4' },
};
```

Providers: `lib/ai/providers/openai.ts`, `anthropic.ts`, `google.ts`, `perplexity.ts`

---

## Existing Reference Implementation

**CRITICAL**: QBIQ and OLIQ already exist and work in the LevelUp repo at `sportsmockery/LevelUp`. These prove the core approach. Read them before building anything.

### Source files to inspect
- `app/QB/page.tsx` — QBIQ client page
- `app/OLIQ/page.tsx` — OLIQ client page (use this as the better model)
- `app/api/qb/analyze/route.ts` — QBIQ analysis API
- `app/api/ol/analyze/route.ts` — OLIQ analysis API
- `app/api/ol/extract/route.ts` — Server-side FFmpeg frame extraction

### Proven frame extraction pattern (keep exactly)
```typescript
const FRAME_COUNT = 16;
const TARGET_W = 768;

async function extractFrames(file: File, count: number): Promise<string[]> {
  // Browser-side: uses HTMLVideoElement + Canvas
  // 16 evenly spaced frames at 768px wide
  // Output: JPEG/base64 data URLs
  // interval = duration / (count + 1)
  // video.currentTime = interval * (currentFrame + 1)
}
```

### Proven server-side extraction (from ol/extract/route.ts)
- Uses `ffmpeg-static` resolved at runtime with fallback path
- `ffmpegPath` resolved with `existsSync` check across candidates
- Supports `cookie` + `referer` auth headers for link-based extraction
- 16 frames, 768px wide, JPEG output
- `maxDuration = 300`, `runtime = 'nodejs'`

### Proven response schema pattern (keep exactly)
```typescript
import { GoogleGenAI, Type } from '@google/genai';

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overall_score: { type: Type.INTEGER },
    position_scores: { type: Type.OBJECT, properties: { ... } },
    reasoning: { type: Type.OBJECT, properties: { ... } },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    drills: { type: Type.ARRAY, items: { type: Type.STRING } },
    summary: { type: Type.STRING },
  },
  required: ['overall_score', 'position_scores', 'reasoning', 'strengths', 'weaknesses', 'drills', 'summary'],
};
// Use responseSchema in generationConfig to enforce JSON
```

### What to keep from LevelUp
- Frame extraction algorithm (browser + server)
- JPEG/base64 encoding, 768px width, 16 frames
- Response-schema-constrained JSON output
- Anti-hallucination system prompt rules
- `maxDuration = 300` on all analysis routes
- QBIQ quarterback rubric (mechanics 40%, decision-making 40%, pocket presence 20%)
- OLIQ offensive line rubric (pass protection 40%, run blocking 40%, footwork/leverage 20%)
- Optional PDF support (base64, 20MB max)
- Server-side FFmpeg extraction pattern from OLIQ

### What to REMOVE and REPLACE

**QBIQ hardcoded context — remove entirely:**
```typescript
// REMOVE THIS from QBIQ:
const QBIQ_ATHLETE_PROFILE = `ATHLETE PROFILE: Carter Burhans...`;
const QBIQ_FILM_LIBRARY = `REFERENCE FILM LIBRARY — "Carter Burhans...`;
const QBIQ_ANALYST_CHECKLIST = `...CLASS-OF-2030 D1 PROJECTION BENCHMARKS...`;
```

**Replace with dynamic context from DB:**
```typescript
// QBIQ system prompt should receive:
interface QBIQContext {
  player?: { name; position; jersey_number; notes };
  team?: { name; age_group; season; offensive_style };
  video?: { title; duration_seconds };
  playSequence?: { down; distance; yard_line; coach_label };
  coachNote?: string;
  pdf?: { name: string; data: string };
}
// buildQBIQSystemPrompt(ctx: QBIQContext): string
```

**OLIQ already has dynamic athlete profile — use as the model:**
```typescript
// KEEP this pattern from OLIQ:
function buildAthleteProfile(athlete: Athlete | null): string {
  // Returns "No specific athlete profile provided" if empty
  // Otherwise builds structured profile string
  // Calibrates to age/level
}
function buildSystemPrompt(athlete: Athlete | null): string { ... }
```

---

## Intelligence Modules

### Module Interface
```typescript
// lib/intelligence/schemas.ts
export type IntelligenceModuleKey =
  | 'QBIQ' | 'OLIQ' | 'RBIQ' | 'WRIQ'
  | 'DLIQ' | 'LBIQ' | 'DBIQ'
  | 'TEAMIQ' | 'MISTAKEIQ' | 'SCOUTIQ' | 'PRACTICEIQ';

export interface PositionAnalysisInput {
  moduleKey: IntelligenceModuleKey;
  teamId: string;
  playerId?: string;
  videoId?: string;
  playSequenceId?: string;
  frames: string[];           // base64 JPEG data URLs
  coachNote?: string;
  pdf?: { name?: string; data: string };
  player?: {
    name?: string; position?: string; jersey_number?: string;
    age_group?: string; notes?: string;
  };
  team?: {
    name?: string; age_group?: string; season?: string;
    offensive_style?: string; defensive_style?: string;
  };
  playSequence?: {
    down?: number; distance?: number; yard_line?: string;
    coach_label?: string;
  };
}

export interface PositionAnalysisResult {
  overall_score: number;
  position_scores: Record<string, number>;
  reasoning: Record<string, string>;
  strengths: string[];
  weaknesses: string[];
  drills: string[];
  summary: string;
  model: string;
  framesAnalyzed: number;
}
```

### MVP Modules (build first)

**QBIQ** — `lib/intelligence/modules/qbiq.ts`
- Scoring: mechanics 40%, decision_making 40%, pocket_presence 20%
- Key rubric items: base width, weight transfer, stride length, hip-shoulder separation, release point, follow-through; pre-snap recognition, eye discipline, progression evidence, pressure response; snap exchange, pocket climb vs bail, escape with ball security

**OLIQ** — `lib/intelligence/modules/oliq.ts`
- Scoring: pass_protection 40%, run_blocking 40%, footwork_leverage 20%
- Key rubric items: set type, kick slide, hand timing/placement, anchor, mirror/redirect; first-step explosion, pad level, hand fit, hip roll, leg drive, combo block, climb to LB; base width, staying square, knee bend, recovery

**TEAMIQ** — `lib/intelligence/modules/teamiq.ts`
- Evaluates: offensive formation, defensive front, run/pass tendency, play direction, motion tendency, favorite play families, down-and-distance tendency, explosive play causes, weaknesses
- Output format: `{ tendency, confidence, sample_size }[]`
- Example: `"Runs right from tight double wing on 71% of observed plays. Confidence: 0.78. Sample size: 14 plays."`

**MISTAKEIQ** — `lib/intelligence/modules/mistakeiq.ts`
- Categories: missed_assignment, missed_block, missed_contain, wrong_gap_fit, bad_pursuit_angle, poor_tackling_leverage, turnover_risk, snap_mesh_issue, alignment_error, coverage_bust, penalty_risk, poor_effort, clock_situation_error
- Each mistake: `{ title, severity, category, description, likely_impact, correction, drill, evidence_frames, confidence }`
- Severity: minor | moderate | major | game_changing

**Scoring scale (all modules):**
90-100 Elite | 80-89 Advanced | 70-79 Solid | 60-69 Developing | <60 Beginner

### System Prompt Foundation
```typescript
// lib/intelligence/football-brain.ts
export const FOOTBALL_BRAIN_SYSTEM = `
You are PlayScout Football Intelligence.
You are a youth football film analyst with the combined expertise of:
- A former Division I football player and quarterback
- A middle linebacker
- A decade-long championship youth football coach specializing in 9U–10U football

Your job is to analyze football film through evidence.

Rules:
1. Do not guess beyond the visual evidence.
2. Separate observation from interpretation.
3. Use confidence scores (0.0–1.0).
4. Identify which frames support your conclusion.
5. For youth football, prioritize: assignment, alignment, leverage, effort, ball security, tackling angles, and football IQ.
6. Never invent jersey numbers, scores, player names, stats, or results.
7. If the subject is unclear, state what is unclear and why.
8. Explain mistakes in coachable language a youth volunteer coach can act on.
9. Recommend simple fixes that can be installed at practice this week.
10. Build conclusions from repeated evidence over time.
11. Never claim certainty when video evidence is limited.
12. Grade against age-appropriate fundamentals, never NFL/college standards.
`.trim();
```

---

## Two Analysis Modes

### Mode 1: Quick Clip Analysis
```
Coach uploads short clip (< 2 min)
→ Browser extracts 16 frames (768px JPEG)
→ User selects module (QBIQ/OLIQ/TEAMIQ/MISTAKEIQ)
→ POST /api/intelligence/analyze
→ Structured JSON result
→ Rendered coaching report
→ Optional: save to player/team profile
```
- Never block on this — should complete in < 30s
- Browser extraction only, no FFmpeg needed

### Mode 2: Full Game Background Analysis
```
Coach uploads full game (100MB–4GB)
→ Direct resumable TUS upload to Supabase Storage (NEVER through Next.js route)
→ Create video record + upload record in DB
→ Queue video_processing_job
→ External worker claims job
→ Worker: ffprobe → thumbnail → 16 frames per play → upload frames → create play_sequences
→ Coach confirms/corrects play boundaries in UI
→ Coach assigns sequences to modules
→ AI jobs queue and run
→ Results save incrementally to position_analysis_results
→ UI updates via Supabase Realtime
→ Coach can use rest of app freely
```

**Critical upload rules:**
- Large video NEVER goes through a Next.js API route
- Large video NEVER processed inside Vercel functions
- Use `@uppy/tus` + Supabase Storage TUS endpoint
- Show progress: "Uploading Bulldogs vs Wildcats.mp4 — 42%"
- After upload show processing timeline with coach-friendly status labels

**Processing status labels (coach-friendly):**
Queued → Preparing Film → Extracting Frames → Building Timeline → Finding Plays → Reviewing Evidence → Analyzing Assignments → Detecting Tendencies → Creating Report → Complete / Needs Attention

---

## Database Schema

Apply via Supabase migrations in `supabase/migrations/`.

```sql
-- 001_initial_schema.sql

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
('QBIQ',      'Quarterback Intelligence',      'QB',   'Evaluates QB mechanics, decision-making, pocket presence, ball security, and play execution.'),
('OLIQ',      'Offensive Line Intelligence',   'OL',   'Evaluates pass protection, run blocking, footwork, leverage, hand placement, and assignment execution.'),
('TEAMIQ',    'Team Intelligence',             'TEAM', 'Evaluates team tendencies, formations, play families, mistakes, and improvement priorities.'),
('MISTAKEIQ', 'Mistake Intelligence',          'TEAM', 'Detects game-changing mistakes and recurring issues from film evidence.');

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
```

---

## Row Level Security

Enable RLS on every table. Core pattern:

```sql
-- 002_rls.sql

alter table public.teams enable row level security;
create policy "Members can read teams"
  on public.teams for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = teams.organization_id
      and om.user_id = auth.uid()
    )
  );

-- Apply same pattern to: players, videos, video_uploads, video_frames,
-- play_sequences, video_processing_jobs, ai_analysis_jobs,
-- position_analysis_results, mistake_events, team_tendencies, team_memory
-- Service role key bypasses RLS for workers.
```

---

## Application Routes

### Public
| Route | Page |
|---|---|
| `/` | Homepage |
| `/login` | Login |
| `/register` | Register |
| `/about` | What PlayScout does |
| `/pricing` | Pricing (placeholder) |
| `/demo` | Example report (placeholder) |

### Authenticated (`/app`)
| Route | Page |
|---|---|
| `/app` | Main dashboard |
| `/app/teams` | Teams list |
| `/app/teams/new` | Create team |
| `/app/teams/[teamId]` | Team command center |
| `/app/teams/[teamId]/roster` | Roster + player profiles |
| `/app/teams/[teamId]/film` | Film library |
| `/app/teams/[teamId]/intelligence` | Team intelligence dashboard |
| `/app/teams/[teamId]/modules/qbiq` | Quarterback Intelligence |
| `/app/teams/[teamId]/modules/oliq` | Offensive Line Intelligence |
| `/app/film/[filmId]` | Film detail |
| `/app/film/[filmId]/plays` | Play sequence list |
| `/app/film/[filmId]/plays/[playId]` | Single-play analysis |
| `/app/analysis/[analysisId]` | Saved intelligence report |
| `/app/reports/[reportId]` | Generated scouting/coaching report |

---

## Codebase Structure

```
playscout/
  app/
    layout.tsx              # Root layout — Space Grotesk, ThemeProvider, Sonner
    globals.css             # PlayScout design tokens (see below)
    page.tsx                # Homepage
    login/page.tsx
    register/page.tsx
    app/
      layout.tsx            # AppShell (sidebar + header)
      page.tsx              # Dashboard
      teams/
        page.tsx
        new/page.tsx
        [teamId]/
          page.tsx
          roster/page.tsx
          film/page.tsx
          intelligence/page.tsx
          modules/
            qbiq/page.tsx
            oliq/page.tsx
      film/[filmId]/
        page.tsx
        plays/
          page.tsx
          [playId]/page.tsx
      analysis/[analysisId]/page.tsx
      reports/[reportId]/page.tsx
    api/
      videos/complete-upload/route.ts
      intelligence/analyze/route.ts   # Shared module router
      qbiq/analyze/route.ts
      oliq/analyze/route.ts
      oliq/extract/route.ts           # Server FFmpeg extraction
  components/
    ui/                     # shadcn/ui components
    marketing/              # Hero, FeatureCard, IntelligenceModuleCard
    dashboard/              # AppShell, Sidebar, StatCard, ProcessingStatusCard
    teams/                  # TeamCard, TeamForm, RosterTable, PlayerProfileCard
    film/                   # VideoUploader, FilmTimeline, FrameGrid, PlaySequenceCard, ProcessingTimeline
    intelligence/           # ModuleSelector, AnalysisReport, TendencyChart, MistakeCard, RecommendationCard, ConfidenceBadge
  lib/
    supabase/               # client.ts, server.ts, middleware.ts
    ai/
      model-router.ts
      schemas.ts
      providers/            # openai.ts, anthropic.ts, google.ts, perplexity.ts
    intelligence/
      analyze-position.ts   # Main entry point — routes to correct module
      schemas.ts            # Shared Zod schemas + TypeScript types
      prompts.ts            # Shared prompt utilities
      football-brain.ts     # FOOTBALL_BRAIN_SYSTEM base prompt
      modules/              # qbiq.ts, oliq.ts, teamiq.ts, mistakeiq.ts
    video/
      frame-extraction.ts   # Browser-side canvas extraction
      server-extract.ts     # FFmpeg extraction (from OLIQ reference)
      create-sequences.ts
      hudl-ingestion.ts
    db/
      queries.ts            # Typed Supabase query helpers
      types.ts              # Generated + manual DB types
  workers/
    process-video.ts        # Background video processing pipeline
    analyze-sequence.ts     # Background AI analysis
  supabase/
    migrations/
      001_initial_schema.sql
      002_rls.sql
      003_storage.sql
      004_intelligence_modules.sql
  public/logo.svg
  tailwind.config.ts
  next.config.ts
  middleware.ts             # Supabase session refresh
```

---

## Brand & Design System

### Colors
```typescript
// tailwind.config.ts
colors: {
  playscout: {
    primary:    '#485995',  // Navy — primary surfaces, CTAs
    secondary:  '#c7c7c7',  // Light grey — secondary elements
    background: '#f8f4f4',  // Off-white — page background
    gold:       '#d2c600',  // Gold — intelligence highlights, scores
    ink:        '#111827',  // Near-black — body text
    muted:      '#6b7280',  // Grey — muted text
  }
}
```

### Tailwind Config
```typescript
import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['var(--font-space-grotesk)', 'sans-serif'] },
      colors: { playscout: { /* above */ } },
      boxShadow: { glass: '0 20px 60px rgba(17, 24, 39, 0.12)' },
    },
  },
};
export default config;
```

### Global CSS
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #f8f4f4;
  --foreground: #111827;
}

html { scroll-behavior: smooth; }
body { background: var(--background); color: var(--foreground); }

.glass-card {
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid rgba(255, 255, 255, 0.58);
  box-shadow: 0 20px 60px rgba(17, 24, 39, 0.12);
  backdrop-filter: blur(18px);
}

.gold-glow {
  box-shadow:
    0 0 0 1px rgba(210, 198, 0, 0.24),
    0 12px 40px rgba(210, 198, 0, 0.18);
}
```

### Visual Identity
- Glassmorphism cards with frosted white panels
- Navy (#485995) command surfaces
- Gold (#d2c600) for intelligence moments, scores, highlights
- Large clean typography, generous spacing
- Confidence badges on all AI outputs
- Evidence cards showing frame references

**Avoid**: cartoon football graphics, generic AI robot visuals, dark gamer interface, enterprise complexity

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://rapuqqztreaefzysetju.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_URL=https://rapuqqztreaefzysetju.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_PROJECT_REF=rapuqqztreaefzysetju
SUPABASE_DB_HOST=db.rapuqqztreaefzysetju.supabase.co
SUPABASE_SERVICE_ROLE_KEY=    # Required for workers + admin routes

# App
NEXT_PUBLIC_SITE_URL=https://playscout.ai
NEXT_PUBLIC_APP_URL=https://playscout.ai

# AI Providers
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
GEMINI_API_KEY=
PERPLEXITY_API_KEY=

# Workers
VIDEO_PROCESSING_SECRET=      # Shared secret between app and worker
WORKER_ID=playscout-worker-001

# Vercel
VERCEL_PROJECT_ID=prj_5DrdC9KQumQTH6BGruiBMADwKtTd
VERCEL_ORG_ID=team_tyYugyFj05x63r5t9jwqFWq3
```

---

## Deployment Rules

- Push to `main` → Vercel auto-deploys production
- Feature branches → PR → merge to `main`
- **Never** run `vercel --prod` directly without confirming project is `playscout`
- Scope: `chris-burhans-projects` on Vercel
- Workers run on Railway (not Vercel) — use `VIDEO_PROCESSING_SECRET` to authenticate worker→app calls
- Use `apply_migration` for all DB schema changes — never raw DDL in production

---

## MCP Connector

Config in `.claude/mcp_config.json`. Auto-connects in Claude Code.
Requires `SUPABASE_SERVICE_ROLE_KEY` in your shell environment.
Get it: https://supabase.com/dashboard/project/rapuqqztreaefzysetju/settings/api

---

## MVP Build Order

1. PlayScout homepage + app shell (Space Grotesk, glass cards, navy/gold brand)
2. Supabase Auth (login, register, session middleware)
3. Organization + team + player data model + RLS
4. Port QBIQ as PlayScout module (remove hardcoded Carter context, add dynamic context)
5. Port OLIQ as PlayScout module (already dynamic — keep pattern)
6. Save QBIQ/OLIQ results to `position_analysis_results`
7. Short clip upload + analysis (Mode 1)
8. Large video resumable upload via TUS + Supabase Storage (Mode 2 upload only)
9. Background processing job architecture + worker scaffolding
10. Frame extraction worker (FFmpeg)
11. Manual play sequence creation UI
12. TEAMIQ module
13. MISTAKEIQ module
14. Team memory (pgvector embeddings)
15. Reports (weekly team, opponent scout, player development, practice plan)

---

## Future Modules
RBIQ, WRIQ, DLIQ, LBIQ, DBIQ, SCOUTIQ, PRACTICEIQ

---

## PlayScoutIQ — Two-System Intelligence Architecture

### System B — VideoIQ Engine (evidence layer)
Breaks video into frames. Analyzes football. Saves structured results to DB. Never converses.

### System A — PlayScoutIQ Assistant (intelligence layer)
Reads System B's output. Converses with coaches. Never watches video. Only reasons over proven evidence.

**A never invents. A only interprets what B already proved.**

### Model Routing

| Job | Provider | Model |
|---|---|---|
| Frame analysis (System B) | Google | `gemini-2.5-pro` |
| Assignment grading (System B) | Google | `gemini-2.5-pro` |
| Quick coach Q&A (System A) | Anthropic | `claude-sonnet-4-5` |
| Deep trend analysis (System A) | Anthropic | `claude-opus-4` |
| Practice plan generation (System A) | Anthropic | `claude-opus-4` |
| Game strategy (System A) | Anthropic | `claude-opus-4` |
| Football rules / scheme knowledge (System A) | Perplexity | `sonar-pro` |
| Memory embeddings (bridge) | OpenAI | `text-embedding-3-small` |

### New Files Required
```
app/api/playscoutiq/chat/route.ts         # SSE streaming chat (System A)
app/api/intelligence/analyze/route.ts     # Frame analysis router (System B)
components/intelligence/PlayScoutIQ.tsx   # Chat panel component
lib/intelligence/playscoutiq-prompt.ts    # Dynamic system prompt builder
lib/intelligence/memory.ts               # saveToTeamMemory + getRelevantMemory (RAG)
lib/ai/playscoutiq-router.ts             # Job type → model routing
supabase/migrations/005_pgvector.sql     # pgvector + match_team_memory RPC
```

### Key Implementation Rules
- System A receives: recent analysis results, team tendencies, recent mistakes, top 5 RAG memory matches, last 10 chat messages
- System A must always cite source: "Based on X plays analyzed..." or "The film showed..."
- System A must say "I don't have enough film evidence" when context is insufficient
- Stream all System A responses via SSE (never block waiting for full response)
- Memory embeddings run after every System B save (async, non-blocking)
- pgvector similarity threshold: 0.75, top 5 matches per query

### PlayScoutIQ Chat Component Behavior
- Floating panel or right sidebar — never blocks film analysis UI
- Show suggested starter questions when no messages exist (generated from available data)
- Gold (#d2c600) accent on assistant messages
- Navy (#485995) header
- "Based on X plays" citation chips on evidence-backed claims
- Quick action buttons: "Generate practice plan", "What to fix this week", "Scout opponent"

Full spec: see `PLAYSCOUTIQ_SPEC.md`
