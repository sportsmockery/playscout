import { spawn } from 'node:child_process'
import { promises as fs, existsSync } from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegStatic: string | null = require('ffmpeg-static')

export const TARGET_WIDTH = 768
export const FFMPEG_TIMEOUT_MS = 120_000

// Mirrors lib/video/server-extract.ts so the worker resolves the same binary
// the Next app proved out, with a node_modules fallback.
function resolveFfmpegPath(): string {
  const exported = (ffmpegStatic as unknown as string) ?? ''
  const candidates = [
    exported,
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
  ].filter(Boolean)
  for (const c of candidates) {
    try { if (existsSync(c)) return c } catch { /* keep looking */ }
  }
  return exported || 'ffmpeg'
}

const ffmpegPath = resolveFfmpegPath()

type RunResult = { code: number | null; stderr: string }

function runFfmpeg(args: string[], timeoutMs: number = FFMPEG_TIMEOUT_MS): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('FFmpeg timeout')) }, timeoutMs)
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('close', (code) => { clearTimeout(timeout); resolve({ code, stderr }) })
    child.on('error', (err) => { clearTimeout(timeout); reject(err) })
  })
}

/**
 * Read a video's duration (seconds) by parsing ffmpeg's stderr. ffmpeg-static
 * ships ffmpeg but not ffprobe, so we invoke ffmpeg with no output — it exits
 * non-zero but still prints "Duration: HH:MM:SS.ss" to stderr.
 */
export async function probeDurationSeconds(videoPath: string): Promise<number | null> {
  const { stderr } = await runFfmpeg(['-i', videoPath])
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!m) return null
  const [, h, min, s] = m
  const seconds = Number(h) * 3600 + Number(min) * 60 + Number(s)
  return Number.isFinite(seconds) ? seconds : null
}

/** Extract a single JPEG frame at `atSeconds`, scaled to TARGET_WIDTH, to `outPath`. */
export async function extractFrameAt(videoPath: string, atSeconds: number, outPath: string): Promise<boolean> {
  // -ss before -i does a fast keyframe seek; accurate enough for evidence frames.
  const { code } = await runFfmpeg([
    '-ss', atSeconds.toFixed(3),
    '-i', videoPath,
    '-frames:v', '1',
    '-vf', `scale=${TARGET_WIDTH}:-2`,
    '-q:v', '3',
    '-y',
    outPath,
  ])
  return code === 0 && existsSync(outPath)
}

export interface ExtractedFrame {
  index: number
  timestampSeconds: number
  path: string
}

/**
 * Extract `count` evenly spaced frames across the whole video, matching the
 * proven browser algorithm: interval = duration / (count + 1), frame i at
 * interval * i. Returns only the frames that actually got written.
 */
export async function extractEvenlySpacedFrames(
  videoPath: string,
  durationSeconds: number,
  count: number,
  outDir: string,
): Promise<ExtractedFrame[]> {
  const interval = durationSeconds / (count + 1)
  const frames: ExtractedFrame[] = []
  for (let i = 1; i <= count; i++) {
    const t = interval * i
    const outPath = path.join(outDir, `frame-${String(i - 1).padStart(3, '0')}.jpg`)
    const ok = await extractFrameAt(videoPath, t, outPath)
    if (ok) frames.push({ index: i - 1, timestampSeconds: Number(t.toFixed(3)), path: outPath })
  }
  return frames
}

/** Ensure the working temp dir exists and is empty-ish; returns it. */
export async function ensureDir(dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true })
  return dir
}

// ── Scene-cut segmentation (edited/highlight video coverage fix) ──────────
//
// A highlight reel or any pre-edited film is a sequence of hard cuts between
// unrelated clips, not one continuous shot. Sampling N frames evenly across
// the WHOLE duration (extractEvenlySpacedFrames above) systematically misses
// most clips once there are more cuts than frames — verified on a real 4:41
// highlight tape: 16 evenly-spaced frames caught only 6 of 30 real cuts.
// This detects the actual cut points via ffmpeg's scene filter and extracts
// frames PER SEGMENT instead, so coverage scales with play count rather than
// video length.
//
// Deliberately NOT used for continuous, unedited game/practice footage —
// there are no hard cuts between plays there (huddles and dead time, not
// scene changes), so this filter would find ~0 cuts and callers should fall
// back to extractEvenlySpacedFrames. That's a materially different problem
// (motion-based play-burst detection) and out of scope here.

