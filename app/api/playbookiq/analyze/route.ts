import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/ai/providers/anthropic'
import { buildPlaybookIQPrompt, PLAYBOOKIQ_CLAUDE_SCHEMA } from '@/lib/intelligence/modules/playbookiq'
import { extractPlaybookText, isPlaybookTextUsable } from '@/lib/playbook/extract'
import { getRoute } from '@/lib/ai/model-router'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return new NextResponse('Unauthorized', { status: 401 })

  const body = await req.json()
  const { playbookId, teamId, teamName, ageGroup, offensiveStyle, defensiveStyle } = body

  // Load playbook record
  const { data: playbook, error: pbErr } = await supabase
    .from('playbooks')
    .select('*')
    .eq('id', playbookId)
    .single()

  if (pbErr || !playbook) return new NextResponse('Playbook not found', { status: 404 })

  // Use pre-extracted text OR re-extract from storage
  let extractedText = playbook.extracted_text ?? ''
  if (!extractedText && playbook.storage_path) {
    const { data: fileData } = await supabase.storage
      .from('playbooks')
      .download(playbook.storage_path)
    if (fileData) {
      const buffer = Buffer.from(await fileData.arrayBuffer())
      extractedText = await extractPlaybookText(buffer, playbook.file_type)
      // Cache it
      await supabase
        .from('playbooks')
        .update({ extracted_text: extractedText })
        .eq('id', playbookId)
    }
  }

  if (!isPlaybookTextUsable(extractedText)) {
    // Distinguish "nothing came out" (scanned/image-only PDF) from "mostly
    // symbol-font noise came out" (Wingdings-style PPTX bullets) so the
    // coach gets an actionable message instead of a report built on
    // garbage text echoed back as if it were real playbook content.
    const message = extractedText.length < 50
      ? 'Could not extract readable text from this playbook. If it’s a scanned or image-based PDF, try uploading a text-based export instead.'
      : 'The text extracted from this playbook looks garbled (often caused by a symbol/dingbat font in a PowerPoint export). Try re-saving it as a PDF and uploading that instead.'
    return new NextResponse(message, { status: 422 })
  }

  const systemPrompt = buildPlaybookIQPrompt({
    extractedText,
    teamName,
    ageGroup,
    offensiveStyle,
    defensiveStyle,
    pageCount: playbook.page_count ?? undefined,
  })

  // Deep document analysis — routed through model-router.ts's job-type
  // mapping rather than hardcoding a model here.
  const route = getRoute('deep_analysis')
  const rawJson = await callClaude(
    route.model,
    systemPrompt,
    [{ role: 'user', content: `Analyze this playbook. Return JSON matching this schema:\n${PLAYBOOKIQ_CLAUDE_SCHEMA}` }],
    4096
  )

  let result: Record<string, unknown>
  try {
    // Claude sometimes wraps in ```json ... ``` — strip it
    const cleaned = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    result = JSON.parse(cleaned)
  } catch {
    return new NextResponse(`Invalid JSON from model: ${rawJson.slice(0, 300)}`, { status: 500 })
  }

  // Save to DB
  const { data: analysis, error: insertErr } = await supabase
    .from('playbook_analyses')
    .insert({
      playbook_id: playbookId,
      team_id: teamId,
      overall_score: result.overall_score,
      complexity_score: result.complexity_score,
      age_appropriate: result.age_appropriate,
      strengths: result.strengths,
      weaknesses: result.weaknesses,
      qbiq_notes: result.qbiq_notes,
      oliq_notes: result.oliq_notes,
      teamiq_notes: result.teamiq_notes,
      mistakeiq_notes: result.mistakeiq_notes,
      upgrade_recommendations: result.upgrade_recommendations,
      plays_to_keep: result.plays_to_keep,
      plays_to_remove: result.plays_to_remove,
      install_order: result.install_order,
      summary: result.summary,
      model_provider: 'anthropic',
      model_name: route.model,
    })
    .select()
    .single()

  if (insertErr) return new NextResponse(insertErr.message, { status: 500 })

  // Best-effort link to whatever plays already exist for this playbook —
  // often none yet, since the visual per-play pipeline runs in the
  // background and usually finishes after this text-based pass. The plays
  // GET route backfills this once that pipeline reaches 'ready'.
  const { data: existingPlays } = await supabase
    .from('playbook_plays')
    .select('id')
    .eq('playbook_id', playbookId)
  if (existingPlays?.length) {
    await supabase
      .from('playbook_analyses')
      .update({ covered_play_ids: existingPlays.map((p) => p.id) })
      .eq('id', analysis.id)
    analysis.covered_play_ids = existingPlays.map((p) => p.id)
  }

  return NextResponse.json({ analysis })
}
