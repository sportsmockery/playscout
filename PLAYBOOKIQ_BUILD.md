# PlaybookIQ — Build Instructions for Claude

## What This Is

PlaybookIQ is a new intelligence module that lets coaches upload a playbook — PDF, PowerPoint (.pptx), Word (.docx), or image scans — and have the AI analyze it. The output is a structured report covering:

- **Strengths**: What is well-designed, age-appropriate, and sound
- **Weaknesses**: Gaps, over-complexity, missing assignments, coverage holes
- **IQ Module Opinions**: Each relevant IQ module (QBIQ, OLIQ, TeamIQ, MistakeIQ) comments on what the playbook reveals about that unit
- **Upgrade Recommendations**: Specific plays, formations, or concepts to add/remove
- **Complexity Score**: Is this playbook appropriate for the team's age group?
- **Practice Install Plan**: Which plays to install first and in what order

---

## Stack Decisions

- **File parsing**: Use `pdf-parse` for PDFs, `mammoth` for .docx, `pptx-extractor` or slide-by-slide image conversion for .pptx
- **Image pages/slides**: Extract as base64 JPEGs and send to Gemini 2.5 Pro for visual reading (same frame pipeline as video analysis)
- **Text content**: Send to Claude Opus 4.5 for deep analysis (longer context, better reasoning)
- **Hybrid**: When a file has both text and diagrams, split — text → Claude, diagrams → Gemini, merge results
- **Storage**: Upload originals to Supabase Storage bucket `playbooks`
- **DB**: New table `playbook_analyses` (see schema below)

---

## New Dependencies to Install

```bash
npm install pdf-parse mammoth @types/pdf-parse
```

For .pptx: use `pptx2json` or convert slides to images server-side via LibreOffice/ImageMagick if available, otherwise extract embedded text only.

```bash
npm install pptx2json
```

---

## Database — New Migration

Create `supabase/migrations/006_playbookiq.sql`:

```sql
-- Playbook uploads
CREATE TABLE playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'pptx', 'docx', 'image')),
  storage_path TEXT,
  page_count INTEGER,
  extracted_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analysis results
CREATE TABLE playbook_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  overall_score INTEGER CHECK (overall_score BETWEEN 0 AND 100),
  complexity_score INTEGER CHECK (complexity_score BETWEEN 0 AND 100),
  age_appropriate BOOLEAN,
  strengths JSONB DEFAULT '[]',
  weaknesses JSONB DEFAULT '[]',
  qbiq_notes TEXT,
  oliq_notes TEXT,
  teamiq_notes TEXT,
  mistakeiq_notes TEXT,
  upgrade_recommendations JSONB DEFAULT '[]',
  plays_to_keep JSONB DEFAULT '[]',
  plays_to_remove JSONB DEFAULT '[]',
  install_order JSONB DEFAULT '[]',
  summary TEXT,
  model_provider TEXT,
  model_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE playbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_members_playbooks" ON playbooks
  FOR ALL USING (
    team_id IN (
      SELECT t.id FROM teams t
      JOIN organization_members om ON om.organization_id = t.organization_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "team_members_playbook_analyses" ON playbook_analyses
  FOR ALL USING (
    team_id IN (
      SELECT t.id FROM teams t
      JOIN organization_members om ON om.organization_id = t.organization_id
      WHERE om.user_id = auth.uid()
    )
  );
```

Add to `supabase/migrations/003_storage.sql` or create `supabase/migrations/007_storage_playbooks.sql`:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'playbooks',
  'playbooks',
  false,
  52428800, -- 50MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ]
);

CREATE POLICY "auth_playbooks_storage" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'playbooks')
  WITH CHECK (bucket_id = 'playbooks');
```

---

## New Types — Add to `lib/db/types.ts`

```ts
export interface Playbook {
  id: string
  team_id: string
  uploaded_by?: string | null
  title: string
  file_type: 'pdf' | 'pptx' | 'docx' | 'image'
  storage_path?: string | null
  page_count?: number | null
  extracted_text?: string | null
  created_at: string
}

export interface PlaybookAnalysis {
  id: string
  playbook_id: string
  team_id: string
  overall_score?: number | null
  complexity_score?: number | null
  age_appropriate?: boolean | null
  strengths?: string[] | null
  weaknesses?: string[] | null
  qbiq_notes?: string | null
  oliq_notes?: string | null
  teamiq_notes?: string | null
  mistakeiq_notes?: string | null
  upgrade_recommendations?: PlaybookRecommendation[] | null
  plays_to_keep?: string[] | null
  plays_to_remove?: string[] | null
  install_order?: PlaybookInstallStep[] | null
  summary?: string | null
  model_provider?: string | null
  model_name?: string | null
  created_at: string
}

