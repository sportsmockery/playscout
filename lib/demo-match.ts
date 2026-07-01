import { DEMO_CONVERSATIONS, type DemoConversation } from '@/lib/content/demo-data'

const UNSAFE_DRILL_KEYWORDS = [
  'oklahoma drill',
  'oklahoma',
  'bull in the ring',
  'bull ring',
  'board drill',
  'gauntlet drill',
]

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
}

function scoreOverlap(a: string[], b: string[]): number {
  const setB = new Set(b)
  let hits = 0
  for (const word of a) {
    if (setB.has(word)) hits++
  }
  return hits / Math.max(a.length, 1)
}

/**
 * Finds the closest pre-built demo conversation for free-text input.
 * Safety keywords always win regardless of match score — PlayScout never
 * lets a fuzzy match bypass the prohibited-drill rule. Falls back to the
 * clarifying-question conversation when nothing scores confidently, since
 * asking for missing context is always safer than guessing.
 */
export function matchDemoConversation(input: string): DemoConversation {
  const normalizedInput = normalize(input)

  const lowerInput = input.toLowerCase()
  if (UNSAFE_DRILL_KEYWORDS.some((kw) => lowerInput.includes(kw))) {
    return DEMO_CONVERSATIONS.find((c) => c.id === 'unsafe-drill-refusal')!
  }

  let best: DemoConversation | null = null
  let bestScore = 0

  for (const conversation of DEMO_CONVERSATIONS) {
    const firstCoachMessage = conversation.messages.find((m) => m.role === 'coach')?.text ?? ''
    const candidateWords = normalize(`${conversation.label} ${firstCoachMessage}`)
    const score = scoreOverlap(normalizedInput, candidateWords)
    if (score > bestScore) {
      bestScore = score
      best = conversation
    }
  }

  const CONFIDENCE_THRESHOLD = 0.2
  if (best && bestScore >= CONFIDENCE_THRESHOLD) {
    return best
  }

  return DEMO_CONVERSATIONS.find((c) => c.id === 'vague-question')!
}
