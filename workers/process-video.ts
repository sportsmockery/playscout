/**
 * PlayScout video processing worker.
 *
 * Runs OUTSIDE Vercel (Railway per CLAUDE.md). Polls video_processing_jobs,
 * claims one atomically, and runs the frame-extraction pipeline:
 *
 *   Preparing Film → Extracting Frames → Building Timeline → Ready for Review
 *
 * It downloads the private video via a signed URL (streamed to disk, so a 4GB
 * game never sits in memory), probes duration, writes a thumbnail, extracts
 * evenly spaced evidence frames, and records them in video_frames. Automatic
 * play-boundary detection and AI analysis are deliberately NOT done here —
 * coaches define plays in the manual UI, then analysis jobs run separately.
 *
 * Run: `npm run worker`  (env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ...)
 */
import { promises as fs, createWriteStream } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from './lib/service-client'
import { Sentry } from './lib/sentry'
import {
  probeDurationSeconds,
  extractFrameAt,
  extractEvenlySpacedFrames,
  detectSceneCuts,
  buildSegments,
  extractFramesPerSegment,
  ensureDir,
  TARGET_WIDTH,
  SCENE_DETECTION_MAX_DURATION_SECONDS,
  type ExtractedFrame,
} from './lib/ffmpeg'

const WORKER_ID = process.env.WORKER_ID ?? 'playscout-worker-001'
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000)
const FRAME_COUNT = Number(process.env.FRAME_COUNT ?? 16)
const CLAIMABLE_STATUSES = ['queued', 'retrying']

// Scene-cut segmentation tuning — see the doc comment on detectSceneCuts in
// lib/ffmpeg.ts for why this only applies to edited/highlight video, not
// continuous game footage.
const MIN_SEGMENTS_FOR_SEGMENTED_MODE = 3
const MAX_AVG_SEGMENT_SECONDS = 60
const FRAMES_PER_SEGMENT = 4
const MAX_SEGMENTED_TOTAL_FRAMES = 200

/**
 * Decides between segment-aware extraction (edited/highlight video — dense
 * per-clip coverage) and the original evenly-spaced-across-duration
 * extraction (continuous footage, or anything too long to be worth a full
 * scene-detection decode pass). Never throws — any failure in scene
 * detection just falls back to the original behavior rather than failing
 * the whole job over a coverage optimization.
 */
async function extractFrames(
  videoPath: string,
  durationSeconds: number,
  outDir: string,
): Promise<{ frames: ExtractedFrame[]; mode: 'segmented' | 'evenly_spaced'; segments?: number }> {
  if (durationSeconds > SCENE_DETECTION_MAX_DURATION_SECONDS) {
    const frames = await extractEvenlySpacedFrames(videoPath, durationSeconds, FRAME_COUNT, outDir)
    return { frames, mode: 'evenly_spaced' }
  }

  try {
    const cuts = await detectSceneCuts(videoPath)
    const segments = buildSegments(cuts, durationSeconds)
    const avgSegmentSeconds = durationSeconds / segments.length

    if (segments.length < MIN_SEGMENTS_FOR_SEGMENTED_MODE || avgSegmentSeconds > MAX_AVG_SEGMENT_SECONDS) {
      // Too few/too-long segments to be an edited video — real continuous
      // footage, or one that just has a couple of scene changes in it.
      const frames = await extractEvenlySpacedFrames(videoPath, durationSeconds, FRAME_COUNT, outDir)
      return { frames, mode: 'evenly_spaced' }
    }

    const framesPerSegment = Math.max(
      1,
      Math.min(FRAMES_PER_SEGMENT, Math.floor(MAX_SEGMENTED_TOTAL_FRAMES / segments.length)),
    )
    const frames = await extractFramesPerSegment(videoPath, segments, framesPerSegment, outDir)
    return { frames, mode: 'segmented', segments: segments.length }
  } catch (err) {
    log('scene detection failed, falling back to evenly-spaced extraction', err instanceof Error ? err.message : err)
    const frames = await extractEvenlySpacedFrames(videoPath, durationSeconds, FRAME_COUNT, outDir)
    return { frames, mode: 'evenly_spaced' }
  }
}

interface Job {
  id: string
  video_id: string
  team_id: string
  job_type: string
  status: string
  attempts: number
  max_attempts: number
}

let shuttingDown = false