export interface PlaybookRecommendation {
  title: string
  reason: string
  priority: 'high' | 'medium' | 'low'
  module: 'QBIQ' | 'OLIQ' | 'TeamIQ' | 'MistakeIQ' | 'General'
}

export interface PlaybookInstallStep {
  week: number
  play: string
  reason: string
}
```

---

## New Queries — Add to `lib/db/queries.ts`

```ts
export async function getPlaybooksByTeam(teamId: string): Promise<Playbook[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('playbooks')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function getPlaybookAnalyses(playbookId: string): Promise<PlaybookAnalysis[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('playbook_analyses')
    .select('*')
    .eq('playbook_id', playbookId)
    .order('created_at', { ascending: false })
  return data ?? []
}
```

---

## New Intelligence Module — `lib/intelligence/modules/playbookiq.ts`

```ts
import { FOOTBALL_BRAIN_SYSTEM } from '../football-brain'

interface PlaybookIQInput {
  extractedText: string
  teamName?: string
  ageGroup?: string
  offensiveStyle?: string
  defensiveStyle?: string
  pageCount?: number
  hasVisualDiagrams?: boolean
}

export function buildPlaybookIQPrompt(input: PlaybookIQInput): string {
  const { extractedText, teamName, ageGroup, offensiveStyle, defensiveStyle, pageCount } = input

  return `${FOOTBALL_BRAIN_SYSTEM}

You are PlaybookIQ — an expert football playbook analyst.

${teamName ? `TEAM: ${teamName}` : ''}
${ageGroup ? `AGE GROUP: ${ageGroup} — calibrate ALL feedback to this age/level. Penalize over-complexity heavily for young players.` : ''}
${offensiveStyle ? `OFFENSIVE SCHEME: ${offensiveStyle}` : ''}
${defensiveStyle ? `DEFENSIVE SCHEME: ${defensiveStyle}` : ''}
${pageCount ? `PLAYBOOK LENGTH: ${pageCount} pages` : ''}

PLAYBOOK CONTENT:
${extractedText.slice(0, 40000)}

---

ANALYSIS RUBRIC:

1. OVERALL SCORE (0-100): How complete, sound, and well-structured is this playbook overall?

2. COMPLEXITY SCORE (0-100): How complex is this playbook relative to the team's age group?
   - For 6U-10U: 40+ = too complex, penalize hard
   - For 11U-14U: 65+ = too complex
   - For JV/Varsity: higher complexity acceptable

3. AGE APPROPRIATE (true/false): Is this playbook safe and appropriate for the stated age group?

4. STRENGTHS: What is well-designed? Look for:
   - Clear assignment language
   - Age-appropriate play count
   - Sound blocking schemes
   - Good formation variety
   - Safety-conscious technique descriptions
   - Logical progression from base plays to complementary plays

5. WEAKNESSES: What is missing or problematic? Look for:
   - Too many plays for age group (youth should have ≤15 core plays)
   - Missing blocking assignments
   - Overly complex motion/shift packages for young players
   - No special teams section
   - Missing protection adjustments
   - Plays that require NFL-level athleticism

6. IQ MODULE OPINIONS:
   - QBIQ NOTES: What does the playbook demand of the QB? Is it appropriate?
   - OLIQ NOTES: Are blocking assignments clear, correct, and teachable?
   - TEAMIQ NOTES: Is the scheme identity consistent? Does play selection support tendencies?
   - MISTAKEIQ NOTES: Are there plays with high turnover/penalty risk baked in?

7. UPGRADE RECOMMENDATIONS: List specific additions or removals with priority and reasoning.

8. PLAYS TO KEEP: Name specific plays or formations that are strong. Use names from the playbook.

9. PLAYS TO REMOVE: Name specific plays that should be cut, with reason.

10. INSTALL ORDER: Suggest a weekly install sequence (week 1, 2, 3...) prioritizing base plays first.

RULES:
- Never invent plays that aren't in the text. Reference only what is actually present.
- If a section is missing from the playbook, note it as a weakness.
- Use coachable language. No jargon coaches won't recognize.
- For youth football: always prioritize safety over scheme complexity.

Return ONLY valid JSON matching the response schema.`
}

export const PLAYBOOKIQ_CLAUDE_SCHEMA = `{
  "overall_score": <integer 0-100>,
  "complexity_score": <integer 0-100>,
  "age_appropriate": <boolean>,
  "strengths": ["<string>", ...],
  "weaknesses": ["<string>", ...],
  "qbiq_notes": "<string>",
  "oliq_notes": "<string>",
  "teamiq_notes": "<string>",
  "mistakeiq_notes": "<string>",
  "upgrade_recommendations": [
    { "title": "<string>", "reason": "<string>", "priority": "high|medium|low", "module": "QBIQ|OLIQ|TeamIQ|MistakeIQ|General" }
  ],
  "plays_to_keep": ["<string>", ...],
  "plays_to_remove": ["<string>", ...],
  "install_order": [
    { "week": <integer>, "play": "<string>", "reason": "<string>" }
  ],
  "summary": "<2-3 sentence executive summary for the coach>"
}`
```

---

## New API Route — `app/api/playbookiq/analyze/route.ts`

```ts
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callClaude, CLAUDE_OPUS } from '@/lib/ai/providers/anthropic'
import { buildPlaybookIQPrompt, PLAYBOOKIQ_CLAUDE_SCHEMA } from '@/lib/intelligence/modules/playbookiq'
import { extractPlaybookText } from '@/lib/playbook/extract'

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

  if (!extractedText || extractedText.length < 50) {
    return new NextResponse('Could not extract text from playbook', { status: 422 })
  }

  const systemPrompt = buildPlaybookIQPrompt({
    extractedText,
    teamName,
    ageGroup,
    offensiveStyle,
    defensiveStyle,
    pageCount: playbook.page_count ?? undefined,
  })

  // Use Claude Opus for deep document analysis
  const rawJson = await callClaude(
    CLAUDE_OPUS,
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
      model_name: CLAUDE_OPUS,
    })
    .select()
    .single()

  if (insertErr) return new NextResponse(insertErr.message, { status: 500 })

  return NextResponse.json({ analysis })
}
```

---

## File Extraction Utility — `lib/playbook/extract.ts`

```ts
import 'server-only'