export const SCENE_CUT_THRESHOLD = 0.35
// A full decode pass to find cuts isn't worth attempting on long footage —
// above this duration we're almost certainly looking at continuous game
// film, which this technique doesn't apply to anyway (see note above).
export const SCENE_DETECTION_MAX_DURATION_SECONDS = 20 * 60
const SCENE_DETECTION_TIMEOUT_MS = 5 * 60_000

/** Timestamps (seconds) of detected hard cuts, in ascending order. */
export async function detectSceneCuts(
  videoPath: string,
  threshold: number = SCENE_CUT_THRESHOLD,
): Promise<number[]> {
  const { stderr } = await runFfmpeg(
    ['-i', videoPath, '-filter:v', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'],
    SCENE_DETECTION_TIMEOUT_MS,
  )
  const cuts: number[] = []
  const re = /pts_time:([0-9.]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stderr))) {
    const t = Number(m[1])
    if (Number.isFinite(t)) cuts.push(t)
  }
  return cuts.sort((a, b) => a - b)
}

export interface Segment {
  startSeconds: number
  endSeconds: number
}

/**
 * Turns cut timestamps into [start, end) segments spanning the full video,
 * merging any segment shorter than minSegmentSeconds into its neighbor —
 * sub-1.5s "cuts" are almost always flash/graphic-overlay artifacts in the
 * scene filter, not real play boundaries. Sorts defensively — detectSceneCuts
 * already returns sorted output, but this is a standalone pure function and
 * unsorted input would otherwise silently build corrupted (even negative-
 * length) segments rather than failing loudly.
 */
export function buildSegments(
  cuts: number[],
  durationSeconds: number,
  minSegmentSeconds = 1.5,
): Segment[] {
  const sortedCuts = [...cuts].sort((a, b) => a - b)
  const bounds = [0, ...sortedCuts.filter((c) => c > 0 && c < durationSeconds), durationSeconds]
  const raw: Segment[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    raw.push({ startSeconds: bounds[i], endSeconds: bounds[i + 1] })
  }

  const merged: Segment[] = []
  for (const seg of raw) {
    const length = seg.endSeconds - seg.startSeconds
    if (length < minSegmentSeconds && merged.length > 0) {
      merged[merged.length - 1].endSeconds = seg.endSeconds
    } else {
      merged.push({ ...seg })
    }
  }
  return merged
}

/**
 * Extracts framesPerSegment evenly-spaced frames within each segment (same
 * interval = length / (count + 1) formula as extractEvenlySpacedFrames, just
 * scoped to the segment instead of the whole video). Frame indices continue
 * globally across all segments starting at startIndex, so callers can mix
 * this with other extraction calls without index collisions.
 */
export async function extractFramesPerSegment(
  videoPath: string,
  segments: Segment[],
  framesPerSegment: number,
  outDir: string,
  startIndex = 0,
): Promise<ExtractedFrame[]> {
  const frames: ExtractedFrame[] = []
  let index = startIndex
  for (const seg of segments) {
    const length = seg.endSeconds - seg.startSeconds
    const interval = length / (framesPerSegment + 1)
    for (let i = 1; i <= framesPerSegment; i++) {
      const t = seg.startSeconds + interval * i
      const outPath = path.join(outDir, `frame-${String(index).padStart(3, '0')}.jpg`)
      const ok = await extractFrameAt(videoPath, t, outPath)
      if (ok) frames.push({ index, timestampSeconds: Number(t.toFixed(3)), path: outPath })
      index++
    }
  }
  return frames
}
