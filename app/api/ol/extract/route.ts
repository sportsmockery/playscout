import { NextRequest, NextResponse } from 'next/server'
import { extractFramesFromBuffer, FRAME_COUNT } from '@/lib/video/server-extract'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const frames = await extractFramesFromBuffer(buffer, FRAME_COUNT)
    return NextResponse.json({ frames, count: frames.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
