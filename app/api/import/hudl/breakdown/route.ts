import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireTeamMember, WRITE_ROLES } from '@/lib/auth/require-team-member'
import {
  parseHudlExport,
  matchBreakdownToSequences,
  toPlaySequenceFields,
  describeMatch,
} from '@/lib/import/hudl-breakdown'

export const runtime = 'nodejs'

/**
 * Attaches a coach's Hudl breakdown export to film already in the library.
 *
 * The film side needs no new machinery: a downloaded playlist is one file with
 * hard cuts between plays, and the video worker already scene-detects those
 * into play_sequences. What was missing was the tagging — down, distance,
 * formation, the call — which the staff recorded in Hudl and the modules were
 * left to infer off the film.
 *
 * `preview` is the default, deliberately. Rows are matched to clips by order,
 * and order goes wrong in ways only the coach can see (a play that wasn't
 * filmed, a camera cut that isn't a play). So the route shows the pairing and
 * waits to be told it is right.
 */
const BodySchema = z.object({
  videoId: z.string().uuid(),
  /** The pasted export — CSV from a file, or tab-separated from a spreadsheet copy. */
  text: z.string().min(1).max(2_000_000),
  /** Write the pairing. Omitted or false returns the preview and changes nothing. */
  apply: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const parsedBody = BodySchema.safeParse(await req.json())
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.issues[0]?.message ?? 'Bad request' }, { status: 400 })
  }
  const { videoId, text, apply } = parsedBody.data

  // The team comes from the video, never the request — the same rule the
  // playbook route follows, so a mismatched id can't attribute a write to a
  // team the caller cannot reach.
  const { data: video } = await supabase
    .from('videos')
    .select('id, team_id, title')
    .eq('id', videoId)
    .maybeSingle()
  if (!video) return NextResponse.json({ error: 'Film not found' }, { status: 404 })

  const access = await requireTeamMember(video.team_id, { writeRoles: WRITE_ROLES })
  if (access.error) return access.error

  const plays = parseHudlExport(text)
  if (!plays.length) {
    return NextResponse.json(
      {
        error:
          'No plays could be read from that. Paste the breakdown including its header row — the export from Hudl’s “Export Data”, or a copy straight out of the spreadsheet.',
      },
      { status: 422 }
    )
  }

  const { data: sequences } = await supabase
    .from('play_sequences')
    .select('id, sequence_number')
    .eq('video_id', videoId)
    .order('sequence_number', { ascending: true })

  if (!sequences?.length) {
    return NextResponse.json(
      {
        error:
          'This film has no plays marked yet. If it is a downloaded playlist, wait for processing to finish — the cuts between plays are detected automatically.',
      },
      { status: 409 }
    )
  }

  const match = matchBreakdownToSequences(plays, sequences)

  const preview = {
    videoTitle: video.title,
    rowsRead: plays.length,
    clipsInFilm: sequences.length,
    matched: match.matched.map((m) => ({
      sequenceId: m.sequenceId,
      sequenceNumber: m.sequenceNumber,
      summary: describeMatch(m.play),
    })),
    unmatchedRows: match.unmatchedRows.length,
    unmatchedClips: match.unmatchedSequences.map((s) => s.sequence_number),
  }

  if (!apply) return NextResponse.json({ applied: false, ...preview })

  // One update per play. The set is a game's worth of rows at most, and doing
  // it row-wise keeps a single bad row from failing the whole attach.
  const failures: number[] = []
  for (const m of match.matched) {
    const { error } = await supabase
      .from('play_sequences')
      .update(toPlaySequenceFields(m.play))
      .eq('id', m.sequenceId)
      .eq('video_id', videoId)
    if (error) {
      console.error('[hudl-import] failed to attach breakdown row', m.sequenceNumber, error.message)
      failures.push(m.sequenceNumber)
    }
  }

  return NextResponse.json({
    applied: true,
    ...preview,
    attached: match.matched.length - failures.length,
    failedClips: failures,
  })
}
