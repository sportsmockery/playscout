# PlayScout Workers

Background processing that must **never** run on Vercel. Deploy target: **Railway**.

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

## Run locally

```bash
npm install                # downloads the ffmpeg-static binary
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run worker
```

`npm run worker:dev` reloads on change.

## Deploy on Railway

1. New service from this repo. Nixpacks auto-detects Node and runs `npm install`
   (which fetches the ffmpeg binary — no extra buildpack needed).
2. Start command: `npm run worker` (also set via `Procfile` / `railway.json`).
3. Set service variables:

   | Variable | Required | Notes |
   |---|---|---|
   | `SUPABASE_URL` | ✅ | e.g. `https://rapuqqztreaefzysetju.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | ✅ | bypasses RLS — Railway only, never in the browser/Vercel |
   | `WORKER_ID` | – | defaults to `playscout-worker-001`; make unique per instance |
   | `POLL_INTERVAL_MS` | – | idle poll interval, default `5000` |
   | `FRAME_COUNT` | – | frames per video, default `16` |

Scale by running multiple instances with distinct `WORKER_ID`s — job claiming is
race-safe via a conditional status update, so workers won't double-process.
