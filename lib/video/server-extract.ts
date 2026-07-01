import 'server-only'
import { spawn } from 'node:child_process'
import { promises as fs, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegStatic: string | null = require('ffmpeg-static')

export const FRAME_COUNT = 16
export const TARGET_WIDTH = 768
export const FFMPEG_TIMEOUT_MS = 120_000

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

type RunResult = { code: number | null; stdout: Buffer; stderr: string }

function runFfmpeg(args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdoutChunks: Buffer[] = []
    let stderr = ''
    const timeout = setTimeout(() => { child.kill(); reject(new Error('FFmpeg timeout')) }, FFMPEG_TIMEOUT_MS)
    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('close', (code) => { clearTimeout(timeout); resolve({ code, stdout: Buffer.concat(stdoutChunks), stderr }) })
    child.on('error', (err) => { clearTimeout(timeout); reject(err) })
  })
}

export async function extractFramesFromPath(videoPath: string, count = FRAME_COUNT): Promise<string[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'playscout-frames-'))
  try {
    const { stderr } = await runFfmpeg([
      '-i', videoPath,
      '-vf', `fps=1,scale=${TARGET_WIDTH}:-1,select='not(mod(n\\,1))'`,
      '-frames:v', String(count),
      '-q:v', '3',
      path.join(tmpDir, 'frame-%03d.jpg'),
    ])

    const files = (await fs.readdir(tmpDir)).filter(f => f.endsWith('.jpg')).sort()
    if (!files.length) throw new Error(`FFmpeg produced no frames. stderr: ${stderr.slice(-300)}`)

    const frames: string[] = []
    for (const f of files.slice(0, count)) {
      const buf = await fs.readFile(path.join(tmpDir, f))
      frames.push(`data:image/jpeg;base64,${buf.toString('base64')}`)
    }
    return frames
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

export async function extractFramesFromBuffer(buffer: Buffer, count = FRAME_COUNT): Promise<string[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'playscout-buf-'))
  const inputPath = path.join(tmpDir, 'input.mp4')
  try {
    await fs.writeFile(inputPath, buffer)
    return await extractFramesFromPath(inputPath, count)
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}
