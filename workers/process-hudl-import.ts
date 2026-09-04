/**
 * PlayScout Hudl import worker.
 *
 * Polls hudl_import_jobs, claims one atomically, signs in to Hudl as the
 * coach, and pulls a playlist's clips into PlayScout as ordinary film:
 *
 *   Signing in to Hudl → Finding Clips → Downloading Clip n of N → Complete
 *
 * Each clip becomes a `videos` row with `source_type: 'hudl_link'` and a
 * `storage_path`, plus the usual `full_pipeline` job — so from the moment a
 * clip lands, every existing path (frames, native-video analysis, folders,
 * batches, modules) treats it like any other upload and none of them needed
 * to learn about Hudl.
 *
 * Two rules this file exists to keep:
 *
 *   1. No credential, session cookie, signed media URL or raw exception ever
 *      reaches `error_message`, `diagnostics`, or a log line. Those strings
 *      end up on a coach's screen and in a database backup.
 *   2. Clips are pulled SERIALLY with a delay. This runs against the coach's
 *      own Hudl account; getting it flagged costs them Hudl, which is a much
 *      worse outcome than a slow import.
 *
 * Run: `npm run worker` (with the video/playbook/analysis pollers).
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from './lib/service-client'
import { Sentry } from './lib/sentry'
import { openHudlSession, HudlSessionError, type HudlSession } from './lib/hudl-session'
import {
  enumerateHudlPlaylist,
  HudlPlaylistError,
  type HudlClipCandidate,
} from './lib/hudl-playlist'
import { cookieHeaderFor, downloadHudlClip, HudlClipError, mediaUrlForLog } from './lib/hudl-clip'
import { mapHudlRow, toPlaySequenceFields } from '../lib/import/hudl-breakdown'
import { parseHudlUrl } from '../lib/import/hudl-url'

const WORKER_ID = process.env.WORKER_ID ?? `hudl-${os.hostname()}`
const POLL_INTERVAL_MS = Number(process.env.HUDL_POLL_INTERVAL_MS ?? 15_000)
/** Between clips. Deliberately unhurried — see rule 2 above. */
const CLIP_DELAY_MS = Number(process.env.HUDL_CLIP_DELAY_MS ?? 2_500)
/** A cut-up is tens of clips; a link that yields hundreds is not what we think. */
const MAX_CLIPS = Number(process.env.HUDL_MAX_CLIPS ?? 250)
const STUCK_JOB_TIMEOUT_MS = Number(process.env.HUDL_STUCK_TIMEOUT_MS ?? 60 * 60 * 1000)
const REAP_EVERY_N_POLLS = 20
const CLAIMABLE_STATUSES = ['queued', 'retrying']

interface ImportJob {
  id: string
  team_id: string
  created_by: string | null
  source_url: string
  title: string | null
  folder_id: string | null
  opponent_id: string | null
  film_type: string
  attempts: number
  max_attempts: number
}

const JOB_COLUMNS =
  'id, team_id, created_by, source_url, title, folder_id, opponent_id, film_type, attempts, max_attempts'

let shuttingDown = false