export async function extractPlaybookText(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  if (fileType === 'pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse')
    const result = await pdfParse(buffer)
    return result.text ?? ''
  }

  if (fileType === 'docx') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value ?? ''
  }

  if (fileType === 'pptx') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pptx2json = require('pptx2json')
      const json = await pptx2json(buffer)
      // Flatten all slide text
      const lines: string[] = []
      for (const slide of (json.slides ?? [])) {
        for (const shape of (slide.shapes ?? [])) {
          if (shape.text) lines.push(shape.text)
        }
      }
      return lines.join('\n')
    } catch {
      return '[PPTX text extraction failed — visual analysis only]'
    }
  }

  return ''
}
```

**Add to `next.config.ts` serverExternalPackages:**
```ts
serverExternalPackages: ['ffmpeg-static', 'fluent-ffmpeg', 'pdf-parse', 'mammoth', 'pptx2json']
```

---

## Upload API Route — `app/api/playbookiq/upload/route.ts`

```ts
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractPlaybookText } from '@/lib/playbook/extract'

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

  // Count pages (rough estimate for PDFs)
  const pageCountMatch = extractedText.match(/\f/g) // form feed = page break in pdf-parse output
  const pageCount = fileType === 'pdf' ? (pageCountMatch?.length ?? 1) + 1 : null

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
```

---

## Page — `app/(app)/teams/[teamId]/modules/playbookiq/page.tsx`

Server component. Loads team + existing playbooks + analyses, renders `PlaybookIQClient`.

```ts
import { getTeamById, getPlaybooksByTeam } from '@/lib/db/queries'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, BookOpen } from 'lucide-react'
import PlaybookIQClient from './PlaybookIQClient'

