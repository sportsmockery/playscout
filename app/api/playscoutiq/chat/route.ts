import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { anthropic } from '@/lib/ai/providers/anthropic';
import { buildPlayScoutIQPrompt } from '@/lib/intelligence/playscoutiq-prompt';
import { getRelevantMemory } from '@/lib/intelligence/memory';
import { getRoute } from '@/lib/ai/model-router';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { messages, teamId, context } = body as {
    messages: { role: 'user' | 'assistant'; content: string }[];
    teamId?: string;
    context?: {
      teamName?: string;
      ageGroup?: string;
      recentAnalysis?: string;
    };
  };

  if (!messages || messages.length === 0) {
    return new Response('messages required', { status: 400 });
  }

  // Pull RAG memory if teamId provided
  let memoryContext = '';
  if (teamId) {
    const latestUserMessage = messages[messages.length - 1].content;
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

  const systemPrompt = buildPlayScoutIQPrompt({
    teamName: context?.teamName,
    ageGroup: context?.ageGroup,
    recentAnalysis: context?.recentAnalysis,
    memoryContext,
  });

  // SSE streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.create({
          model: getRoute('quick_question').model,
          max_tokens: 2048,
          system: systemPrompt,
          messages: messages.map((m: { role: 'user' | 'assistant'; content: string }) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
        });

        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const data = JSON.stringify({ type: 'delta', text: event.delta.text });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
          if (event.type === 'message_stop') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          }
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
