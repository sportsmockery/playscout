# PlayScoutIQ — Intelligence Assistant Spec

## Two-System Architecture

### System B — VideoIQ Engine (evidence layer)
Breaks video into frames, analyzes football, saves structured results to DB.
Never converses. Only produces evidence.

### System A — PlayScoutIQ Assistant (intelligence layer)
Reads System B's saved output. Converses with coaches.
Never watches video directly. Only reasons over proven evidence.

This separation is intentional and critical:
- B provides ground truth from film
- A provides interpretation, strategy, and memory
- A must always cite B's evidence — never invent football claims

---

## System B — VideoIQ Engine

### What it does
1. Receives a video clip or play sequence
2. Extracts 16 evenly spaced frames at 768px wide (JPEG/base64)
3. Routes frames to the correct intelligence module
4. Enforces structured JSON output via response schema
5. Saves results to `position_analysis_results`, `mistake_events`, `team_tendencies`
6. Updates `team_memory` with embeddings for A to query later

### Model: Gemini 2.5 Pro
Reason: best multimodal model for frame analysis, supports response schema enforcement,
handles 16 JPEG frames per call, already proven in QBIQ/OLIQ implementation.
Fallback: GPT-4o (vision) if Gemini unavailable.

### API route
```
POST /api/intelligence/analyze
```

### Input schema
```typescript
interface VideoIQInput {
  moduleKey: 'QBIQ' | 'OLIQ' | 'TEAMIQ' | 'MISTAKEIQ';
  frames: string[];           // base64 JPEG data URLs, 16 frames
  teamId: string;
  playerId?: string;
  videoId?: string;
  playSequenceId?: string;
  player?: {
    name?: string;
    position?: string;
    jersey_number?: string;
    age_group?: string;
    notes?: string;
  };
  team?: {
    name?: string;
    age_group?: string;
    season?: string;
    offensive_style?: string;
    defensive_style?: string;
  };
  playSequence?: {
    down?: number;
    distance?: number;
    yard_line?: string;
    coach_label?: string;
  };
  coachNote?: string;
  pdf?: { name?: string; data: string };
}
```

### Output schema (enforced via Gemini response schema)
```typescript
interface VideoIQResult {
  overall_score: number;          // 0–100
  position_scores: Record<string, number>;
  reasoning: Record<string, string>;
  strengths: string[];
  weaknesses: string[];
  drills: string[];
  summary: string;
  confidence: number;             // 0.0–1.0
  evidence_frames: number[];      // which frame indices support conclusions
  model: string;
  framesAnalyzed: number;
}
```

### After saving results — generate team memory embedding
```typescript
// lib/intelligence/memory.ts
async function saveToTeamMemory(
  teamId: string,
  result: VideoIQResult,
  context: { moduleKey: string; playSequence?: object; player?: object }
) {
  // 1. Build a natural language summary of the result
  const content = buildMemorySummary(result, context);

  // 2. Generate embedding via OpenAI text-embedding-3-small
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: content,
  });

  // 3. Save to team_memory table with pgvector embedding
  await supabase.from('team_memory').insert({
    team_id: teamId,
    memory_type: context.moduleKey,
    title: `${context.moduleKey} — ${context.player?.name ?? 'Team'} — ${new Date().toLocaleDateString()}`,
    content,
    source: 'video_analysis',
    embedding: embedding.data[0].embedding,
    confidence: result.confidence,
  });
}
```

### System B anti-hallucination rules (enforce in every prompt)
1. Never invent jersey numbers, player names, scores, or stats
2. Separate observation from interpretation
3. Use confidence scores (0.0–1.0)
4. Identify which frame indices support each conclusion
5. If the subject is unclear in the frames, say so explicitly
6. Grade against age-appropriate fundamentals only (9U–10U focus)
7. Never claim certainty when visual evidence is limited

---

## System A — PlayScoutIQ Assistant

### What it does
- Answers coach questions in natural language
- Recommends practice plans based on film evidence
- Explains what tendencies and mistakes mean
- Suggests game-week strategy
- Builds on team memory over time
- Cites specific analysis results when making claims
- Escalates to Perplexity for rules/football knowledge questions

### Model routing
```typescript
// lib/ai/playscoutiq-router.ts

type PlayScoutIQJobType =
  | 'quick_question'      // short coach Q&A
  | 'deep_analysis'       // multi-game trend reasoning
  | 'practice_plan'       // generate weekly practice plan
  | 'game_strategy'       // pre-game opponent recommendations
  | 'football_knowledge'  // rules, formations, public football context
  | 'onboarding';         // guide new coach through setup

const PLAYSCOUTIQ_ROUTES: Record<PlayScoutIQJobType, { provider: string; model: string }> = {
  quick_question:    { provider: 'anthropic', model: 'claude-sonnet-4-5' },
  deep_analysis:     { provider: 'anthropic', model: 'claude-opus-4' },
  practice_plan:     { provider: 'anthropic', model: 'claude-opus-4' },
  game_strategy:     { provider: 'anthropic', model: 'claude-opus-4' },
  football_knowledge: { provider: 'perplexity', model: 'sonar-pro' },
  onboarding:        { provider: 'anthropic', model: 'claude-sonnet-4-5' },
};
```

