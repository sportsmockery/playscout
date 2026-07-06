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

function runFfmpeg(args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('FFmpeg timeout')) }, FFMPEG_TIMEOUT_MS)
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
