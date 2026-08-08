import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { anthropic } from '@/lib/ai/providers/anthropic';
import { callPerplexity } from '@/lib/ai/providers/perplexity';
import { buildPlayScoutIQPrompt, type ChatIntent } from '@/lib/intelligence/playscoutiq-prompt';
import { getRelevantMemory } from '@/lib/intelligence/memory';
import { classifyIntent } from '@/lib/intelligence/classify-intent';
import { getTeamContext } from '@/lib/db/queries';
import { getRoute } from '@/lib/ai/model-router';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { recordUsage } from '@/lib/ai/record-usage';
import { guardAIRequest } from '@/lib/ai/guard';
import { guardChatOutput } from '@/lib/intelligence/safety';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_MESSAGES = 50;
const MAX_HISTORY_DEPTH = 10;
const MAX_MESSAGE_LENGTH = 8000;

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { messages: rawMessages, teamId, context } = body as {
    messages: { role: 'user' | 'assistant'; content: string }[];
    teamId?: string;
    context?: { teamName?: string; ageGroup?: string };
  };

  if (!rawMessages || rawMessages.length === 0) {
    return new Response('messages required', { status: 400 });
  }
  if (rawMessages.length > MAX_MESSAGES) {
    return new Response('Too many messages in one request', { status: 400 });
  }
  if (rawMessages.some((m) => typeof m.content !== 'string' || m.content.length > MAX_MESSAGE_LENGTH)) {
    return new Response('A message is too long', { status: 400 });
  }
  // Defense-in-depth against a client sending an unbounded history to
  // inflate cost/context regardless of what the UI normally sends.
  const messages = rawMessages.slice(-MAX_HISTORY_DEPTH);

  // team_memory's RLS policy currently allows any same-org member to read
  // it (not scoped to per-team assignment like can_access_team), so this
  // explicit check is stricter than the DB floor by design — a coach
  // without access to a specific team shouldn't have that team's memory
  // (or any other team-scoped evidence) fed into a paid AI call just
  // because they're in the same org. Every context fetch below is scoped
  // to this server-verified teamId — never one the client/model could
  // substitute.
  if (teamId) {
    const access = await requireTeamMember(teamId);
    if (access.error) return access.error;
  }

  const blocked = await guardAIRequest(supabase, user.id, teamId);
  if (blocked) return blocked;

  // Resolve the team's level up front so EVERY answer — general or team-specific
  // — is calibrated to the real competition level (youth → varsity), not a youth
  // default.
  let teamName = context?.teamName;
  let teamAgeGroup = context?.ageGroup;
  let teamLevel: string | undefined;
  if (teamId) {
    const { data: t } = await supabase.from('teams').select('name, level, age_group').eq('id', teamId).maybeSingle();
    const trow = t as { name?: string; level?: string; age_group?: string } | null;
    if (trow) {
      teamName = teamName ?? trow.name ?? undefined;
      teamAgeGroup = teamAgeGroup ?? trow.age_group ?? undefined;
      teamLevel = trow.level ?? undefined;
    }
  }

  const latestUserMessage = messages[messages.length - 1].content;
  const classified = await classifyIntent(latestUserMessage);
  // No team selected — nothing to ground a team-specific answer in.
  const intent: ChatIntent = !teamId && classified === 'team_specific' ? 'general_scheme' : classified;

  // Pull RAG memory whenever a team is selected — useful context even for
  // non-team_specific questions (e.g. a coach note that changes the answer).
  let memoryContext = '';
  if (teamId) {
    try {
      const memories = await getRelevantMemory(teamId, latestUserMessage, 5);
      if (memories.length > 0) {
        memoryContext = memories
          .map((m: { memory_type?: string; content?: string }) => `[Memory ${m.memory_type}]: ${m.content}`)
          .join('\n');
      }
    } catch {
      // memory search non-critical
    }
  }

  let structuredContext: Awaited<ReturnType<typeof getTeamContext>> | undefined;
  if (teamId && intent === 'team_specific') {
    try {
      structuredContext = await getTeamContext(teamId);
    } catch (err) {
      console.error('[playscoutiq/chat] getTeamContext failed (non-blocking)', err);
    }
  }

  // Rules/compliance questions escalate to Perplexity for current,
  // web-grounded rules knowledge rather than Claude's static training data.
  let generalKnowledge = '';
  const rulesRoute = getRoute('football_knowledge');
  if (intent === 'rules_compliance') {
    try {
      generalKnowledge = await callPerplexity([
        {
          role: 'system',
          content:
            'Answer this youth football rules/compliance/safety question accurately and concisely. Cite governing bodies (USA Football, NFHS) where relevant. Always note that local league rules vary and the coach should confirm with their specific league.',
        },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ]);
      if (teamId) {
        await recordUsage(supabase, {
          teamId, userId: user.id, jobType: 'football_knowledge',
          provider: rulesRoute.provider, model: rulesRoute.model,
          inputTokens: 0, outputTokens: 0,
        });
      }
    } catch (err) {
      console.error('[playscoutiq/chat] Perplexity escalation failed (falling back to Claude general knowledge)', err);
    }
  }

  const systemPrompt = buildPlayScoutIQPrompt({
    teamName,
    ageGroup: teamAgeGroup,
    level: teamLevel,
    intent,
    structuredContext: structuredContext
      ? {
          recentAnalysis: structuredContext.recentAnalysis?.map((a) => ({
            module_key: a.module_key, overall_score: a.overall_score, summary: a.summary, created_at: a.created_at,
          })),
          tendencies: structuredContext.tendencies?.map((t) => ({
            tendency_type: t.tendency_type, label: t.label, value: t.value, sample_size: t.sample_size, confidence: t.confidence,
          })),
          mistakes: structuredContext.mistakes?.map((m) => ({
            title: m.title, severity: m.severity, category: m.category, description: m.description, correction: m.correction,
          })),
        }
      : undefined,
    memoryContext,
    generalKnowledge: generalKnowledge || undefined,
  });

  // SSE streaming response
  const route = intent === 'practice_plan' || intent === 'game_strategy' ? getRoute(intent) : getRoute('quick_question');
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let inputTokens = 0;
      let outputTokens = 0;
      let accumulated = '';
      let redacted = false;

      try {
        const response = await anthropic.messages.create({
          model: route.model,
          max_tokens: 2048,
          system: systemPrompt,
          messages: messages.map((m: { role: 'user' | 'assistant'; content: string }) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
        });

        for await (const event of response) {
          if (event.type === 'message_start') {
            inputTokens = event.message.usage.input_tokens;
          }
          if (event.type === 'message_delta') {
            outputTokens = event.usage.output_tokens;
          }
          if (
            !redacted &&
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            accumulated += event.delta.text;
            // Belt-and-suspenders output guard, checked incrementally so a
            // leak is cut off as soon as it's detectable rather than only
            // after the whole response has already reached the client.
            const guard = guardChatOutput(accumulated);
            if (!guard.safe) {
              redacted = true;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'redacted', text: guard.text })}\n\n`));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
              break;
            }
            const data = JSON.stringify({ type: 'delta', text: event.delta.text });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
          if (!redacted && event.type === 'message_stop') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          }
        }

        // No teamId means a general (no-team-context) chat — there's no
        // team to attribute the cost to, so this usage goes untracked
        // rather than guessing an organization.
        if (teamId) {
          await recordUsage(supabase, {
            teamId, userId: user.id, jobType: 'quick_question',
            provider: route.provider, model: route.model, inputTokens, outputTokens,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error';
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