function log(msg: string, extra?: unknown) {
  const stamp = new Date().toISOString()
  if (extra !== undefined) console.log(`[${stamp}] [${WORKER_ID}] [hudl] ${msg}`, extra)
  else console.log(`[${stamp}] [${WORKER_ID}] [hudl] ${msg}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function setStep(supabase: SupabaseClient, jobId: string, currentStep: string) {
  await supabase
    .from('hudl_import_jobs')
    .update({ current_step: currentStep, updated_at: new Date().toISOString() })
    .eq('id', jobId)
  log(`job ${jobId}: ${currentStep}`)
}

/**
 * Optimistically claim the next queued job. Same conditional UPDATE as
 * process-video.ts: atomic, so two workers racing means one wins.
 */
async function claimNextJob(supabase: SupabaseClient): Promise<ImportJob | null> {
  const { data: candidates } = await supabase
    .from('hudl_import_jobs')
    .select(JOB_COLUMNS)
    .in('status', CLAIMABLE_STATUSES)
    .order('created_at', { ascending: true })
    .limit(5)

  if (!candidates?.length) return null

  const now = new Date().toISOString()
  for (const c of candidates as ImportJob[]) {
    const { data: claimed } = await supabase
      .from('hudl_import_jobs')
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
      .select(JOB_COLUMNS)
      .maybeSingle()

    if (claimed) return claimed as ImportJob
    // Lost the race — try the next candidate.
  }
  return null
}

/**
 * A job stuck in `running` past the timeout means the worker died mid-import.
 * The clips it already imported stay — they are real film — so the job is
 * marked partial rather than failed, and the coach can re-run for the rest.
 */
async function reapStuckJobs(supabase: SupabaseClient) {
  const cutoff = new Date(Date.now() - STUCK_JOB_TIMEOUT_MS).toISOString()
  const { data: stuck } = await supabase
    .from('hudl_import_jobs')
    .select('id, clips_imported')
    .eq('status', 'running')
    .lt('locked_at', cutoff)

  for (const job of (stuck ?? []) as { id: string; clips_imported: number }[]) {
    log(`reaping stuck job ${job.id}`)
    await supabase
      .from('hudl_import_jobs')
      .update({
        status: job.clips_imported > 0 ? 'partial' : 'failed',
        error_message:
          'The import stopped partway through. Any clips already imported are in your film library — run it again for the rest.',
        locked_by: null,
        locked_at: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
  }
}

function clipTitle(job: ImportJob, clip: HudlClipCandidate): string {
  const base = job.title?.trim() || 'Hudl import'
  const number = String(clip.order + 1).padStart(2, '0')
  return `${base} — Clip ${number}`
}

/**
 * Stores one clip and queues it for the normal pipeline.
 *
 * The `videos` row is written BEFORE the upload so the object path can be
 * keyed by its id, matching the convention the TUS uploader uses
 * (`<teamId>/<id>.<ext>`). A row whose upload then fails is deleted rather
 * than left behind pointing at nothing.
 */
async function importClip(
  supabase: SupabaseClient,
  job: ImportJob,
  clip: HudlClipCandidate,
  filePath: string
): Promise<string> {
  const { data: video, error: insertError } = await supabase
    .from('videos')
    .insert({
      team_id: job.team_id,
      uploaded_by: job.created_by,
      title: clipTitle(job, clip),
      source_type: 'hudl_link',
      // Provenance only — playback comes from our own copy. Hudl's media URLs
      // are signed and expire, so this is a breadcrumb, not a fallback.
      source_url: `hudl:clip:${clip.clipId}`,
      status: 'uploaded',
      film_type: job.film_type,
      opponent_id: job.opponent_id,
      folder_id: job.folder_id,
    })
    .select('id')
    .single()

  if (insertError || !video) throw new Error(`could not create video row: ${insertError?.message}`)

  const objectPath = `${job.team_id}/${video.id}.mp4`
  const bytes = await fs.readFile(filePath)
  const { error: uploadError } = await supabase.storage
    .from('videos')
    .upload(objectPath, bytes, { contentType: 'video/mp4', upsert: true })

  if (uploadError) {
    await supabase.from('videos').delete().eq('id', video.id)
    throw new Error(`could not store clip: ${uploadError.message}`)
  }

  await supabase.from('videos').update({ storage_path: objectPath }).eq('id', video.id)

  // The breakdown Hudl already holds, through the same mapper the paste path
  // uses. One alias table, three ways in.
  const play = mapHudlRow(clip.columns, clip.order)
  const fields = toPlaySequenceFields(play)
  if (Object.keys(fields).length > 0) {
    await supabase.from('play_sequences').insert({
      video_id: video.id,
      team_id: job.team_id,
      sequence_number: 1,
      ...fields,
    })
  }

  const { error: jobError } = await supabase.from('video_processing_jobs').insert({
    video_id: video.id,
    team_id: job.team_id,
    job_type: 'full_pipeline',
    status: 'queued',
    priority: 5,
  })
  if (jobError) {
    // A video with no job sits at "Queued" forever with nothing coming for it.
    await supabase.from('videos').delete().eq('id', video.id)
    throw new Error(`could not queue processing: ${jobError.message}`)
  }

  return video.id
}

async function runImport(supabase: SupabaseClient, job: ImportJob) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `playscout-hudl-${job.id}-`))
  let session: HudlSession | null = null
  let imported = 0
  let failed = 0

  try {
    // The URL is re-parsed here rather than trusting ids the route stored —
    // the worker is what acts on them.
    const parsed = parseHudlUrl(job.source_url)
    if (!parsed.ok) throw new HudlPlaylistError(parsed.reason, [])

    await setStep(supabase, job.id, 'Signing in to Hudl')
    session = await openHudlSession(supabase, job.team_id)

    await setStep(supabase, job.id, 'Finding Clips')
    const clips = await enumerateHudlPlaylist(session.page, parsed.canonicalUrl)
    // The session survived a real page load, so cache it — the next import
    // skips the login entirely.
    await session.persist()

    if (clips.length > MAX_CLIPS) {
      throw new HudlPlaylistError(
        `That link contains ${clips.length} clips, more than PlayScout imports in one go. Split it into smaller playlists in Hudl.`,
        []
      )
    }

    await supabase
      .from('hudl_import_jobs')
      .update({ clips_found: clips.length, updated_at: new Date().toISOString() })
      .eq('id', job.id)
    log(`job ${job.id}: found ${clips.length} clips`)

    const cookies = await session.context.cookies()
    const userAgent =
      (await session.page.evaluate(() => navigator.userAgent).catch(() => null)) ?? 'PlayScout'

    for (const [index, clip] of clips.entries()) {
      if (shuttingDown) break
      await setStep(supabase, job.id, `Downloading Clip ${index + 1} of ${clips.length}`)

      const mediaUrl = clip.mediaUrls[0]
      const outPath = path.join(workDir, `clip-${clip.order}.mp4`)

      try {
        if (!mediaUrl) throw new HudlClipError('Hudl did not give PlayScout a playable file.')
        const cookieHeader = cookieHeaderFor(cookies, mediaUrl)
        await downloadHudlClip(mediaUrl, cookieHeader, outPath, userAgent)
        await importClip(supabase, job, clip, outPath)
        imported++
      } catch (err) {
        failed++
        // One bad clip does not sink a 50-clip import. The message is logged
        // with the URL redacted; the coach sees the count.
        const detail = err instanceof Error ? err.message : String(err)
        log(`job ${job.id}: clip ${clip.clipId} failed (${mediaUrlForLog(mediaUrl ?? '')})`, detail)
      } finally {
        await fs.unlink(outPath).catch(() => {})
      }

      await supabase
        .from('hudl_import_jobs')
        .update({
          clips_imported: imported,
          clips_failed: failed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)

      if (index < clips.length - 1) await sleep(CLIP_DELAY_MS)
    }

    const status = failed === 0 ? 'completed' : imported > 0 ? 'partial' : 'failed'
    await supabase
      .from('hudl_import_jobs')
      .update({
        status,
        current_step: status === 'completed' ? 'Complete' : 'Finished with problems',
        error_message:
          failed === 0
            ? null
            : `${failed} of ${clips.length} clips could not be downloaded from Hudl. The rest are in your film library.`,
        clips_imported: imported,
        clips_failed: failed,
        completed_at: new Date().toISOString(),
        locked_by: null,
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    log(`job ${job.id}: ${status} — ${imported} imported, ${failed} failed`)
  } finally {
    await session?.dispose()
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Turns any failure into something a coach can act on.
 *
 * The distinction that matters: a sign-in problem or an unreadable playlist
 * will fail identically on every retry, so retrying it just delays the message.
 * Only an unexpected error gets another attempt.
 */
async function failJob(supabase: SupabaseClient, job: ImportJob, err: unknown) {
  let coachMessage =
    'The Hudl import did not finish. Try it again, or paste your breakdown export instead.'
  let diagnostics: string[] | null = null
  let terminal = false

  if (err instanceof HudlSessionError) {
    coachMessage = err.coachMessage
    terminal = true
  } else if (err instanceof HudlPlaylistError) {
    coachMessage = err.coachMessage
    diagnostics = err.diagnostics
    terminal = true
  } else if (err instanceof HudlClipError) {
    coachMessage = err.coachMessage
  } else {
    // Only unexpected failures are worth Sentry, and only ever the message —
    // never the job row, which carries the source URL.
    Sentry.captureException(err)
  }

  const exhausted = terminal || job.attempts >= job.max_attempts
  await supabase
    .from('hudl_import_jobs')
    .update({
      status: exhausted ? 'failed' : 'retrying',
      error_message: coachMessage,
      diagnostics: diagnostics?.length ? { requestUrls: diagnostics } : null,
      current_step: null,
      locked_by: null,
      locked_at: null,
      completed_at: exhausted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)

  log(`job ${job.id} ${exhausted ? 'FAILED' : 'errored (will retry)'}: ${coachMessage}`)
  if (diagnostics?.length) log(`job ${job.id} captured ${diagnostics.length} request URLs`)
}

async function main() {
  const supabase = createServiceClient()
  log(`hudl import worker online — polling every ${POLL_INTERVAL_MS}ms`)

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      if (!shuttingDown) log(`${sig} received — finishing current job then exiting`)
      shuttingDown = true
    })
  }

  let pollCount = 0
  while (!shuttingDown) {
    pollCount++
    if (pollCount % REAP_EVERY_N_POLLS === 0) {
      await reapStuckJobs(supabase).catch((e) => log('reap error', e?.message ?? e))
    }

    let job: ImportJob | null = null
    try {
      job = await claimNextJob(supabase)
    } catch (err) {
      log('claim error', err instanceof Error ? err.message : err)
    }

    if (!job) {
      await sleep(POLL_INTERVAL_MS)
      continue
    }

    log(`claimed job ${job.id} (attempt ${job.attempts}/${job.max_attempts})`)
    try {
      await runImport(supabase, job)
    } catch (err) {
      await failJob(supabase, job, err).catch((e) => log('failJob error', e))
    }
  }

  log('hudl import worker stopped')
}

main().catch((err) => {
  log('fatal', err instanceof Error ? (err.stack ?? err.message) : err)
  process.exit(1)
})