### Context A receives on every message
```typescript
interface PlayScoutIQContext {
  // Identity
  teamId: string;
  team: {
    name: string;
    age_group: string;
    season?: string;
    offensive_style?: string;
    defensive_style?: string;
  };

  // Recent analysis results (last 10, from position_analysis_results)
  recentAnalysis: Array<{
    moduleKey: string;
    overall_score: number;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    drills: string[];
    created_at: string;
    player?: { name: string; position: string };
  }>;

  // Team tendencies (from team_tendencies)
  tendencies: Array<{
    tendency_type: string;
    label: string;
    value: object;
    sample_size: number;
    confidence: number;
  }>;

  // Recent mistakes (from mistake_events, severity >= moderate)
  mistakes: Array<{
    title: string;
    severity: string;
    category: string;
    description: string;
    correction: string;
    confidence: number;
  }>;

  // Relevant team memory (RAG — top 5 by cosine similarity to current question)
  relevantMemory: Array<{
    memory_type: string;
    title: string;
    content: string;
    confidence: number;
    created_at: string;
  }>;

  // Conversation history
  messages: Array<{ role: 'coach' | 'assistant'; content: string }>;
}
```

### RAG query for relevant memory
```typescript
// lib/intelligence/memory.ts
async function getRelevantMemory(
  teamId: string,
  question: string,
  limit = 5
): Promise<TeamMemory[]> {
  // 1. Embed the coach's question
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: question,
  });

  // 2. pgvector similarity search via Supabase RPC
  const { data } = await supabase.rpc('match_team_memory', {
    query_embedding: embedding.data[0].embedding,
    match_team_id: teamId,
    match_threshold: 0.75,
    match_count: limit,
  });

  return data ?? [];
}
```

```sql
-- Supabase RPC function for pgvector similarity search
create or replace function match_team_memory(
  query_embedding vector(1536),
  match_team_id uuid,
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  memory_type text,
  title text,
  content text,
  confidence numeric,
  created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    id, memory_type, title, content, confidence, created_at,
    1 - (embedding <=> query_embedding) as similarity
  from public.team_memory
  where team_id = match_team_id
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

### System prompt for A
```typescript
// lib/intelligence/playscoutiq-prompt.ts
export function buildPlayScoutIQSystemPrompt(ctx: PlayScoutIQContext): string {
  return `
You are PlayScoutIQ, the intelligence assistant for ${ctx.team.name}.

You are a youth football coaching expert with deep knowledge of:
- ${ctx.team.age_group} football tactics, assignments, and fundamentals
- Offensive and defensive scheme recognition
- Player development at the youth level
- Practice planning and drill selection
- Game-week preparation and opponent scouting

Your role:
- Answer coach questions using evidence from film analysis
- Recommend practice priorities based on what the film has shown
- Explain what tendencies and mistakes mean in plain coaching language
- Suggest game strategy grounded in observed evidence
- Be honest when evidence is limited or inconclusive

Rules:
1. Only make claims that are supported by the analysis data provided to you
2. Always cite your source: "Based on [X] plays analyzed..." or "The film showed..."
3. Never invent statistics, scores, or player performance not in your context
4. If you don't have enough evidence, say so and suggest what film to review next
5. Use simple coaching language — this platform serves volunteer youth coaches
6. Confidence matters: distinguish between "the film clearly shows" vs "it appears"
7. For rules or scheme questions outside the film data, say you're referencing general football knowledge

Current team context:
- Team: ${ctx.team.name}
- Age group: ${ctx.team.age_group}
- Season: ${ctx.team.season ?? 'current'}
- Offensive style: ${ctx.team.offensive_style ?? 'not specified'}
- Defensive style: ${ctx.team.defensive_style ?? 'not specified'}

Recent film analysis (${ctx.recentAnalysis.length} results):
${ctx.recentAnalysis.map(a =>
  `[${a.moduleKey}${a.player ? ` — ${a.player.name}` : ''}] Score: ${a.overall_score}/100 — ${a.summary}`
).join('\n')}

Observed tendencies (${ctx.tendencies.length} total):
${ctx.tendencies.map(t =>
  `${t.label} (confidence: ${t.confidence}, sample: ${t.sample_size} plays)`
).join('\n')}

Flagged mistakes (${ctx.mistakes.length} recent):
${ctx.mistakes.map(m =>
  `[${m.severity.toUpperCase()}] ${m.title} — ${m.description}`
).join('\n')}

Relevant memory from past analysis:
${ctx.relevantMemory.map(m =>
  `[${m.memory_type}] ${m.title}: ${m.content}`
).join('\n')}

Answer the coach's question based on this evidence.
`.trim();
}
```

### API route
```typescript
// app/api/playscoutiq/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildPlayScoutIQSystemPrompt } from '@/lib/intelligence/playscoutiq-prompt';
import { getRelevantMemory } from '@/lib/intelligence/memory';
import { getTeamContext } from '@/lib/db/queries';
import { PLAYSCOUTIQ_ROUTES } from '@/lib/ai/playscoutiq-router';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { teamId, messages, jobType = 'quick_question' } = await req.json();

  const lastMessage = messages[messages.length - 1].content;
  const route = PLAYSCOUTIQ_ROUTES[jobType];

  // Build context
  const [teamContext, relevantMemory] = await Promise.all([
    getTeamContext(teamId),           // pulls recent analysis, tendencies, mistakes
    getRelevantMemory(teamId, lastMessage),
  ]);

  const systemPrompt = buildPlayScoutIQSystemPrompt({
    ...teamContext,
    relevantMemory,
    messages: messages.slice(-10), // last 10 messages for context
  });

  // Stream response via Claude
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stream = await anthropic.messages.stream({
    model: route.model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'coach' ? 'user' : 'assistant',
      content: m.content,
    })),
  });

  // Return as SSE stream
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`));
        }
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### Component: PlayScoutIQ Chat Panel
```typescript
// components/intelligence/PlayScoutIQ.tsx
// Floating panel or sidebar chat
// Props: teamId, initialContext?
// Features:
//   - Streaming responses (SSE)
//   - Message history
//   - Suggested starter questions based on recent analysis
//   - "Based on X plays" citation chips
//   - Quick action buttons: "Generate practice plan", "Scout this week's opponent"
//   - Collapsible — doesn't block film analysis UI
//   - Gold (#d2c600) accent on assistant messages
//   - Navy (#485995) header
```

### Suggested starter questions (show when no messages yet)
Generate these dynamically based on what data the team has:
- "What should we work on at practice this week?"
- "What are our biggest tendencies on offense?"
- "Which players are struggling with their assignments?"
- "What mistakes keep showing up in our film?"
- "How do we attack a Cover 2 defense?"
- "Generate a practice plan for this Saturday"

---

## Files to Create

```
app/
  api/
    playscoutiq/
      chat/
        route.ts          # SSE streaming chat endpoint
    intelligence/
      analyze/
        route.ts          # VideoIQ frame analysis endpoint (System B)