function log(msg: string, extra?: unknown) {
  const stamp = new Date().toISOString()
  if (extra !== undefined) console.log(`[${stamp}] [${WORKER_ID}] ${msg}`, extra)
  else console.log(`[${stamp}] [${WORKER_ID}] ${msg}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function setJobProgress(
  supabase: SupabaseClient,
  jobId: string,
  progress: number,
  currentStep: string,
) {
  await supabase
    .from('video_processing_jobs')
    .update({ progress, current_step: currentStep, updated_at: new Date().toISOString() })
    .eq('id', jobId)
  log(`job ${jobId}: ${progress}% — ${currentStep}`)
}

/**
 * Optimistically claim the next queued/retrying job. The conditional UPDATE
 * (status must still be claimable) is atomic, so if two workers race only one
 * update matches a row — no stored procedure needed.
 */
async function claimNextJob(supabase: SupabaseClient): Promise<Job | null> {
  const { data: candidates } = await supabase
    .from('video_processing_jobs')
    .select('id, video_id, team_id, job_type, status, attempts, max_attempts')
    .in('status', CLAIMABLE_STATUSES)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(5)

  if (!candidates?.length) return null

  const now = new Date().toISOString()
  for (const c of candidates as Job[]) {
    const { data: claimed } = await supabase
      .from('video_processing_jobs')
      .update({
        status: 'running',
        locked_by: WORKER_ID,
        locked_at: now,
        started_at: now,
        attempts: c.attempts + 1,
        updated_at: now,
      })
      .eq('id', c.id)
      .in('status', CLAIMABLE_STATUSES)
      .select('id, video_id, team_id, job_type, status, attempts, max_attempts')
      .maybeSingle()

    if (claimed) return claimed as Job
    // Lost the race — try the next candidate.
  }
  return null
}

async function downloadVideoToDisk(
  supabase: SupabaseClient,
  storagePath: string,
  destPath: string,
) {
  const { data, error } = await supabase.storage
    .from('videos')
    .createSignedUrl(storagePath, 60 * 60)
  if (error || !data?.signedUrl) {
    throw new Error(`Could not sign video URL: ${error?.message ?? 'unknown error'}`)
  }
  const res = await fetch(data.signedUrl)
  if (!res.ok || !res.body) {
    throw new Error(`Video download failed: HTTP ${res.status}`)
  }
  await pipeline(
    Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>),
    createWriteStream(destPath),
  )
}

async function runPipeline(supabase: SupabaseClient, job: Job) {
  const workDir = await ensureDir(path.join(os.tmpdir(), `playscout-job-${job.id}`))
  const videoPath = path.join(workDir, 'input')
  const framesDir = await ensureDir(path.join(workDir, 'frames'))

  try {
    await supabase.from('videos').update({ status: 'processing' }).eq('id', job.video_id)

    // ── Preparing Film ──────────────────────────────────────────────
    await setJobProgress(supabase, job.id, 5, 'Preparing Film')
    const { data: video, error: vErr } = await supabase
      .from('videos')
      .select('id, team_id, storage_path')
      .eq('id', job.video_id)
      .single()
    if (vErr || !video) throw new Error(`Video ${job.video_id} not found`)
    if (!video.storage_path) throw new Error('Video has no storage_path')

    await downloadVideoToDisk(supabase, video.storage_path, videoPath)
    const duration = await probeDurationSeconds(videoPath)
    if (duration) {
      await supabase.from('videos').update({ duration_seconds: duration }).eq('id', job.video_id)
    }

    // ── Extracting Frames ───────────────────────────────────────────
    await setJobProgress(supabase, job.id, 20, 'Extracting Frames')

    // Thumbnail (public bucket) at ~10% in, so it isn't a black lead-in frame.
    const thumbAt = duration ? Math.max(0.5, duration * 0.1) : 1
    const thumbPath = path.join(workDir, 'thumb.jpg')
    if (await extractFrameAt(videoPath, thumbAt, thumbPath)) {
      const thumbObject = `${job.team_id}/${job.video_id}.jpg`
      const thumbBytes = await fs.readFile(thumbPath)
      const { error: upErr } = await supabase.storage
        .from('thumbnails')
        .upload(thumbObject, thumbBytes, { contentType: 'image/jpeg', upsert: true })
      if (!upErr) {
        const { data: pub } = supabase.storage.from('thumbnails').getPublicUrl(thumbObject)
        await supabase.from('videos').update({ thumbnail_path: pub.publicUrl }).eq('id', job.video_id)
      }
    }

    const effectiveDuration = duration ?? FRAME_COUNT + 1 // fall back to 1 fps-ish spread
    const extraction = await extractFrames(videoPath, effectiveDuration, framesDir)
    const frames = extraction.frames
    if (!frames.length) throw new Error('No frames could be extracted from the video')
    log(
      extraction.mode === 'segmented'
        ? `job ${job.id}: segmented extraction — ${extraction.segments} detected cuts, ${frames.length} frames`
        : `job ${job.id}: evenly-spaced extraction — ${frames.length} frames`
    )

    // ── Building Timeline ───────────────────────────────────────────
    await setJobProgress(supabase, job.id, 80, 'Building Timeline')

    // Idempotent on retry: clear any frames from a previous attempt.
    await supabase.from('video_frames').delete().eq('video_id', job.video_id)

    const frameRows: {
      video_id: string
      frame_index: number
      timestamp_seconds: number
      storage_path: string
      width: number
    }[] = []

    for (const frame of frames) {
      const object = `${job.team_id}/${job.video_id}/frame-${String(frame.index).padStart(3, '0')}.jpg`
      const bytes = await fs.readFile(frame.path)
      const { error: fErr } = await supabase.storage
        .from('frames')
        .upload(object, bytes, { contentType: 'image/jpeg', upsert: true })
      if (fErr) throw new Error(`Frame upload failed: ${fErr.message}`)
      frameRows.push({
        video_id: job.video_id,
        frame_index: frame.index,
        timestamp_seconds: frame.timestampSeconds,
        storage_path: object,
        width: TARGET_WIDTH,
      })
    }

    const { error: insErr } = await supabase.from('video_frames').insert(frameRows)
    if (insErr) throw new Error(`Frame insert failed: ${insErr.message}`)

    // ── Ready for Review ────────────────────────────────────────────
    await supabase
      .from('videos')
      .update({ status: 'ready_for_review', error_message: null })
      .eq('id', job.video_id)
    await supabase
      .from('video_processing_jobs')
      .update({
        status: 'completed',
        progress: 100,
        current_step: 'Ready for Review',
        locked_by: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    log(`job ${job.id} complete — ${frameRows.length} frames for video ${job.video_id}`)
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function failJob(supabase: SupabaseClient, job: Job, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  const exhausted = job.attempts >= job.max_attempts
  const now = new Date().toISOString()

  Sentry.captureException(err, {
    tags: { worker: 'video', jobType: job.job_type, exhausted },
    extra: { jobId: job.id, videoId: job.video_id, teamId: job.team_id, attempts: job.attempts },
  })

  await supabase
    .from('video_processing_jobs')
    .update({
      status: exhausted ? 'failed' : 'retrying',
      error_message: message.slice(0, 1000),
      locked_by: null,
      locked_at: null,
      updated_at: now,
    })
    .eq('id', job.id)

  if (exhausted) {
    await supabase
      .from('videos')
      .update({ status: 'failed', error_message: message.slice(0, 1000) })
      .eq('id', job.video_id)
  }

  log(`job ${job.id} ${exhausted ? 'FAILED (exhausted)' : 'errored (will retry)'}: ${message}`)
}

async function main() {
  const supabase = createServiceClient()
  log(`worker online — polling every ${POLL_INTERVAL_MS}ms, ${FRAME_COUNT} frames/video`)

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      if (!shuttingDown) log(`${sig} received — finishing current job then exiting`)
      shuttingDown = true
    })
  }

  while (!shuttingDown) {
    let job: Job | null = null
    try {
      job = await claimNextJob(supabase)
    } catch (err) {
      log('claim error', err instanceof Error ? err.message : err)
    }

    if (!job) {
      await sleep(POLL_INTERVAL_MS)
      continue
    }

    log(`claimed job ${job.id} (type=${job.job_type}, attempt ${job.attempts}/${job.max_attempts})`)
    try {
      await runPipeline(supabase, job)
    } catch (err) {
      await failJob(supabase, job, err).catch((e) => log('failJob error', e))
    }
  }

  log('worker stopped')
  process.exit(0)
}

main().catch((err) => {
  log('fatal', err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
})
