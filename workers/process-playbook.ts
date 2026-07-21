/**
 * PlayScout playbook visual-analysis worker.
 *
 * Runs OUTSIDE Vercel (Railway per CLAUDE.md) — PDF rasterization and N
 * per-page vision calls are real work, same rationale as video processing
 * never running inside a Vercel function.
 *
 * Polls playbook_processing_jobs, claims one atomically, and for each page
 * of the uploaded PDF: rasterizes it, uploads the page image, and asks
 * Gemini to identify the play and produce a per-position assignment list
 * grounded in what's actually drawn. Non-PDF uploads (PPTX/DOCX/image) never
 * reach this worker — the upload route only queues a job for PDFs, since
 * there's no reliable page-image pipeline for the other formats yet.
 *
 * Run: `npm run worker:playbook`  (env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_API_KEY)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from './lib/service-client'
import { renderPdfPages } from './lib/pdf-render'
import { analyzeFramesWithGemini } from '../lib/ai/providers/google'
import { getRoute } from '../lib/ai/model-router'
import { recordUsage, hashCacheKey, getCachedResponse, setCachedResponse } from '../lib/ai/record-usage'
import {
  buildPlaybookPlaySystemPrompt,
  PLAYBOOK_PLAY_RESPONSE_SCHEMA,
  type PlaybookPlayResult,
  buildPageClassificationPrompt,
  PAGE_CLASSIFICATION_SCHEMA,
  type PageClassificationResult,
} from '../lib/intelligence/modules/playbook-play'

const WORKER_ID = process.env.WORKER_ID ?? 'playscout-playbook-worker-001'
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000)
const VISION_CONCURRENCY = Number(process.env.PLAYBOOK_VISION_CONCURRENCY ?? 4)
const CLAIMABLE_STATUSES = ['queued', 'retrying']

interface Job {
  id: string
  playbook_id: string
  team_id: string
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

async function setJobProgress(supabase: SupabaseClient, jobId: string, progress: number, currentStep: string) {
  await supabase
    .from('playbook_processing_jobs')
    .update({ progress, current_step: currentStep, updated_at: new Date().toISOString() })
    .eq('id', jobId)
  log(`job ${jobId}: ${progress}% — ${currentStep}`)
}

/** Same optimistic-claim pattern as process-video.ts's claimNextJob. */
async function claimNextJob(supabase: SupabaseClient): Promise<Job | null> {
  const { data: candidates } = await supabase
    .from('playbook_processing_jobs')
    .select('id, playbook_id, team_id, status, attempts, max_attempts')
    .in('status', CLAIMABLE_STATUSES)
    .order('created_at', { ascending: true })
    .limit(5)

  if (!candidates?.length) return null

  const now = new Date().toISOString()
  for (const c of candidates as Job[]) {
    const { data: claimed } = await supabase
      .from('playbook_processing_jobs')
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
      .select('id, playbook_id, team_id, status, attempts, max_attempts')
      .maybeSingle()

    if (claimed) return claimed as Job
  }
  return null
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (true) {
      const i = nextIndex++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

interface RenderedPageBuffer {
  pageNumber: number
  pngBytes: Buffer
}

async function processPage(
  supabase: SupabaseClient,
  job: Job,
  page: RenderedPageBuffer,
  ageGroup: string | undefined,
  offensiveStyle: string | undefined,
): Promise<void> {
  const imagePath = `${job.team_id}/${job.playbook_id}/pages/p${String(page.pageNumber).padStart(3, '0')}.png`

  const { error: uploadErr } = await supabase.storage
    .from('playbooks')
    .upload(imagePath, page.pngBytes, { contentType: 'image/png', upsert: true })
  if (uploadErr) throw new Error(`Page ${page.pageNumber} upload failed: ${uploadErr.message}`)

  const route = getRoute('frame_observation')
  const base64 = page.pngBytes.toString('base64')

  // Classify BEFORE spending a full assignment-extraction call: a formation
  // reference diagram (base alignment, numbering key) has no live
  // assignments to extract, so skip straight to a labeled row for it.
  let classification: PageClassificationResult
  try {
    const classifyHash = hashCacheKey('page_classification', buildPageClassificationPrompt(), [base64])
    const cachedClassification = await getCachedResponse<string>(supabase, classifyHash)
    let classifyJson: string
    if (cachedClassification != null) {
      classifyJson = cachedClassification
      await recordUsage(supabase, {
        teamId: job.team_id, userId: null, jobType: 'page_classification',
        provider: route.provider, model: route.model, inputTokens: 0, outputTokens: 0, cacheHit: true,
      })
    } else {
      const result = await analyzeFramesWithGemini(
        buildPageClassificationPrompt(),
        [base64],
        PAGE_CLASSIFICATION_SCHEMA,
        undefined,
        route.model,
        'image/png',
      )
      classifyJson = result.text
      await recordUsage(supabase, {
        teamId: job.team_id, userId: null, jobType: 'page_classification',
        provider: route.provider, model: route.model,
        inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
      })
      await setCachedResponse(supabase, classifyHash, 'page_classification', classifyJson)
    }
    classification = JSON.parse(classifyJson)
  } catch (err) {
    log(`page ${page.pageNumber}: classification failed, skipping`, err instanceof Error ? err.message : err)
    return
  }

  if (!classification.is_play_diagram) return

  if (classification.page_type === 'formation_reference') {
    const { error: insertErr } = await supabase.from('playbook_plays').insert({
      playbook_id: job.playbook_id,
      team_id: job.team_id,
      page_number: page.pageNumber,
      play_name: null,
      formation: null,
      image_path: imagePath,
      blocking_summary: 'Formation Reference — no live assignments',
      assignments: [],
      confidence: classification.confidence,
      page_type: 'formation_reference',
    })
    if (insertErr) throw new Error(`Page ${page.pageNumber} insert failed: ${insertErr.message}`)
    return
  }

  const systemPrompt = buildPlaybookPlaySystemPrompt({ ageGroup, offensiveStyle, pageNumber: page.pageNumber })

  let rawJson: string
  try {
    const extractHash = hashCacheKey('assignment_extraction', systemPrompt, [base64])
    const cachedExtraction = await getCachedResponse<string>(supabase, extractHash)
    if (cachedExtraction != null) {
      rawJson = cachedExtraction
      await recordUsage(supabase, {
        teamId: job.team_id, userId: null, jobType: 'assignment_extraction',
        provider: route.provider, model: route.model, inputTokens: 0, outputTokens: 0, cacheHit: true,
      })
    } else {
      const result = await analyzeFramesWithGemini(
        systemPrompt,
        [base64],
        PLAYBOOK_PLAY_RESPONSE_SCHEMA,
        undefined,
        route.model,
        'image/png',
      )
      rawJson = result.text
      await recordUsage(supabase, {
        teamId: job.team_id, userId: null, jobType: 'assignment_extraction',
        provider: route.provider, model: route.model,
        inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
      })
      await setCachedResponse(supabase, extractHash, 'assignment_extraction', rawJson)
    }
  } catch (err) {
    // One bad page shouldn't fail the whole playbook — log and skip it.
    log(`page ${page.pageNumber}: vision call failed, skipping`, err instanceof Error ? err.message : err)
    return
  }

  let parsed: PlaybookPlayResult
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    log(`page ${page.pageNumber}: invalid JSON from model, skipping`)
    return
  }

  if (!parsed.is_play_diagram) return

  const { error: insertErr } = await supabase.from('playbook_plays').insert({
    playbook_id: job.playbook_id,
    team_id: job.team_id,
    page_number: page.pageNumber,
    play_name: parsed.play_name,
    formation: parsed.formation,
    image_path: imagePath,
    blocking_summary: parsed.blocking_summary,
    assignments: parsed.assignments ?? [],
    confidence: parsed.confidence,
    page_type: 'live_play',
  })
  if (insertErr) throw new Error(`Page ${page.pageNumber} insert failed: ${insertErr.message}`)
}

async function runPipeline(supabase: SupabaseClient, job: Job) {
  // Global kill-switch — checked once per job, not once per page, since a
  // multi-hundred-page playbook shouldn't burn through its pages before
  // this flips true mid-run; the job just retries once the switch flips back.
  if (process.env.AI_GLOBAL_DISABLE === 'true') {
    throw new Error('AI features are globally disabled (AI_GLOBAL_DISABLE=true)')
  }

  await supabase.from('playbooks').update({ pages_status: 'processing', pages_error: null }).eq('id', job.playbook_id)

  const { data: playbook, error: pbErr } = await supabase
    .from('playbooks')
    .select('id, team_id, storage_path, file_type')
    .eq('id', job.playbook_id)
    .single()
  if (pbErr || !playbook) throw new Error(`Playbook ${job.playbook_id} not found`)
  if (playbook.file_type !== 'pdf') throw new Error(`Playbook is ${playbook.file_type}, not pdf — no page pipeline for this format`)
  if (!playbook.storage_path) throw new Error('Playbook has no storage_path')

  const { data: team } = await supabase
    .from('teams')
    .select('age_group, offensive_style')
    .eq('id', job.team_id)
    .maybeSingle()

  await setJobProgress(supabase, job.id, 5, 'Downloading playbook')
  const { data: signed, error: signErr } = await supabase.storage
    .from('playbooks')
    .createSignedUrl(playbook.storage_path, 60 * 60)
  if (signErr || !signed?.signedUrl) throw new Error(`Could not sign playbook URL: ${signErr?.message ?? 'unknown'}`)

  const res = await fetch(signed.signedUrl)
  if (!res.ok) throw new Error(`Playbook download failed: HTTP ${res.status}`)
  const pdfBytes = Buffer.from(await res.arrayBuffer())

  await setJobProgress(supabase, job.id, 15, 'Rendering pages')
  const pages: RenderedPageBuffer[] = []
  for await (const page of renderPdfPages(pdfBytes)) {
    pages.push({ pageNumber: page.pageNumber, pngBytes: page.pngBytes })
  }
  if (!pages.length) throw new Error('PDF has no pages')

  // Idempotent on retry: clear any plays/images from a previous attempt.
  await supabase.from('playbook_plays').delete().eq('playbook_id', job.playbook_id)

  await setJobProgress(supabase, job.id, 30, `Analyzing ${pages.length} pages`)
  let completed = 0
  await runWithConcurrency(pages, VISION_CONCURRENCY, async (page) => {
    await processPage(supabase, job, page, team?.age_group ?? undefined, team?.offensive_style ?? undefined)
    completed++
    const progress = 30 + Math.round((completed / pages.length) * 65)
    await setJobProgress(supabase, job.id, progress, `Analyzed ${completed}/${pages.length} pages`)
  })

  const { count: playCount } = await supabase
    .from('playbook_plays')
    .select('id', { count: 'exact', head: true })
    .eq('playbook_id', job.playbook_id)

  await supabase.from('playbooks').update({ pages_status: 'ready', pages_error: null }).eq('id', job.playbook_id)
  await supabase
    .from('playbook_processing_jobs')
    .update({
      status: 'completed',
      progress: 100,
      current_step: 'Ready',
      locked_by: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)

  log(`job ${job.id} complete — ${playCount ?? 0} plays identified from ${pages.length} pages`)
}

async function failJob(supabase: SupabaseClient, job: Job, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  const exhausted = job.attempts >= job.max_attempts
  const now = new Date().toISOString()

  await supabase
    .from('playbook_processing_jobs')
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
      .from('playbooks')
      .update({ pages_status: 'failed', pages_error: message.slice(0, 1000) })
      .eq('id', job.playbook_id)
  }

  log(`job ${job.id} ${exhausted ? 'FAILED (exhausted)' : 'errored (will retry)'}: ${message}`)
}

async function main() {
  const supabase = createServiceClient()
  log(`playbook worker online — polling every ${POLL_INTERVAL_MS}ms, vision concurrency ${VISION_CONCURRENCY}`)

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

    log(`claimed job ${job.id} (playbook ${job.playbook_id}, attempt ${job.attempts}/${job.max_attempts})`)
    try {
      await runPipeline(supabase, job)
    } catch (err) {
      await failJob(supabase, job, err).catch((e) => log('failJob error', e))
    }
  }

  log('playbook worker stopped')
  process.exit(0)
}

main().catch((err) => {
  log('fatal', err instanceof Error ? err.stack ?? err.message : err)
  process.exit(1)
})
