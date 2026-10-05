import { spawn } from 'node:child_process'
import { promises as fs, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Full-resolution stills from the start of a clip, plus zoomed crops of the
 * middle of the frame, for the ScoutIQ possession check.
 *
 * Gemini reads video at a fixed, reduced resolution per frame. On wide
 * sideline film a youth player is a few dozen pixels tall, and at that size
 * black and white jerseys were confused on most plays of a whole game — while
 * a person looking at the same picture can tell them apart at a glance. A
 * still at the source's own resolution, and an enlarged crop of where the
 * line of scrimmage usually sits (the camera follows the ball), give the
 * model the pixels a person is using.
 *
 * Best-effort: any failure returns [] and the check falls back to the video.
 */

export interface Still {
  label: string
  base64: string
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegStatic: string | null = (() => { try { return require('ffmpeg-static') } catch { return null } })()

function resolveFfmpegPath(): string {
  const candidates = [
    (ffmpegStatic as unknown as string) ?? '',
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
  ].filter(Boolean)
  for (const c of candidates) {
    try { if (existsSync(c)) return c } catch { /* keep looking */ }
  }
  // Same fallback as workers/lib/ffmpeg.ts: a system ffmpeg on PATH.
  return 'ffmpeg'
}

function run(bin: string, args: string[], timeoutMs = 30_000): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'ignore'] })
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(null) }, timeoutMs)
    child.on('close', (code) => { clearTimeout(timer); resolve(code) })
    child.on('error', () => { clearTimeout(timer); resolve(null) })
  })
}

/** Seconds into the read window at which the stills are taken: pre-snap, and just after. */
export const STILL_OFFSETS = [0.3, 1.2, 2.2]

export async function extractPresnapStills(bytes: Buffer, startSeconds = 0): Promise<Still[]> {
  const bin = resolveFfmpegPath()
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presnap-'))
  const input = path.join(dir, 'clip.mp4')
  try {
    await fs.writeFile(input, bytes)
    const stills: Still[] = []
    for (const [i, offset] of STILL_OFFSETS.entries()) {
      const t = (startSeconds + offset).toFixed(2)
      const full = path.join(dir, `full${i}.jpg`)
      const zoom = path.join(dir, `zoom${i}.jpg`)
      // Native resolution, capped at 1920 wide so a 4K upload stays a sane size.
      const fullOk = await run(bin, ['-y', '-ss', t, '-i', input, '-frames:v', '1', '-vf', "scale='min(1920,iw)':-2", '-q:v', '2', full])
      if (fullOk === 0 && existsSync(full)) {
        stills.push({ label: `STILL ${i + 1} — full frame at +${offset}s`, base64: (await fs.readFile(full)).toString('base64') })
      }
      // The middle of the field, enlarged 2x: the camera follows the ball, so
      // the line of scrimmage is almost always here.
      const zoomOk = await run(bin, ['-y', '-ss', t, '-i', input, '-frames:v', '1', '-vf', 'crop=iw*0.55:ih*0.6:iw*0.225:ih*0.2,scale=iw*2:-2', '-q:v', '2', zoom])
      if (zoomOk === 0 && existsSync(zoom)) {
        stills.push({ label: `STILL ${i + 1} — ZOOMED 2x on the middle of the field at +${offset}s`, base64: (await fs.readFile(zoom)).toString('base64') })
      }
    }
    return stills
  } catch {
    return []
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