components/
  intelligence/
    PlayScoutIQ.tsx       # Chat panel component
    PlayScoutIQMessage.tsx
    PlayScoutIQStarters.tsx  # Suggested questions

lib/
  intelligence/
    playscoutiq-prompt.ts   # System prompt builder
    memory.ts               # saveToTeamMemory + getRelevantMemory
  ai/
    playscoutiq-router.ts   # Job type → model routing

supabase/
  migrations/
    005_pgvector.sql        # Enable pgvector + match_team_memory RPC
```

---

## Migration: Enable pgvector

```sql
-- supabase/migrations/005_pgvector.sql

-- Enable pgvector extension
create extension if not exists vector;

-- Add match_team_memory RPC function
create or replace function match_team_memory(
  query_embedding vector(1536),
  match_team_id uuid,
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  memory_type text,
  title text,
  content text,
  confidence numeric,
  created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    id, memory_type, title, content, confidence, created_at,
    1 - (embedding <=> query_embedding) as similarity
  from public.team_memory
  where team_id = match_team_id
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

---

## New Environment Variables Required

```bash
# Already in Vercel — just need actual values:
OPENAI_API_KEY=           # Used for text-embedding-3-small (memory embeddings)
ANTHROPIC_API_KEY=        # Used for PlayScoutIQ chat (Sonnet + Opus)
GOOGLE_API_KEY=           # Used for VideoIQ frame analysis (Gemini 2.5 Pro)
GEMINI_API_KEY=           # Same key, different SDK entry point
PERPLEXITY_API_KEY=       # Used for football knowledge / rules questions
```

---

## Summary

| System | Role | Model | Input | Output |
|---|---|---|---|---|
| B — VideoIQ | Evidence engine | Gemini 2.5 Pro | 16 video frames | Structured JSON saved to DB |
| A — PlayScoutIQ | Intelligence assistant | Claude Sonnet/Opus 4 | DB results + team memory | Streaming coaching advice |
| Memory layer | RAG bridge | OpenAI embeddings | B's summaries | pgvector similarity search for A |
| Knowledge layer | Football Q&A | Perplexity sonar-pro | Coach questions | Rules, schemes, public football context |
