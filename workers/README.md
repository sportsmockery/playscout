# PlayScout Workers

Background processing that must **never** run on Vercel. Deploy target: **Railway**.

`npm run worker` (the Railway start command) runs `workers/index.ts`, which
starts both poll loops below in one process. Each also runs standalone via
its own `npm run worker:video` / `worker:playbook` script, for local testing
without spinning up the other one.

## `process-video.ts`

Polls `video_processing_jobs`, atomically claims a queued job, and runs the
frame-extraction pipeline for uploaded film:

```
Preparing Film → Extracting Frames → Building Timeline → Ready for Review
```

What it does per job:

1. Signs a URL for the private `videos` object and **streams it to disk** (a 4GB
   game never sits in memory).
2. Probes duration with ffmpeg (no ffprobe needed) → updates `videos.duration_seconds`.
3. Writes a thumbnail (~10% in) to the public `thumbnails` bucket → sets
   `videos.thumbnail_path`.
4. Extracts `FRAME_COUNT` evenly spaced 768px JPEG frames → uploads to the
   `frames` bucket → inserts `video_frames` rows.
5. Sets `videos.status = 'ready_for_review'` and marks the job `completed`.

Failures increment `attempts`; the job goes to `retrying` until `max_attempts`,
then `failed` (and the video is marked `failed`).

### Deliberately out of scope (next steps)

- **Play-boundary detection** — coaches define plays in the manual UI, then per
  play the app queues AI analysis. This worker does not guess boundaries.
- **AI analysis** (`analyze-sequence.ts`) — grading/tendencies/mistakes run as
  separate jobs against `ai_analysis_jobs` once plays exist.

## `process-playbook.ts`

Polls `playbook_processing_jobs`, atomically claims a queued job, and gives
PlaybookIQ a real per-play visual layer instead of only whole-book prose:

```
Downloading playbook → Rendering pages → Analyzing N pages → Ready
```

What it does per job (PDF playbooks only — the upload route never queues a
job for PPTX/DOCX/image uploads, since there's no reliable page-rasterization
path for those formats yet, so they stay text-only):

1. Downloads the private `playbooks` object via a signed URL.
2. Rasterizes every page to a PNG with `pdfjs-dist` + `@napi-rs/canvas` — no
   system Cairo/poppler needed, same "prebuilt native binary" approach as
   `ffmpeg-static`.
3. Uploads each page image back to the `playbooks` bucket
   (`{teamId}/{playbookId}/pages/pNNN.png`).
4. Sends each page to Gemini (`PLAYBOOK_VISION_CONCURRENCY` at a time, default
   4) asking it to identify the play and produce a **per-position assignment**
   for every player actually drawn on that page — not a single generic
   "Blocking:" sentence for the whole play. Pages that aren't play diagrams
   (title page, table of contents, etc.) are skipped, not forced into a fake
   analysis.
5. Inserts one `playbook_plays` row per identified play.
6. Sets `playbooks.pages_status = 'ready'` and marks the job `completed`.

Failures set `playbooks.pages_status = 'failed'` with `pages_error` once
`max_attempts` is exhausted, same retry semantics as the video worker. A
single page's vision call failing doesn't fail the whole playbook — it's
logged and skipped so the rest of the book still comes through.

## Run locally

```bash
npm install                # downloads the ffmpeg-static binary
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run worker            # both loops
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run worker:video      # video only
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GOOGLE_API_KEY=... npm run worker:playbook  # playbook only
```

`worker:video:dev` / `worker:playbook:dev` reload on change.

## Deploy on Railway

1. New service from this repo. Nixpacks auto-detects Node and runs `npm install`
   (which fetches the ffmpeg binary — no extra buildpack needed).
2. Start command: `npm run worker` (also set via `Procfile` / `railway.json`) —
   runs both pollers in one process/service.
3. Set service variables:

   | Variable | Required | Notes |
   |---|---|---|
   | `SUPABASE_URL` | ✅ | e.g. `https://rapuqqztreaefzysetju.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | ✅ | bypasses RLS — Railway only, never in the browser/Vercel |
   | `GOOGLE_API_KEY` | ✅ (for playbook analysis) | same Gemini key the app uses |
   | `WORKER_ID` | – | defaults to `playscout-worker-001`; make unique per instance |
   | `POLL_INTERVAL_MS` | – | idle poll interval, default `5000` |
   | `FRAME_COUNT` | – | video frames per video, default `16` |
   | `PLAYBOOK_VISION_CONCURRENCY` | – | pages analyzed in parallel per playbook, default `4` |

Scale by running multiple instances with distinct `WORKER_ID`s — job claiming is
race-safe via a conditional status update, so workers won't double-process.
