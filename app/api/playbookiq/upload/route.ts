import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractPlaybookText, getPdfPageCount } from '@/lib/playbook/extract'

export const runtime = 'nodejs'
export const maxDuration = 60

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'image',
  'image/png': 'image',
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return new NextResponse('Unauthorized', { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const teamId = formData.get('teamId') as string
  const title = formData.get('title') as string

  if (!file || !teamId) return new NextResponse('file and teamId required', { status: 400 })

  const fileType = ALLOWED_TYPES[file.type]
  if (!fileType) return new NextResponse(`Unsupported file type: ${file.type}`, { status: 415 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const storagePath = `${teamId}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`

  // Upload to Supabase Storage
  const { error: uploadErr } = await supabase.storage
    .from('playbooks')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) return new NextResponse(uploadErr.message, { status: 500 })

  // Extract text immediately
  const extractedText = await extractPlaybookText(buffer, fileType)
  const pageCount = fileType === 'pdf' ? await getPdfPageCount(buffer) : null

  // Save record
  const { data: playbook, error: insertErr } = await supabase
    .from('playbooks')
    .insert({
      team_id: teamId,
      uploaded_by: user.id,
      title: title || file.name,
      file_type: fileType,
      storage_path: storagePath,
      page_count: pageCount,
      extracted_text: extractedText || null,
    })
    .select()
    .single()

  if (insertErr) return new NextResponse(insertErr.message, { status: 500 })

  return NextResponse.json({ playbook })
}
