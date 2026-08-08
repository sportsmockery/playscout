// Belt-and-suspenders output filter. The prompts (football-brain.ts + each
// module's buildXIQSystemPrompt) already instruct the model never to
// recommend these drills, but a model can still slip — this scrubs the
// structured output before it ever reaches a coach, and logs when it had to.
//
// LEVEL-AWARE: at youth (or unknown) levels the prohibited collision drills are
// replaced outright. At high school (JV/varsity) they are kept but annotated
// with a hard NFHS/state contact-limit caution — matching football-brain.ts
// rule 13, which discourages them at all levels but doesn't ban them for HS.

import { isHighSchoolOrAbove, type LevelTier } from './levels'

const PROHIBITED_DRILLS: { pattern: RegExp; label: string }[] = [
  { pattern: /oklahoma\s*drill/i, label: 'Oklahoma drill' },
  { pattern: /bull(s)?\s*(in\s*(the\s*)?)?ring/i, label: 'Bull in the Ring' },
  { pattern: /nut\s*cracker/i, label: 'nutcracker drill' },
  { pattern: /board\s*(drill|collision)/i, label: 'board collision drill' },
]

const CONTACT_DRILL_PATTERNS: RegExp[] = [
  /full[\s-]?contact/i,
  /live\s*tackl/i,
  /\bthud\b/i,
  /\bcollision\b/i,
  /\b1[\s-]?on[\s-]?1\b.*\b(contact|live|tackl)/i,
  /(open|closed)[\s-]?field\s*tackl/i,
  /\blive\b.*\bblock/i,
]

const SAFE_TACKLING_ALTERNATIVE =
  'Form-tackling progression: walk-through -> bag/dummy -> controlled pursuit at half speed. No full-speed or live collision work.'

const SAFE_NON_CONTACT_ALTERNATIVE =
  'Non-contact fundamentals drill (angles, footwork, form, leverage) — full-speed contact is not appropriate at this level.'

const HS_COLLISION_CAUTION =
  ' — CAUTION (high school): only under NFHS/state contact-limit rules, with no full-speed head-on collisions and proper acclimatization. A technique-only progression (fit → track → break down → shadow finish) teaches the same thing more safely.'

export interface DrillSafetyResult {
  drills: string[]
  filtered: {
    original: string
    reason: 'prohibited_drill' | 'contact_at_non_tackle_level' | 'prohibited_drill_hs_caution'
  }[]
}

/**
 * Scrubs prohibited collision drills and, when gameType isn't 'tackle', contact
 * drills too. Level-aware: youth/unknown tiers get the prohibited drill replaced
 * with a safe alternative; high-school tiers keep it but with a hard NFHS
 * contact-limit caution appended. Replaces/annotates rather than silently
 * dropping, so a coach isn't left with an empty recommendation.
 */
export function applyDrillSafetyFilter(
  drills: string[],
  gameType?: string | null,
  tier: LevelTier = 'unknown'
): DrillSafetyResult {
  const filtered: DrillSafetyResult['filtered'] = []
  const hsCautionOnly = isHighSchoolOrAbove(tier)

  const afterProhibited = drills.map((drill) => {
    const hit = PROHIBITED_DRILLS.find((p) => p.pattern.test(drill))
    if (hit) {
      if (hsCautionOnly) {
        // High school: keep the drill, attach the contact-limit caution.
        filtered.push({ original: drill, reason: 'prohibited_drill_hs_caution' })
        return `${drill}${HS_COLLISION_CAUTION}`
      }
      filtered.push({ original: drill, reason: 'prohibited_drill' })
      return SAFE_TACKLING_ALTERNATIVE
    }
    return drill
  })

  const afterContact =
    gameType === 'tackle'
      ? afterProhibited
      : afterProhibited.map((drill, i) => {
          // Already replaced for being prohibited — don't double-flag.
          if (filtered.some((f) => f.original === drills[i])) return drill
          const hit = CONTACT_DRILL_PATTERNS.some((p) => p.test(drill))
          if (hit) {
            filtered.push({ original: drills[i], reason: 'contact_at_non_tackle_level' })
            return SAFE_NON_CONTACT_ALTERNATIVE
          }
          return drill
        })

  if (filtered.length) {
    console.warn('[safety] filtered drill recommendations', { gameType, filtered })
  }

  return { drills: afterContact, filtered }
}

/** Same denylist, applied to freeform correction/coaching text. */
export function scrubProhibitedDrillMentions(text: string): string {
  const hit = PROHIBITED_DRILLS.find((p) => p.pattern.test(text))
  if (!hit) return text
  console.warn('[safety] scrubbed prohibited drill mention', { label: hit.label })
  return text.replace(hit.pattern, SAFE_TACKLING_ALTERNATIVE)
}

// --- Chat output guard (Phase 3.5) ---------------------------------------

const SECRET_LIKE_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{20,}/,      // OpenAI/Anthropic-style API keys
  /sb_secret_[a-zA-Z0-9_-]{10,}/, // Supabase secret keys
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, // JWTs (service role/anon keys)
  /AIza[a-zA-Z0-9_-]{20,}/,   // Google API keys
  /pplx-[a-zA-Z0-9]{20,}/,    // Perplexity keys
]

const SYSTEM_PROMPT_LEAK_MARKERS = [
  'FOOTBALL_BRAIN_SYSTEM',
  'You are PlayScout Football Intelligence',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
]

export interface OutputGuardResult {
  safe: boolean
  text: string
  reasons: string[]
}

/**
 * Last-line check on an assembled System A chat response before it reaches
 * the client — redacts secret-shaped substrings and refuses outright if the
 * response looks like it echoed system-prompt internals (a successful
 * injection got the model to comply rather than refuse in-band).
 */
export function guardChatOutput(text: string): OutputGuardResult {
  const reasons: string[] = []
  let redacted = text

  for (const pattern of SECRET_LIKE_PATTERNS) {
    if (pattern.test(redacted)) {
      reasons.push('secret_like_pattern')
      redacted = redacted.replace(new RegExp(pattern, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'), '[redacted]')
    }
  }

  const leaked = SYSTEM_PROMPT_LEAK_MARKERS.some((marker) => text.includes(marker))
  if (leaked) {
    reasons.push('system_prompt_leak')
    return {
      safe: false,
      text: "I can't share my internal instructions. Ask me a football or coaching question instead.",
      reasons,
    }
  }

  if (reasons.length) {
    console.warn('[safety] redacted chat output', { reasons })
  }

  return { safe: reasons.length === 0, text: redacted, reasons }
}