export async function generateMetadata({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const team = await getTeamById(teamId)
  return { title: `PlaybookIQ — ${team?.name ?? 'Team'}` }
}

export default async function PlaybookIQPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const [team, playbooks] = await Promise.all([
    getTeamById(teamId),
    getPlaybooksByTeam(teamId),
  ])
  if (!team) notFound()

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href={`/teams/${teamId}/intelligence`}
        className="flex items-center gap-1.5 text-sm text-[var(--brand-muted)] hover:text-[var(--brand-navy)] mb-2">
        <ArrowLeft size={15} /> Intelligence
      </Link>
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
          <BookOpen size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand-navy)]">PlaybookIQ</h1>
          <p className="text-[var(--brand-muted)] text-sm">Playbook Analysis Module</p>
        </div>
      </div>
      <PlaybookIQClient
        teamId={teamId}
        teamName={team.name}
        ageGroup={team.age_group ?? undefined}
        offensiveStyle={team.offensive_style ?? undefined}
        defensiveStyle={team.defensive_style ?? undefined}
        existingPlaybooks={playbooks}
      />
    </div>
  )
}
```

---

## Client Component — `app/(app)/teams/[teamId]/modules/playbookiq/PlaybookIQClient.tsx`

Key behaviors:
- Upload panel: drag-drop or click, accepts PDF/PPTX/DOCX/images, shows file type icon, calls `/api/playbookiq/upload`
- After upload, auto-triggers `/api/playbookiq/analyze` with team context
- While analyzing: show loading state with "Reading playbook..." → "Consulting QBIQ..." → "Writing report..."
- Result panel layout:
  - Top: Overall Score ring + Complexity Score ring + Age Appropriate badge (green/red)
  - Summary paragraph
  - Two columns: Strengths (green bullets) / Weaknesses (red bullets)
  - Four IQ Module cards: QBIQ Notes / OLIQ Notes / TeamIQ Notes / MistakeIQ Notes — each collapsible
  - Upgrade Recommendations table: priority chip, title, reason, module tag
  - Plays to Keep (green tags) / Plays to Remove (red tags with strikethrough)
  - Install Order: week-by-week timeline cards
- Past playbooks list: show previous uploads with their analysis scores, clickable to reload

Follow the same pattern as `QBIQClient.tsx` — config panel on left (1/3), results on right (2/3).

---

## Sidebar Navigation — Update `components/dashboard/Sidebar.tsx`

Add PlaybookIQ to the MODULE_ITEMS array:

```ts
import { BookOpen } from 'lucide-react'

// In MODULE_ITEMS array, add:
{ label: 'PlaybookIQ', href: '/intelligence/playbookiq', icon: BookOpen },

// In teamModuleItems mapping, it will become:
// /teams/${teamId}/modules/playbookiq
```

---

## Add to Intelligence Hub — Update `app/(app)/teams/[teamId]/intelligence/page.tsx`

Add to the MODULES array:

```ts
{
  name: 'PlaybookIQ',
  label: 'Playbook Analysis',
  icon: BookOpen,
  color: 'text-indigo-600',
  bg: 'bg-indigo-50',
  desc: 'Upload your playbook. Get strengths, weaknesses, upgrade recommendations, and an install plan.',
  href: (id: string) => `/teams/${id}/modules/playbookiq`,
},
```

---

## Build Order

1. Run migration `006_playbookiq.sql` + `007_storage_playbooks.sql` via Supabase MCP
2. Install deps: `npm install pdf-parse mammoth pptx2json @types/pdf-parse`
3. Add types to `lib/db/types.ts`
4. Add queries to `lib/db/queries.ts`
5. Create `lib/playbook/extract.ts`
6. Create `lib/intelligence/modules/playbookiq.ts`
7. Create `app/api/playbookiq/upload/route.ts`
8. Create `app/api/playbookiq/analyze/route.ts`
9. Create `app/(app)/teams/[teamId]/modules/playbookiq/page.tsx`
10. Create `app/(app)/teams/[teamId]/modules/playbookiq/PlaybookIQClient.tsx`
11. Update `components/dashboard/Sidebar.tsx` — add PlaybookIQ to MODULE_ITEMS
12. Update `app/(app)/teams/[teamId]/intelligence/page.tsx` — add PlaybookIQ card
13. Update `next.config.ts` — add pdf-parse, mammoth, pptx2json to serverExternalPackages
14. Run `npm run build` — must pass clean
15. Run `npm run build-deploy`

---

## Critical Rules

- `pdf-parse`, `mammoth`, `pptx2json` are Node.js only — all files that import them must have `import 'server-only'` at the top
- The analyze route uses `CLAUDE_OPUS` (claude-opus-4-5) — playbook analysis is deep document work, not quick Q&A
- Extracted text is cached in `playbooks.extracted_text` — never re-extract if it already exists
- Max text sent to Claude: 40,000 chars (slice in prompt builder)
- Strip ```json ... ``` wrappers from Claude response before JSON.parse
- The upload route uses `multipart/form-data` — the client must send `FormData`, not JSON
- Complexity score is inverted from what you might expect: HIGH complexity score = TOO complex. Flag anything over 60 for youth teams as a warning.
